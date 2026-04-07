"""
AI code generation service for the App Builder.
Streams NDJSON events as code is generated.

Architecture:
  Phase 1 — Plan: Quick OpenAI call to decide which files to create/modify.
  Phase 2 — Generate: Parallel OpenAI calls, one per file.
  Phase 3 — Assemble: Save version, emit completion events.
  Fallback — If planning fails, falls back to sequential streaming.
"""
import asyncio
import json
import logging
from typing import AsyncGenerator

from openai import AsyncOpenAI

from lib.openai_client import get_async_openai_client
from api.services.chat.events import (
    content_event,
    status_event,
    error_event,
    done_event,
    ping_event,
)
from api.services.builder.prompts import (
    build_react_native_system_prompt,
    build_plan_prompt,
    build_file_prompt,
)
from api.services.builder.projects import (
    get_conversation,
    add_message,
    create_version,
    get_versions,
)

logger = logging.getLogger(__name__)

MODEL = "gpt-5.4-mini"


# ── Event helpers ────────────────────────────────────────


def builder_file_event(path: str, content: str, action: str = "create") -> str:
    return json.dumps({
        "type": "builder_file",
        "path": path,
        "content": content,
        "action": action,
    }, ensure_ascii=False) + "\n"


def builder_plan_event(plan: str) -> str:
    return json.dumps({
        "type": "builder_plan",
        "plan": plan,
    }, ensure_ascii=False) + "\n"


def builder_complete_event(version_id: str, file_count: int) -> str:
    return json.dumps({
        "type": "builder_complete",
        "version_id": version_id,
        "file_count": file_count,
    }, ensure_ascii=False) + "\n"


# ── Phase 1: Planning ───────────────────────────────────


async def _get_plan(
    client: AsyncOpenAI,
    chat_messages: list,
    current_file_tree: dict,
) -> dict:
    """Ask OpenAI for a JSON plan of files to generate."""
    system = build_plan_prompt(current_file_tree)

    response = await client.chat.completions.create(
        model=MODEL,
        max_tokens=2000,
        messages=[{"role": "system", "content": system}] + chat_messages,
    )

    text = response.choices[0].message.content.strip()
    # Strip markdown fences if present
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()

    plan = json.loads(text)
    if "files" not in plan or not isinstance(plan["files"], list):
        raise ValueError("Plan missing 'files' array")
    return plan


# ── Phase 2: Parallel file generation ───────────────────


async def _generate_file(
    client: AsyncOpenAI,
    file_path: str,
    file_description: str,
    all_files_plan: list,
    current_file_tree: dict,
) -> tuple[str, str]:
    """Generate a single file. Returns (path, content)."""
    system = build_file_prompt(file_path, file_description, all_files_plan, current_file_tree)

    response = await client.chat.completions.create(
        model=MODEL,
        max_tokens=4000,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": f"Generate {file_path}"},
        ],
    )

    content = response.choices[0].message.content.strip()
    # Strip markdown fences if Claude wraps the output anyway
    if content.startswith("```"):
        first_newline = content.index("\n") if "\n" in content else len("```")
        content = content[first_newline + 1:]
        if content.endswith("```"):
            content = content[:-3].rstrip()

    return file_path, content


# ── Fallback: Sequential streaming ──────────────────────


async def _sequential_generation(
    client: AsyncOpenAI,
    project_id: str,
    conversation_id: str,
    current_file_tree: dict,
    chat_messages: list,
    message: str,
    jwt: str,
) -> AsyncGenerator[str, None]:
    """Original sequential approach — used as fallback when planning fails."""
    system_prompt = build_react_native_system_prompt(current_file_tree)
    accumulated_text = ""
    file_tree = dict(current_file_tree)

    stream = await client.chat.completions.create(
        model=MODEL,
        max_tokens=16000,
        messages=[{"role": "system", "content": system_prompt}] + chat_messages,
        stream=True,
    )
    async for chunk in stream:
        delta = chunk.choices[0].delta if chunk.choices else None
        if delta and delta.content:
            text = delta.content
            accumulated_text += text
            yield content_event(text)

            # Parse file blocks as they complete
            while "```file:" in accumulated_text:
                file_start = accumulated_text.index("```file:")
                remaining = accumulated_text[file_start:]
                close_idx = remaining.find("\n```\n", len("```file:"))
                if close_idx == -1:
                    close_idx = remaining.find("\n```", len("```file:"))
                    if close_idx == -1 or close_idx + 4 < len(remaining):
                        break

                header_end = remaining.index("\n")
                file_path = remaining[len("```file:"):header_end].strip()
                file_content = remaining[header_end + 1:close_idx]

                action = "update" if file_path in file_tree else "create"
                file_tree[file_path] = file_content
                yield builder_file_event(file_path, file_content, action)

                end_of_block = file_start + close_idx + 4
                accumulated_text = accumulated_text[:file_start] + accumulated_text[end_of_block:]

    if file_tree:
        version = create_version(project_id, conversation_id, file_tree, message, jwt)
        yield builder_complete_event(version["id"], len(file_tree))
        assistant_msg = add_message(
            conversation_id, "assistant", accumulated_text, version["id"], jwt
        )
        yield done_event(assistant_msg["id"])
    else:
        assistant_msg = add_message(
            conversation_id, "assistant", accumulated_text, None, jwt
        )
        yield done_event(assistant_msg["id"])


# ── Main entry point ────────────────────────────────────


async def stream_generation(
    project_id: str,
    project: dict,
    message: str,
    jwt: str,
) -> AsyncGenerator[str, None]:
    """
    Stream code generation for a builder project.
    Uses plan → parallel generation → assemble for speed.
    Falls back to sequential streaming if planning fails.
    """
    try:
        yield ping_event()

        # Setup: conversation + history
        messages_data, conversation_id = get_conversation(project_id, jwt)
        if not conversation_id:
            yield error_event("No conversation found for project")
            return

        user_msg = add_message(conversation_id, "user", message, None, jwt)
        yield ping_event()

        versions = get_versions(project_id, jwt)
        current_file_tree = versions[0]["file_tree"] if versions else {}

        # Build message history
        chat_messages = []
        for msg in messages_data:
            if msg["id"] == user_msg["id"]:
                continue
            chat_messages.append({
                "role": msg["role"],
                "content": msg["content"],
            })
        chat_messages.append({"role": "user", "content": message})

        client = get_async_openai_client()

        # ── Phase 1: Plan ──
        yield status_event("Planning...")
        try:
            plan = await _get_plan(client, chat_messages, current_file_tree)
        except Exception as e:
            logger.warning(f"Planning failed, falling back to sequential: {e}")
            yield status_event("Generating code...")
            async for evt in _sequential_generation(
                client, project_id, conversation_id,
                current_file_tree, chat_messages, message, jwt,
            ):
                yield evt
            return

        explanation = plan.get("explanation", "")
        files_to_generate = plan.get("files", [])

        if explanation:
            yield content_event(explanation)

        if not files_to_generate:
            # Conversational response only — fall back to sequential
            yield status_event("Generating response...")
            async for evt in _sequential_generation(
                client, project_id, conversation_id,
                current_file_tree, chat_messages, message, jwt,
            ):
                yield evt
            return

        yield builder_plan_event(json.dumps({
            "files": [f["path"] for f in files_to_generate],
        }))

        # ── Phase 2: Generate files in parallel ──
        yield status_event("Generating code...")
        file_tree = dict(current_file_tree)

        tasks = [
            _generate_file(
                client, f["path"], f["description"],
                files_to_generate, current_file_tree,
            )
            for f in files_to_generate
        ]

        for coro in asyncio.as_completed(tasks):
            try:
                path, content = await coro
                action = "update" if path in current_file_tree else "create"
                file_tree[path] = content
                yield builder_file_event(path, content, action)
                yield status_event(f"Generated {path}")
            except Exception as e:
                logger.error(f"Failed to generate file: {e}", exc_info=True)
                yield status_event("Error generating file")

        # ── Phase 3: Assemble ──
        if len(file_tree) > len(current_file_tree):
            version = create_version(
                project_id, conversation_id, file_tree, message, jwt,
            )
            yield builder_complete_event(version["id"], len(file_tree))

            assistant_msg = add_message(
                conversation_id, "assistant", explanation, version["id"], jwt,
            )
            yield done_event(assistant_msg["id"])
        else:
            assistant_msg = add_message(
                conversation_id, "assistant",
                explanation or "I couldn't generate any files for that request.",
                None, jwt,
            )
            yield done_event(assistant_msg["id"])

    except Exception as e:
        logger.error(f"Generation error: {e}", exc_info=True)
        yield error_event(str(e))
