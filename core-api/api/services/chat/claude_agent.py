"""
Chat agent streaming response handler using OpenAI.

Streams responses via NDJSON events, handles tool calling with parallel
execution, and image attachments.
"""

from typing import List, Dict, AsyncGenerator, Optional, Any
import json
import logging
import uuid
import base64
import asyncio
import time
from openai import APIStatusError
from lib.openai_client import get_async_openai_client
from api.services.chat.events import (
    content_event, action_event, display_event, ping_event,
    done_event, sources_event, status_event,
    tool_call_start_event, tool_call_end_event, tool_exchange_event
)
from api.services.chat.prompts import build_system_prompt
from lib.tools import ToolRegistry, ToolContext
from lib.r2_client import get_r2_client

# Import definitions to register all tools
import lib.tools.definitions  # noqa: F401

logger = logging.getLogger(__name__)

# Limits
TOOL_EXECUTION_TIMEOUT_S = 30
MAX_TOOL_RESULT_CHARS = 4000
MAX_CONTEXT_CHARS = 100000
MAX_RETRIES = 3
RETRY_DELAY_S = 1.0

# Transient HTTP status codes worth retrying
_TRANSIENT_STATUS_CODES = {429, 500, 502, 503}

def _truncate_tool_result(result_str: str, max_chars: int = MAX_TOOL_RESULT_CHARS) -> str:
    """Truncate a tool result string to avoid blowing the context window."""
    if len(result_str) <= max_chars:
        return result_str
    return result_str[:max_chars] + "... [truncated]"


def _fetch_image_sync(r2_key: str) -> Optional[bytes]:
    """Synchronous helper to fetch image from R2 (runs in thread pool)."""
    try:
        r2_client = get_r2_client()
        response = r2_client.s3_client.get_object(
            Bucket=r2_client.bucket_name,
            Key=r2_key
        )
        return response['Body'].read()
    except Exception as e:
        logger.error(f"Failed to fetch image from R2: {r2_key}, error: {e}")
        return None


async def _fetch_image_as_base64(r2_key: str) -> Optional[str]:
    """Fetch an image from R2 and return as base64 string."""
    try:
        t0 = time.time()
        image_data = await asyncio.to_thread(_fetch_image_sync, r2_key)
        t1 = time.time()
        if image_data is None:
            return None
        encoded = base64.b64encode(image_data).decode('utf-8')
        t2 = time.time()
        size_kb = len(image_data) / 1024
        logger.info(f"[TIMING] R2 fetch: {(t1-t0)*1000:.0f}ms, base64 encode: {(t2-t1)*1000:.0f}ms, size: {size_kb:.0f}KB")
        return encoded
    except Exception as e:
        logger.error(f"Failed to fetch/encode image: {r2_key}, error: {e}")
        return None


async def _prepare_image_attachments(
    attachments: List[Dict[str, Any]]
) -> tuple[List[Dict[str, Any]], List[str]]:
    """
    Fetch image attachments from R2 and prepare OpenAI content blocks.

    Returns:
        Tuple of (image_blocks, base64_images)
    """
    image_attachments = [
        att for att in attachments
        if att.get("mime_type", "").startswith("image/")
    ]

    if not image_attachments:
        return [], []

    # Fetch ALL images in parallel
    t_start = time.time()
    logger.info(f"[TIMING] Starting to fetch {len(image_attachments)} images in parallel...")
    fetch_tasks = [_fetch_image_as_base64(att["r2_key"]) for att in image_attachments]
    base64_results = await asyncio.gather(*fetch_tasks, return_exceptions=True)
    t_end = time.time()
    logger.info(f"[TIMING] All images fetched + encoded in {(t_end-t_start)*1000:.0f}ms total")

    image_blocks = []
    valid_base64_images = []
    for att, base64_result in zip(image_attachments, base64_results):
        if isinstance(base64_result, Exception):
            logger.error(f"Failed to fetch image {att.get('filename', 'unknown')}: {base64_result}")
            continue
        if base64_result is None:
            continue

        valid_base64_images.append(base64_result)
        # OpenAI image format
        image_blocks.append({
            "type": "image_url",
            "image_url": {
                "url": f"data:{att['mime_type']};base64,{base64_result}",
            }
        })
        logger.info(f"Added image to message: {att.get('filename', 'unknown')}")

    return image_blocks, valid_base64_images


def _prepare_messages(messages: List[Dict]) -> List[Dict]:
    """
    Prepare message history for OpenAI format.
    Messages are already in OpenAI format, just pass through.
    Filter out system messages (handled separately).
    """
    prepared = []
    for msg in messages:
        role = msg.get("role", "")
        if role == "system":
            continue
        prepared.append(msg)
    return prepared


async def get_user_connections(user_id: str, user_jwt: str) -> List[str]:
    """Get list of connected providers for a user."""
    try:
        from lib.supabase_client import get_authenticated_async_client
        supabase = await get_authenticated_async_client(user_jwt)
        result = await supabase.table("ext_connections") \
            .select("provider") \
            .eq("user_id", user_id) \
            .eq("is_active", True) \
            .execute()
        providers = list({row["provider"] for row in (result.data or [])})
        if providers:
            return providers
        return []
    except Exception as e:
        logger.warning(f"[CHAT] Failed to fetch ext_connections for user {user_id}: {e}")
        return []


DEFAULT_CHAT_MODEL = "gpt-5.4-mini"
DEV_AGENT_MODEL = "gpt-5.3-codex"

# Agents that should use the Codex model (gpt-5.3-codex) instead of gpt-5.4-mini
DEV_AGENT_NAMES = {"pulse agent", "odoopulse", "odoo developer", "lexy dev"}


async def stream_chat_response(
    messages: List[Dict],
    user_id: str,
    user_jwt: str,
    context: Optional[Dict[str, Any]] = None,
    user_timezone: str = "UTC",
    attachments: Optional[List[Dict[str, Any]]] = None,
    workspace_ids: Optional[List[str]] = None,
    is_disconnected: Optional[Any] = None,
    agent_model: Optional[str] = None,
) -> AsyncGenerator[str, None]:
    """
    Stream chat response from OpenAI, handling tool calls.
    Yields NDJSON event chunks.
    """
    client = get_async_openai_client()

    # Default to all user's workspaces if none specified
    if not workspace_ids:
        try:
            from lib.supabase_client import get_authenticated_async_client
            supabase = await get_authenticated_async_client(user_jwt)
            ws_result = await supabase.table("workspace_members").select("workspace_id").eq("user_id", user_id).execute()
            workspace_ids = [row["workspace_id"] for row in (ws_result.data or [])]
            logger.info(f"[CHAT] Defaulting to all {len(workspace_ids)} workspaces for user {user_id}")
        except Exception as e:
            logger.warning(f"[CHAT] Failed to fetch default workspaces: {e}")

    # Build system prompt with user preferences, context, and timezone
    system_prompt = await build_system_prompt(user_id, user_jwt, context, user_timezone, workspace_ids)

    # Sliding window: limit by character count (conservative proxy for tokens)
    total_chars = 0
    recent_messages = []

    for msg in reversed(messages):
        msg_chars = len(json.dumps(msg))
        if total_chars + msg_chars > MAX_CONTEXT_CHARS:
            break
        recent_messages.insert(0, msg)
        total_chars += msg_chars

    # Handle image attachments
    image_blocks: List[Dict[str, Any]] = []

    if attachments and recent_messages:
        image_blocks, _ = await _prepare_image_attachments(attachments)

        if image_blocks:
            yield status_event("Processing images...")

    # Build the last user message with images (OpenAI format)
    if image_blocks:
        for i in range(len(recent_messages) - 1, -1, -1):
            if recent_messages[i].get("role") == "user":
                original_text = recent_messages[i].get("content", "")
                content_parts = image_blocks.copy()
                if original_text:
                    content_parts.append({"type": "text", "text": original_text})
                recent_messages[i] = {
                    "role": "user",
                    "content": content_parts
                }
                break

    # Prepare messages (already in OpenAI format)
    chat_messages = _prepare_messages(recent_messages)

    # Prepend system message
    openai_messages = [{"role": "system", "content": system_prompt}] + chat_messages

    # Get user's connected services for tool filtering
    ext_connections = await get_user_connections(user_id, user_jwt)
    tools = ToolRegistry.get_openai_tools(ext_connections)

    tool_context = ToolContext(
        user_id=user_id,
        user_jwt=user_jwt,
        user_timezone=user_timezone,
        ext_connections=ext_connections,
        workspace_ids=workspace_ids,
    )

    pending_actions = []
    queued_display_events: List[str] = []
    queued_sources_events: List[str] = []

    while True:
        # Check if client disconnected before starting a new API call
        if is_disconnected and await is_disconnected():
            logger.info("[CHAT] Client disconnected, aborting stream")
            return

        t_api_start = time.time()
        effective_model = agent_model or DEFAULT_CHAT_MODEL
        logger.info(f"[TIMING] Starting OpenAI API call (model: {effective_model})")

        # Stream from OpenAI with retry on transient errors
        collected_text = ""
        collected_tool_calls: List[Dict[str, Any]] = []
        # Track tool call assembly from streaming chunks
        tool_call_buffers: Dict[int, Dict[str, str]] = {}
        first_token_logged = False

        last_error: Optional[Exception] = None
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                stream = await client.chat.completions.create(
                    model=effective_model,
                    max_tokens=25000,
                    messages=openai_messages,
                    tools=tools if tools else None,
                    stream=True,
                )

                async for chunk in stream:
                    if not chunk.choices:
                        continue

                    delta = chunk.choices[0].delta

                    if not first_token_logged and (delta.content or delta.tool_calls):
                        t_first = time.time()
                        logger.info(f"[TIMING] Time-to-first-token: {(t_first-t_api_start)*1000:.0f}ms")
                        first_token_logged = True

                    # Text content
                    if delta.content:
                        collected_text += delta.content
                        yield content_event(delta.content)

                    # Tool calls (streamed incrementally)
                    if delta.tool_calls:
                        for tc_delta in delta.tool_calls:
                            idx = tc_delta.index
                            if idx not in tool_call_buffers:
                                tool_call_buffers[idx] = {
                                    "id": tc_delta.id or "",
                                    "name": "",
                                    "arguments": "",
                                }
                            buf = tool_call_buffers[idx]
                            if tc_delta.id:
                                buf["id"] = tc_delta.id
                            if tc_delta.function:
                                if tc_delta.function.name:
                                    buf["name"] = tc_delta.function.name
                                if tc_delta.function.arguments:
                                    buf["arguments"] += tc_delta.function.arguments

                last_error = None
                break  # Success

            except APIStatusError as e:
                last_error = e
                is_transient = e.status_code in _TRANSIENT_STATUS_CODES
                if is_transient and attempt < MAX_RETRIES:
                    delay = RETRY_DELAY_S * attempt
                    logger.warning(f"[CHAT] OpenAI API error (status={e.status_code}), retrying in {delay}s (attempt {attempt}/{MAX_RETRIES})")
                    await asyncio.sleep(delay)
                    collected_text = ""
                    tool_call_buffers = {}
                    continue
                raise

        if last_error:
            raise last_error

        # Assemble collected tool calls
        for idx in sorted(tool_call_buffers.keys()):
            buf = tool_call_buffers[idx]
            try:
                tool_input = json.loads(buf["arguments"]) if buf["arguments"] else {}
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse tool JSON for {buf['name']}: {e}")
                tool_input = {}
            collected_tool_calls.append({
                "id": buf["id"],
                "name": buf["name"],
                "input": tool_input,
            })

        # Flush queued events from previous tool iteration
        for ev in queued_display_events:
            yield ev
        queued_display_events = []

        for ev in queued_sources_events:
            yield ev
        queued_sources_events = []

        # Process tool calls
        if collected_tool_calls:
            # Build assistant message in OpenAI format
            assistant_msg: Dict[str, Any] = {"role": "assistant", "content": collected_text or None}
            assistant_msg["tool_calls"] = [
                {
                    "id": tu["id"],
                    "type": "function",
                    "function": {
                        "name": tu["name"],
                        "arguments": json.dumps(tu["input"]),
                    },
                }
                for tu in collected_tool_calls
            ]
            openai_messages.append(assistant_msg)

            # Emit tool_call start events for all tools
            for tu in collected_tool_calls:
                yield tool_call_start_event(tu["name"], tu["input"])

            yield ping_event()

            # Execute all tools in parallel with timeout
            async def _timed_execute(tu: Dict) -> tuple[Any, int]:
                t0 = time.time()
                try:
                    result = await asyncio.wait_for(
                        ToolRegistry.execute(tu["name"], tu["input"], tool_context),
                        timeout=TOOL_EXECUTION_TIMEOUT_S,
                    )
                except asyncio.TimeoutError:
                    from lib.tools.base import ToolResult as TR
                    result = TR(status="error", data={"error": f"Tool '{tu['name']}' timed out after {TOOL_EXECUTION_TIMEOUT_S}s"})
                duration_ms = int((time.time() - t0) * 1000)
                return result, duration_ms

            tasks = [_timed_execute(tu) for tu in collected_tool_calls]
            timed_results = await asyncio.gather(*tasks, return_exceptions=True)

            # Process results and build tool result messages
            for tu, timed_result in zip(collected_tool_calls, timed_results):
                if isinstance(timed_result, Exception):
                    logger.error(f"Tool {tu['name']} raised exception: {timed_result}")
                    tool_result_str = json.dumps({"status": "error", "error": str(timed_result)})
                    openai_messages.append({
                        "role": "tool",
                        "tool_call_id": tu["id"],
                        "content": _truncate_tool_result(tool_result_str),
                    })
                    yield tool_call_end_event(tu["name"], 0, "error")
                    continue

                result, duration_ms = timed_result
                tool_result_str = result.to_json_string()

                if result.status == "error":
                    logger.warning(f"Tool {tu['name']} returned error: {result.data}")
                    yield tool_call_end_event(tu["name"], duration_ms, "error")
                elif result.status == "staged":
                    action_id = str(uuid.uuid4()).upper()
                    pending_actions.append(action_event(
                        action_id=action_id,
                        action=result.data.get("action", ""),
                        data=result.data,
                        description=result.description or ""
                    ))
                    yield tool_call_end_event(tu["name"], duration_ms, "staged")
                elif result.status == "success":
                    if result.display_type and result.display_items:
                        queued_display_events.append(display_event(
                            display_type=result.display_type,
                            items=result.display_items,
                            total_count=result.display_total or len(result.display_items)
                        ))
                    if result.sources:
                        queued_sources_events.append(sources_event(result.sources))
                    yield tool_call_end_event(tu["name"], duration_ms, "success")

                # Truncate tool result before adding to context
                truncated_result_str = _truncate_tool_result(tool_result_str)

                openai_messages.append({
                    "role": "tool",
                    "tool_call_id": tu["id"],
                    "content": truncated_result_str,
                })

                # Yield full tool exchange for persistence (not truncated)
                yield tool_exchange_event(tu["id"], tu["name"], tu["input"], tool_result_str)

            # Reset for next iteration
            collected_text = ""
            continue

        else:
            # No tool calls — stream is complete
            for action in pending_actions:
                yield action

            yield done_event()
            break
