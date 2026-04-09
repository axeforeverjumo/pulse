"""
PulseMark chat service — OpenAI streaming + function calling loop.

Handles:
- Conversation persistence per (workspace, site, user)
- System prompt with live marketing context
- Streaming SSE responses
- Tool call execution loop
"""
import logging
import json
from typing import Dict, Any, List, Optional, AsyncIterator

from openai import AsyncOpenAI

from lib.supabase_client import get_authenticated_async_client, get_service_role_client
from api.config import settings
from api.services.marketing.pulsemark_tools import (
    PULSEMARK_TOOLS_SCHEMA,
    ToolContext,
    execute_tool,
)

logger = logging.getLogger(__name__)

_openai_client: Optional[AsyncOpenAI] = None


def _get_openai_client() -> AsyncOpenAI:
    global _openai_client
    if _openai_client is None:
        _openai_client = AsyncOpenAI(api_key=settings.openai_api_key)
    return _openai_client


PULSEMARK_MODEL = "gpt-5.4-mini"

PULSEMARK_SYSTEM_BASE = """Eres PulseMark, el agente de marketing digital operativo de Pulse.

Trabajas dentro del modulo Marketing de Pulse y tienes herramientas reales para:
- Analizar y mejorar el SEO (audits, keywords, PageSpeed)
- Consultar y gestionar Google Analytics 4, Search Console, Tag Manager
- Crear y gestionar tareas de marketing (concretas y rutinarias)
- Modificar el codigo del sitio (leer/editar archivos del repo, desplegar a staging y despues a produccion)

REGLAS:
1. Cuando el usuario pregunta algo, usa las herramientas para obtener datos reales. No inventes datos.
2. Antes de ejecutar cualquier herramienta de ESCRITURA (crear tag GTM, editar repo, deploy, submit sitemap, etc.), SIEMPRE explica claramente lo que vas a hacer y pide confirmacion al usuario.
3. Las herramientas de LECTURA se ejecutan sin pedir permiso.
4. Cuando hagas cambios en codigo, deploya SIEMPRE primero a staging con deploy_to_staging, y espera la validacion del usuario antes de promote_staging_to_prod.
5. Usa add_task_comment para dejar constancia en las tareas de lo que vas haciendo.
6. Habla en espanol, con tono profesional pero cercano. Se directo y orientado a resultados.
7. Si el usuario te pide algo que necesita una herramienta que falla (ej. GA4 no configurado), dile exactamente que falta configurar y donde (ej. "ve al tab Resumen y selecciona la propiedad GA4").

IDIOMA: Espanol, sin emojis, directo.
"""


async def get_or_create_conversation(
    workspace_id: str,
    site_id: Optional[str],
    user_id: str,
    user_jwt: str,
) -> Dict[str, Any]:
    """Get existing conversation or create a new one."""
    supabase = await get_authenticated_async_client(user_jwt)

    # site_id can be None for global workspace chat
    query = supabase.table("marketing_conversations")\
        .select("*")\
        .eq("workspace_id", workspace_id)\
        .eq("user_id", user_id)
    if site_id:
        query = query.eq("site_id", site_id)
    else:
        query = query.is_("site_id", "null")

    result = await query.limit(1).execute()
    if result.data:
        return result.data[0]

    create_result = await supabase.table("marketing_conversations").insert({
        "workspace_id": workspace_id,
        "site_id": site_id,
        "user_id": user_id,
    }).execute()
    return create_result.data[0]


async def get_conversation_history(conversation_id: str, user_jwt: str, limit: int = 50) -> List[Dict[str, Any]]:
    supabase = await get_authenticated_async_client(user_jwt)
    result = await supabase.table("marketing_messages")\
        .select("*")\
        .eq("conversation_id", conversation_id)\
        .order("created_at")\
        .limit(limit)\
        .execute()
    return result.data or []


async def save_message(
    conversation_id: str,
    workspace_id: str,
    role: str,
    content: Optional[str],
    user_jwt: str,
    user_id: Optional[str] = None,
    tool_calls: Optional[list] = None,
    tool_call_id: Optional[str] = None,
    tool_name: Optional[str] = None,
) -> Dict[str, Any]:
    supabase = await get_authenticated_async_client(user_jwt)
    result = await supabase.table("marketing_messages").insert({
        "conversation_id": conversation_id,
        "workspace_id": workspace_id,
        "role": role,
        "content": content,
        "user_id": user_id,
        "tool_calls": tool_calls or [],
        "tool_call_id": tool_call_id,
        "tool_name": tool_name,
    }).execute()

    # Update conversation last_message_at
    await supabase.table("marketing_conversations")\
        .update({"last_message_at": "now()"})\
        .eq("id", conversation_id)\
        .execute()

    return result.data[0]


async def build_system_prompt(site: Optional[Dict[str, Any]], user_id: str, user_jwt: str) -> str:
    """Build system prompt with live marketing context."""
    prompt = PULSEMARK_SYSTEM_BASE + "\n\n"

    if not site:
        prompt += "CONTEXTO: Estas en el dashboard de Marketing del workspace, sin ningun sitio seleccionado. Solo puedes leer datos, no ejecutar acciones de escritura. Sugiere al usuario que seleccione un sitio para trabajar.\n"
        return prompt

    prompt += f"=== SITIO ACTIVO ===\n"
    prompt += f"Nombre: {site.get('name')}\n"
    prompt += f"Dominio: {site.get('domain')}\n"
    prompt += f"URL: {site.get('url')}\n"
    prompt += f"Tipo: {site.get('site_type', 'custom')}\n"

    prompt += "\n=== INTEGRACIONES ===\n"
    prompt += f"Google Analytics 4: {'CONFIGURADO (' + site.get('ga4_property_id', '') + ')' if site.get('ga4_property_id') else 'NO CONFIGURADO'}\n"
    prompt += f"Search Console: {'CONFIGURADO (' + site.get('gsc_site_url', '') + ')' if site.get('gsc_site_url') else 'NO CONFIGURADO'}\n"
    prompt += f"Repositorio: {site.get('repository_full_name') or 'NO CONFIGURADO'}\n"
    prompt += f"Servidor: {site.get('server_ip') or 'NO CONFIGURADO'}\n"

    if site.get("last_audit_score") is not None:
        prompt += f"\n=== SEO ===\n"
        prompt += f"Ultimo SEO score: {site.get('last_audit_score')}/100\n"
        prompt += f"Ultimo audit: {site.get('last_audit_at')}\n"

    # Load live KPIs if GSC configured
    if site.get("gsc_site_url"):
        try:
            from api.services.marketing.search_console import gsc_performance, gsc_keywords
            perf = await gsc_performance(user_id, site["gsc_site_url"])
            totals = perf.get("totals", {})
            prompt += f"\n=== METRICAS ULTIMOS 28 DIAS ===\n"
            prompt += f"Clicks: {totals.get('clicks', 0)}\n"
            prompt += f"Impresiones: {totals.get('impressions', 0)}\n"
            prompt += f"CTR medio: {totals.get('avg_ctr', 0) * 100:.2f}%\n"
            prompt += f"Posicion media: {totals.get('avg_position', 0):.1f}\n"

            keywords = await gsc_keywords(user_id, site["gsc_site_url"], limit=10)
            if keywords:
                prompt += f"\n=== TOP 10 KEYWORDS ===\n"
                for i, kw in enumerate(keywords, 1):
                    prompt += f"{i}. {kw['query']} — pos #{kw['position']:.1f}, {kw['clicks']} clicks\n"
        except Exception as e:
            logger.warning(f"Failed to load live KPIs for system prompt: {e}")

    # Load pending tasks
    try:
        from api.services.marketing.tasks import list_tasks
        tasks_result = await list_tasks(site["id"], user_jwt, status="todo", limit=10)
        tasks = tasks_result.get("tasks", [])
        if tasks:
            prompt += f"\n=== TAREAS PENDIENTES ({len(tasks)}) ===\n"
            for t in tasks[:10]:
                prompt += f"- [{t.get('task_type')}] {t.get('title')} (prioridad {t.get('priority')})\n"
    except Exception as e:
        logger.warning(f"Failed to load tasks: {e}")

    return prompt


def _msg_to_openai(msg: Dict[str, Any]) -> Dict[str, Any]:
    """Convert a marketing_messages row to OpenAI message format."""
    role = msg["role"]
    result: Dict[str, Any] = {"role": role}

    if role == "assistant":
        if msg.get("content"):
            result["content"] = msg["content"]
        if msg.get("tool_calls"):
            result["tool_calls"] = msg["tool_calls"]
    elif role == "tool":
        result["content"] = msg.get("content") or ""
        result["tool_call_id"] = msg.get("tool_call_id") or ""
    else:
        result["content"] = msg.get("content") or ""

    return result


async def chat_stream(
    workspace_id: str,
    site_id: Optional[str],
    user_id: str,
    user_jwt: str,
    user_message: str,
) -> AsyncIterator[str]:
    """Main chat streaming loop with OpenAI and tool calling.

    Yields SSE-formatted events.
    """
    # Load site if provided
    site = None
    if site_id:
        supabase = await get_authenticated_async_client(user_jwt)
        site_result = await supabase.table("marketing_sites")\
            .select("*")\
            .eq("id", site_id)\
            .single()\
            .execute()
        site = site_result.data

    # Get/create conversation
    conversation = await get_or_create_conversation(workspace_id, site_id, user_id, user_jwt)
    conv_id = conversation["id"]

    # Save user message
    await save_message(conv_id, workspace_id, "user", user_message, user_jwt, user_id=user_id)
    yield f"event: user_saved\ndata: {json.dumps({'conversation_id': conv_id})}\n\n"

    # Load history
    history = await get_conversation_history(conv_id, user_jwt)

    # Build system prompt with live context
    system_prompt = await build_system_prompt(site, user_id, user_jwt)

    # Build OpenAI messages
    messages: List[Dict[str, Any]] = [{"role": "system", "content": system_prompt}]
    for msg in history:
        messages.append(_msg_to_openai(msg))

    # Tool context
    tool_ctx = ToolContext(
        user_id=user_id,
        user_jwt=user_jwt,
        workspace_id=workspace_id,
        site_id=site_id,
        site=site,
    )

    client = _get_openai_client()

    # Multi-turn loop for tool calls (max 8 iterations)
    for iteration in range(8):
        logger.info(f"PulseMark iteration {iteration}, messages: {len(messages)}")
        try:
            stream = await client.chat.completions.create(
                model=PULSEMARK_MODEL,
                messages=messages,
                tools=PULSEMARK_TOOLS_SCHEMA,
                tool_choice="auto",
                stream=True,
                temperature=0.3,
            )
        except Exception as e:
            logger.exception(f"OpenAI request failed: {e}")
            yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"
            return

        # Accumulate streaming response
        content_buffer = ""
        tool_calls_buffer: Dict[int, Dict[str, Any]] = {}

        async for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta

            if delta.content:
                content_buffer += delta.content
                yield f"event: content\ndata: {json.dumps({'delta': delta.content})}\n\n"

            if delta.tool_calls:
                for tc in delta.tool_calls:
                    idx = tc.index
                    if idx not in tool_calls_buffer:
                        tool_calls_buffer[idx] = {
                            "id": "",
                            "type": "function",
                            "function": {"name": "", "arguments": ""},
                        }
                    if tc.id:
                        tool_calls_buffer[idx]["id"] = tc.id
                    if tc.function:
                        if tc.function.name:
                            tool_calls_buffer[idx]["function"]["name"] = tc.function.name
                        if tc.function.arguments:
                            tool_calls_buffer[idx]["function"]["arguments"] += tc.function.arguments

        # Finalize assistant message
        final_tool_calls = list(tool_calls_buffer.values()) if tool_calls_buffer else None

        # Save assistant message
        await save_message(
            conv_id, workspace_id, "assistant",
            content_buffer if content_buffer else None,
            user_jwt,
            tool_calls=final_tool_calls,
        )

        # If no tool calls, we're done
        if not final_tool_calls:
            yield f"event: done\ndata: {json.dumps({'finished': True})}\n\n"
            return

        # Add assistant message to messages for next iteration
        assistant_msg: Dict[str, Any] = {"role": "assistant"}
        if content_buffer:
            assistant_msg["content"] = content_buffer
        assistant_msg["tool_calls"] = final_tool_calls
        messages.append(assistant_msg)

        # Execute each tool call
        for tc in final_tool_calls:
            tool_name = tc["function"]["name"]
            try:
                args = json.loads(tc["function"]["arguments"] or "{}")
            except Exception:
                args = {}

            yield f"event: tool_start\ndata: {json.dumps({'tool': tool_name, 'args': args})}\n\n"

            result = await execute_tool(tool_name, args, tool_ctx)

            # Truncate large tool results for OpenAI context (keep full in DB)
            result_str = json.dumps(result)
            display_result = result_str if len(result_str) <= 20000 else result_str[:20000] + "...[truncated]"

            # Save tool result
            await save_message(
                conv_id, workspace_id, "tool",
                display_result, user_jwt,
                tool_call_id=tc["id"],
                tool_name=tool_name,
            )

            messages.append({
                "role": "tool",
                "tool_call_id": tc["id"],
                "content": display_result,
            })

            yield f"event: tool_result\ndata: {json.dumps({'tool': tool_name, 'result': result})}\n\n"

        # Continue the loop — OpenAI will respond to the tool results

    yield f"event: done\ndata: {json.dumps({'finished': True, 'max_iterations': True})}\n\n"
