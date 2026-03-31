"""External messaging router — WhatsApp & Telegram integration via Evolution API."""

import logging
import httpx
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from api.dependencies import get_current_user_jwt, get_current_user_id
from lib.supabase_client import get_async_service_role_client, get_authenticated_async_client

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/messaging", tags=["messaging"])

EVOLUTION_API_URL = "http://127.0.0.1:8080"
EVOLUTION_API_KEY = "pulse-evolution-key-2026"

# ── Models ──

class LinkWhatsAppRequest(BaseModel):
    workspace_id: str

class SendMessageRequest(BaseModel):
    chat_id: str
    content: str

class AwayModeRequest(BaseModel):
    enabled: bool
    message: Optional[str] = None
    directives: Optional[str] = None

class ContactRuleRequest(BaseModel):
    auto_reply_enabled: Optional[bool] = None
    auto_reply_directives: Optional[str] = None
    muted: Optional[bool] = None

class SuggestReplyRequest(BaseModel):
    chat_id: str
    message_id: Optional[str] = None


# ── WhatsApp Account Management ──

@router.post("/whatsapp/link")
async def link_whatsapp(
    request: LinkWhatsAppRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Start WhatsApp linking process. Returns QR code."""
    supabase = await get_async_service_role_client()

    instance_name = f"pulse-wa-{user_id[:8]}"

    # Create instance in Evolution API
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Create instance
        resp = await client.post(
            f"{EVOLUTION_API_URL}/instance/create",
            json={
                "instanceName": instance_name,
                "integration": "WHATSAPP-BAILEYS",
                "qrcode": True,
                "webhookUrl": "https://pulse.factoriaia.com/api/messaging/webhook/whatsapp",
                "webhookByEvents": True,
                "webhookEvents": [
                    "messages.upsert",
                    "messages.update",
                    "connection.update",
                ],
            },
            headers={"apikey": EVOLUTION_API_KEY},
        )

        if resp.status_code not in (200, 201):
            logger.error(f"Evolution API create error: {resp.status_code} {resp.text}")
            raise HTTPException(502, "No se pudo crear la instancia de WhatsApp")

        data = resp.json()
        qr_code = data.get("qrcode", {}).get("base64", "")

    # Save account in DB
    await supabase.table("external_accounts").upsert({
        "user_id": user_id,
        "workspace_id": request.workspace_id,
        "provider": "whatsapp",
        "instance_id": instance_name,
        "instance_name": instance_name,
        "status": "qr_pending",
    }, on_conflict="user_id,provider").execute()

    return {"qr_code": qr_code, "instance_name": instance_name}


@router.get("/whatsapp/qr")
async def get_whatsapp_qr(
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Get current QR code for WhatsApp linking."""
    supabase = await get_async_service_role_client()

    account = await supabase.table("external_accounts")\
        .select("instance_name")\
        .eq("user_id", user_id)\
        .eq("provider", "whatsapp")\
        .maybe_single()\
        .execute()

    if not account or not account.data:
        raise HTTPException(404, "No hay cuenta de WhatsApp pendiente")

    instance_name = account.data["instance_name"]

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            f"{EVOLUTION_API_URL}/instance/connect/{instance_name}",
            headers={"apikey": EVOLUTION_API_KEY},
        )
        if resp.status_code != 200:
            raise HTTPException(502, "No se pudo obtener el QR")

        data = resp.json()
        return {"qr_code": data.get("base64", ""), "status": data.get("state", "unknown")}


@router.delete("/whatsapp/unlink")
async def unlink_whatsapp(
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Disconnect and remove WhatsApp account."""
    supabase = await get_async_service_role_client()

    account = await supabase.table("external_accounts")\
        .select("instance_name")\
        .eq("user_id", user_id)\
        .eq("provider", "whatsapp")\
        .maybe_single()\
        .execute()

    if account and account.data:
        # Delete from Evolution API
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                await client.delete(
                    f"{EVOLUTION_API_URL}/instance/delete/{account.data['instance_name']}",
                    headers={"apikey": EVOLUTION_API_KEY},
                )
        except Exception as e:
            logger.warning(f"Could not delete Evolution instance: {e}")

    # Delete from DB (cascades to chats and messages)
    await supabase.table("external_accounts")\
        .delete()\
        .eq("user_id", user_id)\
        .eq("provider", "whatsapp")\
        .execute()

    return {"status": "unlinked"}


# ── Account Status ──

@router.get("/accounts")
async def list_accounts(
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """List user's linked messaging accounts."""
    supabase = await get_async_service_role_client()

    result = await supabase.table("external_accounts")\
        .select("id, provider, status, phone_number, away_mode, away_message, created_at")\
        .eq("user_id", user_id)\
        .execute()

    return {"accounts": result.data or []}


# ── Chats ──

@router.get("/chats")
async def list_chats(
    provider: Optional[str] = None,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """List external chats for the user."""
    supabase = await get_async_service_role_client()

    # Get user's account IDs
    accounts_q = supabase.table("external_accounts").select("id").eq("user_id", user_id)
    if provider:
        accounts_q = accounts_q.eq("provider", provider)
    accounts_result = await accounts_q.execute()
    account_ids = [a["id"] for a in (accounts_result.data or [])]

    if not account_ids:
        return {"chats": []}

    # Get chats ordered by last message
    chats_result = await supabase.table("external_chats")\
        .select("*, account:external_accounts(provider)")\
        .in_("account_id", account_ids)\
        .order("last_message_at", desc=True)\
        .limit(100)\
        .execute()

    return {"chats": chats_result.data or []}


# ── Messages ──

@router.get("/chats/{chat_id}/messages")
async def list_messages(
    chat_id: str,
    limit: int = 50,
    before: Optional[str] = None,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """List messages in a chat."""
    supabase = await get_async_service_role_client()

    query = supabase.table("external_messages")\
        .select("*")\
        .eq("chat_id", chat_id)\
        .order("created_at", desc=True)\
        .limit(limit)

    if before:
        query = query.lt("created_at", before)

    result = await query.execute()

    # Mark as read
    await supabase.table("external_chats")\
        .update({"unread_count": 0})\
        .eq("id", chat_id)\
        .execute()

    return {"messages": list(reversed(result.data or []))}


@router.post("/chats/{chat_id}/send")
async def send_message(
    chat_id: str,
    request: SendMessageRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Send a message to an external chat."""
    supabase = await get_async_service_role_client()

    # Get chat and account info
    chat = await supabase.table("external_chats")\
        .select("*, account:external_accounts(instance_name, provider)")\
        .eq("id", chat_id)\
        .maybe_single()\
        .execute()

    if not chat or not chat.data:
        raise HTTPException(404, "Chat no encontrado")

    chat_data = chat.data
    account = chat_data["account"]

    if account["provider"] == "whatsapp":
        # Send via Evolution API
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{EVOLUTION_API_URL}/message/sendText/{account['instance_name']}",
                json={
                    "number": chat_data["remote_jid"],
                    "text": request.content,
                },
                headers={"apikey": EVOLUTION_API_KEY},
            )
            if resp.status_code not in (200, 201):
                logger.error(f"Send message error: {resp.status_code} {resp.text}")
                raise HTTPException(502, "Error al enviar mensaje")

    # Save outgoing message
    msg = await supabase.table("external_messages").insert({
        "chat_id": chat_id,
        "direction": "out",
        "content": request.content,
        "status": "sent",
    }).execute()

    # Update chat last message
    await supabase.table("external_chats").update({
        "last_message_at": "now()",
        "last_message_preview": request.content[:100],
    }).eq("id", chat_id).execute()

    return {"message": msg.data[0] if msg.data else None}


# ── Webhook (receives messages from Evolution API) ──

@router.post("/webhook/whatsapp")
async def whatsapp_webhook(request: Request):
    """Receive incoming WhatsApp messages from Evolution API."""
    try:
        body = await request.json()
    except Exception:
        return {"status": "ignored"}

    event = body.get("event", "")
    instance = body.get("instance", "")
    data = body.get("data", {})

    logger.info(f"WhatsApp webhook: event={event} instance={instance}")

    if event == "connection.update":
        # Update connection status
        state = data.get("state", "")
        supabase = await get_async_service_role_client()

        status_map = {"open": "connected", "close": "disconnected", "connecting": "connecting"}
        new_status = status_map.get(state, "disconnected")

        await supabase.table("external_accounts")\
            .update({"status": new_status})\
            .eq("instance_name", instance)\
            .execute()

        # If connected, get phone number
        if state == "open":
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.get(
                        f"{EVOLUTION_API_URL}/instance/connectionState/{instance}",
                        headers={"apikey": EVOLUTION_API_KEY},
                    )
                    if resp.status_code == 200:
                        info = resp.json()
                        # Try to extract phone from instance info
                        pass
            except Exception:
                pass

        return {"status": "ok"}

    if event == "messages.upsert":
        supabase = await get_async_service_role_client()

        # Get account
        account_result = await supabase.table("external_accounts")\
            .select("id, user_id, away_mode, away_message, away_directives, style_profile")\
            .eq("instance_name", instance)\
            .maybe_single()\
            .execute()

        if not account_result or not account_result.data:
            return {"status": "no_account"}

        account = account_result.data

        # Process each message
        messages = data if isinstance(data, list) else [data]
        for msg_data in messages:
            key = msg_data.get("key", {})
            message = msg_data.get("message", {})

            # Skip outgoing messages
            if key.get("fromMe", False):
                continue

            remote_jid = key.get("remoteJid", "")
            if not remote_jid:
                continue

            # Extract text content
            text = (
                message.get("conversation", "") or
                message.get("extendedTextMessage", {}).get("text", "") or
                ""
            )

            # Get or create chat
            contact_name = msg_data.get("pushName", "") or remote_jid.split("@")[0]

            chat_result = await supabase.table("external_chats")\
                .select("id, auto_reply_enabled, auto_reply_directives")\
                .eq("account_id", account["id"])\
                .eq("remote_jid", remote_jid)\
                .maybe_single()\
                .execute()

            if chat_result and chat_result.data:
                chat_id = chat_result.data["id"]
                chat_config = chat_result.data
            else:
                # Create new chat
                new_chat = await supabase.table("external_chats").insert({
                    "account_id": account["id"],
                    "remote_jid": remote_jid,
                    "contact_name": contact_name,
                    "contact_phone": remote_jid.split("@")[0],
                    "is_group": "@g.us" in remote_jid,
                }).execute()
                chat_id = new_chat.data[0]["id"]
                chat_config = {"auto_reply_enabled": None, "auto_reply_directives": None}

            # Save incoming message
            await supabase.table("external_messages").insert({
                "chat_id": chat_id,
                "remote_message_id": key.get("id", ""),
                "direction": "in",
                "content": text,
                "sender_name": contact_name,
                "sender_jid": remote_jid,
            }).execute()

            # Update chat metadata
            await supabase.table("external_chats").update({
                "last_message_at": "now()",
                "last_message_preview": text[:100] if text else "[media]",
                "contact_name": contact_name,
                "unread_count": supabase.rpc("increment_unread", {"chat_id_param": chat_id}).execute() if False else 0,
            }).eq("id", chat_id).execute()

            # Increment unread
            await supabase.rpc("", {}).execute() if False else None
            # Simple increment via SQL
            await supabase.table("external_chats")\
                .update({"unread_count": chat_config.get("unread_count", 0) + 1 if "unread_count" in chat_config else 1})\
                .eq("id", chat_id)\
                .execute()

            # Check auto-reply
            should_reply = False
            reply_directives = ""

            # Per-contact rule takes priority
            if chat_config.get("auto_reply_enabled") is True:
                should_reply = True
                reply_directives = chat_config.get("auto_reply_directives", "")
            elif chat_config.get("auto_reply_enabled") is None and account.get("away_mode"):
                # No per-contact rule, use global away mode
                should_reply = True
                reply_directives = account.get("away_directives", "")
            elif chat_config.get("auto_reply_enabled") is False:
                # Explicitly disabled for this contact
                should_reply = False

            if should_reply and text:
                import asyncio
                asyncio.create_task(
                    _auto_reply(account, chat_id, remote_jid, instance, text, contact_name, reply_directives)
                )

        return {"status": "ok"}

    return {"status": "ignored"}


async def _auto_reply(account, chat_id, remote_jid, instance, incoming_text, contact_name, directives):
    """Generate and send auto-reply using Haiku."""
    try:
        import anthropic
        from api.config import settings

        supabase = await get_async_service_role_client()

        # Get recent conversation for context (last 10 messages)
        recent = await supabase.table("external_messages")\
            .select("direction, content, sender_name")\
            .eq("chat_id", chat_id)\
            .order("created_at", desc=True)\
            .limit(10)\
            .execute()

        history = ""
        for msg in reversed(recent.data or []):
            who = "Yo" if msg["direction"] == "out" else (msg.get("sender_name") or contact_name)
            history += f"{who}: {msg['content']}\n"

        style_profile = account.get("style_profile", {})
        style_desc = style_profile.get("description", "Responde de forma natural y directa.")

        system_prompt = f"""Eres el asistente personal de un usuario. Estás respondiendo mensajes de WhatsApp en su nombre porque está ausente.

Estilo de comunicación del usuario:
{style_desc}

Directrices del usuario:
{directives or account.get('away_message', 'Estoy ocupado ahora mismo, te respondo en cuanto pueda.')}

REGLAS:
- Responde como si fueras el usuario, NO como un bot
- Usa su estilo de comunicación (tono, formalidad, emojis si los usa)
- Si no sabes algo, di que lo consultas y responde después
- Sé breve como en WhatsApp (no escribas párrafos largos)
- NO digas que eres un bot o IA"""

        client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

        response = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=300,
            system=system_prompt,
            messages=[
                {"role": "user", "content": f"Conversación reciente:\n{history}\n\n{contact_name} acaba de escribir: {incoming_text}\n\nResponde como el usuario:"}
            ],
        )

        reply_text = response.content[0].text

        # Send via Evolution API
        async with httpx.AsyncClient(timeout=30.0) as http_client:
            await http_client.post(
                f"{EVOLUTION_API_URL}/message/sendText/{instance}",
                json={"number": remote_jid, "text": reply_text},
                headers={"apikey": EVOLUTION_API_KEY},
            )

        # Save auto-reply message
        await supabase.table("external_messages").insert({
            "chat_id": chat_id,
            "direction": "out",
            "content": reply_text,
            "is_auto_reply": True,
            "status": "sent",
        }).execute()

        # Update chat
        await supabase.table("external_chats").update({
            "last_message_at": "now()",
            "last_message_preview": reply_text[:100],
        }).eq("id", chat_id).execute()

        logger.info(f"Auto-reply sent to {contact_name} in chat {chat_id}")
    except Exception as e:
        logger.error(f"Auto-reply failed: {e}")


# ── AI Suggest Reply ──

@router.post("/suggest-reply")
async def suggest_reply(
    request: SuggestReplyRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Suggest a reply using Haiku with user's style."""
    import anthropic
    from api.config import settings

    supabase = await get_async_service_role_client()

    # Get chat and account
    chat = await supabase.table("external_chats")\
        .select("*, account:external_accounts(style_profile, away_directives)")\
        .eq("id", request.chat_id)\
        .maybe_single()\
        .execute()

    if not chat or not chat.data:
        raise HTTPException(404, "Chat no encontrado")

    # Get recent messages
    recent = await supabase.table("external_messages")\
        .select("direction, content, sender_name")\
        .eq("chat_id", request.chat_id)\
        .order("created_at", desc=True)\
        .limit(15)\
        .execute()

    history = ""
    for msg in reversed(recent.data or []):
        who = "Yo" if msg["direction"] == "out" else (msg.get("sender_name") or "Contacto")
        history += f"{who}: {msg['content']}\n"

    style = chat.data.get("account", {}).get("style_profile", {})
    style_desc = style.get("description", "Responde de forma natural.")

    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    response = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=300,
        system=f"Sugiere una respuesta para este chat de WhatsApp. Estilo del usuario: {style_desc}. Responde como el usuario, breve y natural.",
        messages=[
            {"role": "user", "content": f"Conversación:\n{history}\n\nSugiere la siguiente respuesta del usuario:"}
        ],
    )

    return {"suggestion": response.content[0].text}


# ── Away Mode ──

@router.put("/accounts/{account_id}/away")
async def set_away_mode(
    account_id: str,
    request: AwayModeRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Enable/disable away mode with directives."""
    supabase = await get_async_service_role_client()

    update_data = {"away_mode": request.enabled}
    if request.message is not None:
        update_data["away_message"] = request.message
    if request.directives is not None:
        update_data["away_directives"] = request.directives

    result = await supabase.table("external_accounts")\
        .update(update_data)\
        .eq("id", account_id)\
        .eq("user_id", user_id)\
        .execute()

    return {"status": "ok", "away_mode": request.enabled}


# ── Per-Contact Rules ──

@router.put("/chats/{chat_id}/rules")
async def set_contact_rules(
    chat_id: str,
    request: ContactRuleRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Set auto-reply rules for a specific contact/group."""
    supabase = await get_async_service_role_client()

    update_data = {}
    if request.auto_reply_enabled is not None:
        update_data["auto_reply_enabled"] = request.auto_reply_enabled
    if request.auto_reply_directives is not None:
        update_data["auto_reply_directives"] = request.auto_reply_directives
    if request.muted is not None:
        update_data["muted"] = request.muted

    if update_data:
        await supabase.table("external_chats")\
            .update(update_data)\
            .eq("id", chat_id)\
            .execute()

    return {"status": "ok"}


# ── Style Profile ──

@router.post("/accounts/{account_id}/analyze-style")
async def analyze_style(
    account_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Analyze user's message history to create a communication style profile."""
    import anthropic
    from api.config import settings

    supabase = await get_async_service_role_client()

    # Get last 200 outgoing messages from this account
    chats = await supabase.table("external_chats")\
        .select("id")\
        .eq("account_id", account_id)\
        .execute()

    chat_ids = [c["id"] for c in (chats.data or [])]
    if not chat_ids:
        raise HTTPException(400, "No hay mensajes suficientes para analizar")

    messages = await supabase.table("external_messages")\
        .select("content")\
        .in_("chat_id", chat_ids)\
        .eq("direction", "out")\
        .order("created_at", desc=True)\
        .limit(200)\
        .execute()

    if not messages.data or len(messages.data) < 10:
        raise HTTPException(400, "Se necesitan al menos 10 mensajes enviados para analizar el estilo")

    sample = "\n".join([m["content"] for m in messages.data if m.get("content")])

    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    response = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=500,
        system="Eres un analista de comunicación. Analiza estos mensajes de WhatsApp/Telegram y genera un perfil de estilo de comunicación conciso.",
        messages=[
            {"role": "user", "content": f"Analiza el estilo de comunicación de estos mensajes y genera un perfil:\n\n{sample[:3000]}\n\nGenera un perfil con: tono (formal/informal), longitud típica, uso de emojis, muletillas, formalidad, idioma, y cualquier patrón notable. Formato JSON con campo 'description' (texto libre) y campos individuales."}
        ],
    )

    # Try to parse as JSON, fallback to text description
    import json
    try:
        profile = json.loads(response.content[0].text)
    except json.JSONDecodeError:
        profile = {"description": response.content[0].text}

    # Save profile
    await supabase.table("external_accounts")\
        .update({"style_profile": profile})\
        .eq("id", account_id)\
        .execute()

    return {"profile": profile}
