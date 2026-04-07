"""External messaging router — WhatsApp & Telegram integration via Evolution API.

Evolution API v2.3.7 endpoints used:
  POST /instance/create          - create instance (returns QR when qrcode=true)
  GET  /instance/connect/{name}  - get fresh QR code
  GET  /instance/connectionState/{name} - check connection state
  GET  /instance/fetchInstances  - list all instances
  DELETE /instance/delete/{name} - delete instance
  POST /message/sendText/{name}  - send text message
"""

import asyncio
import base64
import binascii
import json
import logging
from api.services.automations.trigger import fire_automation_trigger
import mimetypes
import httpx
import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, Set
from urllib.parse import urlparse
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

from api.dependencies import get_current_user_jwt, get_current_user_id
from api.config import settings
from lib.supabase_client import get_async_service_role_client

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/messaging", tags=["messaging"])

EVOLUTION_API_URL = "http://127.0.0.1:8080"
EVOLUTION_API_KEY = "pulse-evolution-key-2026"
PUBLIC_MESSAGING_BASE_URL = (settings.messaging_public_base_url or "https://pulse.factoriaia.com").rstrip("/")
WEBHOOK_BASE_URL = f"{PUBLIC_MESSAGING_BASE_URL}/api/messaging/webhook/whatsapp"
TELEGRAM_WEBHOOK_URL = f"{PUBLIC_MESSAGING_BASE_URL}/api/messaging/webhook/telegram"
TELEGRAM_API_BASE = "https://api.telegram.org"

# ── Models ──

WHATSAPP_MEDIA_PLACEHOLDERS: Dict[str, str] = {
    "image": "[imagen]",
    "video": "[video]",
    "gif": "[gif]",
    "audio": "[audio]",
    "document": "[documento]",
    "sticker": "[sticker]",
    "media": "[adjunto]",
}

def _coerce_epoch_seconds(raw: Any) -> Optional[int]:
    """Convert Evolution timestamp payloads to unix seconds."""
    if isinstance(raw, bool):
        return None
    if isinstance(raw, (int, float)):
        return int(raw)
    if isinstance(raw, str) and raw.isdigit():
        return int(raw)
    if isinstance(raw, dict):
        low = raw.get("low")
        if isinstance(low, (int, float)):
            return int(low)
    return None


def _iso_from_epoch_seconds(raw: Any) -> Optional[str]:
    ts = _coerce_epoch_seconds(raw)
    if ts is None:
        return None
    try:
        return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
    except Exception:
        return None


def _unwrap_whatsapp_message(message: Any) -> Dict[str, Any]:
    current = message if isinstance(message, dict) else {}
    for _ in range(8):
        nested = None
        for wrapper in (
            "ephemeralMessage",
            "viewOnceMessage",
            "viewOnceMessageV2",
            "viewOnceMessageV2Extension",
            "documentWithCaptionMessage",
        ):
            payload = current.get(wrapper)
            if isinstance(payload, dict) and isinstance(payload.get("message"), dict):
                nested = payload.get("message")
                break
        if nested is None:
            break
        current = nested
    return current


def _normalize_media_type(raw: Optional[str]) -> Optional[str]:
    value = (raw or "").strip().lower()
    if not value:
        return None
    if "gif" in value:
        return "gif"
    if "image" in value:
        return "image"
    if "video" in value:
        return "video"
    if "audio" in value or "voice" in value or "ptt" in value:
        return "audio"
    if "document" in value or "file" in value:
        return "document"
    if "sticker" in value:
        return "sticker"
    if value in {"media", "mediamessage"}:
        return "media"
    return None


def _extract_media_info(message: Any, msg_data: Optional[Dict[str, Any]] = None) -> tuple[Optional[str], Optional[str]]:
    payload = _unwrap_whatsapp_message(message)

    media_map = {
        "imageMessage": "image",
        "videoMessage": "video",
        "audioMessage": "audio",
        "documentMessage": "document",
        "stickerMessage": "sticker",
    }
    media_url_keys = (
        "url",
        "mediaUrl",
        "media_url",
        "directPath",
        "downloadUrl",
        "download_url",
    )

    for key, media_type in media_map.items():
        blob = payload.get(key)
        if not isinstance(blob, dict):
            continue

        resolved_media_type = media_type
        if media_type == "video" and blob.get("gifPlayback") is True:
            resolved_media_type = "gif"

        media_url = None
        for url_key in media_url_keys:
            raw_url = blob.get(url_key)
            if isinstance(raw_url, str) and raw_url.strip():
                media_url = raw_url.strip()
                break

        if not media_url and isinstance(msg_data, dict):
            for url_key in media_url_keys:
                raw_url = msg_data.get(url_key)
                if isinstance(raw_url, str) and raw_url.strip():
                    media_url = raw_url.strip()
                    break

        return resolved_media_type, media_url

    if isinstance(msg_data, dict):
        hint = msg_data.get("messageType")
        if not isinstance(hint, str):
            hint = msg_data.get("type")
        media_type = _normalize_media_type(hint if isinstance(hint, str) else None)
        if media_type:
            media_url = None
            for url_key in media_url_keys:
                raw_url = msg_data.get(url_key)
                if isinstance(raw_url, str) and raw_url.strip():
                    media_url = raw_url.strip()
                    break
            return media_type, media_url

    return None, None


def _media_placeholder(media_type: Optional[str]) -> str:
    if not media_type:
        return ""
    return WHATSAPP_MEDIA_PLACEHOLDERS.get(media_type, "[adjunto]")


def _extract_message_text(message: Any, fallback_media_type: Optional[str] = None) -> str:
    """Extract plain text from WhatsApp message payload variants."""
    payload = _unwrap_whatsapp_message(message)
    if not isinstance(payload, dict):
        return ""

    candidates = [
        payload.get("conversation"),
        payload.get("extendedTextMessage", {}).get("text"),
        payload.get("imageMessage", {}).get("caption"),
        payload.get("videoMessage", {}).get("caption"),
        payload.get("documentMessage", {}).get("caption"),
        payload.get("buttonsResponseMessage", {}).get("selectedDisplayText"),
        payload.get("templateButtonReplyMessage", {}).get("selectedDisplayText"),
        payload.get("listResponseMessage", {}).get("title"),
        payload.get("pollCreationMessage", {}).get("name"),
    ]

    for value in candidates:
        if isinstance(value, str) and value.strip():
            return value.strip()

    media_type, _ = _extract_media_info(payload)
    return _media_placeholder(media_type or fallback_media_type)


def _message_preview(message: Any, fallback_type: Optional[str] = None) -> str:
    text = _extract_message_text(message, _normalize_media_type(fallback_type))
    if text:
        return text[:100]
    return _media_placeholder(_normalize_media_type(fallback_type) or "media")


def _extract_remote_message_id(payload: Any) -> str:
    """Best-effort extraction of outbound message id returned by provider APIs."""
    if isinstance(payload, dict):
        key_block = payload.get("key")
        if isinstance(key_block, dict):
            value = key_block.get("id")
            if isinstance(value, str) and value.strip():
                return value.strip()

        for key in ("messageId", "message_id", "id", "stanzaId"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()

        for nested_key in ("message", "data", "response", "result", "sentMessage"):
            nested = payload.get(nested_key)
            candidate = _extract_remote_message_id(nested)
            if candidate:
                return candidate

    elif isinstance(payload, list):
        for item in payload:
            candidate = _extract_remote_message_id(item)
            if candidate:
                return candidate

    return ""


def _normalize_text_for_dedupe(value: Optional[str]) -> str:
    if not isinstance(value, str):
        return ""
    text = value.strip().lower()
    if not text:
        return ""
    text = re.sub(r"\s+", " ", text)
    return text


def _parse_iso_datetime(value: Optional[str]) -> Optional[datetime]:
    if not isinstance(value, str) or not value.strip():
        return None
    candidate = value.strip()
    if candidate.endswith("Z"):
        candidate = candidate[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(candidate)
    except Exception:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed


def _is_probable_outgoing_echo(incoming_text: str, recent_out_rows: list[dict]) -> bool:
    incoming_norm = _normalize_text_for_dedupe(incoming_text)
    if not incoming_norm:
        return False
    now_utc = datetime.now(timezone.utc)
    for row in recent_out_rows:
        outgoing_norm = _normalize_text_for_dedupe(row.get("content"))
        if not outgoing_norm or outgoing_norm != incoming_norm:
            continue
        created_at = _parse_iso_datetime(row.get("created_at"))
        if not created_at:
            continue
        if (now_utc - created_at).total_seconds() <= 300:
            return True
    return False


def _decode_base64_blob(raw: str) -> Optional[bytes]:
    if not isinstance(raw, str):
        return None
    value = raw.strip()
    if not value:
        return None
    if value.lower().startswith("data:") and "," in value:
        value = value.split(",", 1)[1].strip()
    if not value:
        return None
    padding = len(value) % 4
    if padding:
        value += "=" * (4 - padding)
    try:
        return base64.b64decode(value, validate=False)
    except (ValueError, binascii.Error):
        return None


def _parse_content_disposition_filename(content_disposition: Optional[str]) -> Optional[str]:
    if not isinstance(content_disposition, str) or not content_disposition:
        return None
    match = re.search(r"filename\*?=(?:UTF-8'')?\"?([^\";]+)\"?", content_disposition, flags=re.IGNORECASE)
    if not match:
        return None
    value = match.group(1).strip()
    if not value:
        return None
    return os.path.basename(value)


def _default_mime_for_media_type(media_type: Optional[str]) -> str:
    normalized = _normalize_media_type(media_type)
    if normalized == "image":
        return "image/jpeg"
    if normalized == "gif":
        return "video/mp4"
    if normalized == "video":
        return "video/mp4"
    if normalized == "audio":
        return "audio/ogg"
    if normalized == "document":
        return "application/octet-stream"
    if normalized == "sticker":
        return "image/webp"
    return "application/octet-stream"


def _is_generic_mime(mime_type: Optional[str]) -> bool:
    if not isinstance(mime_type, str):
        return True
    normalized = mime_type.split(";", 1)[0].strip().lower()
    return normalized in {
        "",
        "application/octet-stream",
        "binary/octet-stream",
        "application/download",
    }


def _infer_filename(
    remote_message_id: Optional[str],
    mime_type: Optional[str],
    fallback: Optional[str] = None,
) -> str:
    if isinstance(fallback, str) and fallback.strip():
        return os.path.basename(fallback.strip())
    ext = ""
    if isinstance(mime_type, str) and mime_type.strip():
        ext = mimetypes.guess_extension(mime_type.split(";")[0].strip()) or ""
    base = (remote_message_id or "media").strip() or "media"
    return f"{base}{ext}"


def _finalize_media_metadata(
    media_type: Optional[str],
    remote_message_id: Optional[str],
    mime_type: Optional[str],
    file_name: Optional[str],
) -> tuple[str, str]:
    fallback_mime = _default_mime_for_media_type(media_type)
    final_mime = fallback_mime if _is_generic_mime(mime_type) else (mime_type or "").strip()
    final_name = _infer_filename(remote_message_id, final_mime, file_name)
    if final_name.lower().endswith(".enc") and fallback_mime != "application/octet-stream":
        final_name = _infer_filename(remote_message_id, fallback_mime, None)
    return final_mime, final_name


def _extract_media_payload(data: Any) -> tuple[Optional[bytes], Optional[str], Optional[str]]:
    if isinstance(data, str):
        decoded = _decode_base64_blob(data)
        if decoded:
            return decoded, None, None
        return None, None, None

    if isinstance(data, list):
        for item in data:
            blob, mime, name = _extract_media_payload(item)
            if blob:
                return blob, mime, name
        return None, None, None

    if not isinstance(data, dict):
        return None, None, None

    mime = data.get("mimetype") or data.get("mimeType") or data.get("mime")
    filename = data.get("fileName") or data.get("filename") or data.get("name")

    for key in ("base64", "data", "buffer", "media"):
        value = data.get(key)
        if isinstance(value, str):
            guessed_mime = mime
            if value.lower().startswith("data:") and "," in value:
                head = value.split(",", 1)[0]
                head_mime = head[5:].split(";", 1)[0].strip()
                if head_mime:
                    guessed_mime = guessed_mime or head_mime
            decoded = _decode_base64_blob(value)
            if decoded:
                return decoded, guessed_mime, filename

    for nested_key in ("message", "response", "result", "mediaMessage"):
        nested = data.get(nested_key)
        decoded, nested_mime, nested_name = _extract_media_payload(nested)
        if decoded:
            return decoded, nested_mime or mime, nested_name or filename

    return None, mime if isinstance(mime, str) else None, filename if isinstance(filename, str) else None


async def _fetch_remote_media_url(media_url: str) -> tuple[Optional[bytes], Optional[str], Optional[str]]:
    if not isinstance(media_url, str) or not media_url.strip():
        return None, None, None
    try:
        async with httpx.AsyncClient(timeout=25.0, follow_redirects=True) as client:
            response = await client.get(
                media_url.strip(),
                headers={
                    "User-Agent": "Mozilla/5.0",
                    "Accept": "*/*",
                },
            )
        if response.status_code not in (200, 206) or not response.content:
            return None, None, None
        mime = response.headers.get("content-type", "").split(";", 1)[0].strip() or None
        filename = _parse_content_disposition_filename(response.headers.get("content-disposition"))
        return response.content, mime, filename
    except Exception:
        return None, None, None


def _is_whatsapp_cdn_media_url(media_url: Optional[str]) -> bool:
    if not isinstance(media_url, str) or not media_url.strip():
        return False
    try:
        host = (urlparse(media_url.strip()).hostname or "").lower()
    except Exception:
        return False
    return host.endswith("mmg.whatsapp.net") or host.endswith("mmg.whatsapp.com")


async def _fetch_whatsapp_media_payload(
    instance_name: Optional[str],
    remote_jid: Optional[str],
    remote_message_id: Optional[str],
    media_type: Optional[str],
    media_url: Optional[str],
) -> tuple[Optional[bytes], Optional[str], Optional[str]]:
    # Prioritize Evolution decode endpoint first. Direct WhatsApp CDN URLs can return
    # encrypted bytes (still 200) that browsers cannot play inline.
    if instance_name and remote_jid and remote_message_id:
        body = {
            "message": {
                "key": {
                    "id": remote_message_id,
                    "remoteJid": remote_jid,
                }
            },
            "convertToMp4": _normalize_media_type(media_type) in {"video", "gif"},
        }

        try:
            async with httpx.AsyncClient(timeout=35.0) as client:
                response = await client.post(
                    f"{EVOLUTION_API_URL}/chat/getBase64FromMediaMessage/{instance_name}",
                    json=body,
                    headers={"apikey": EVOLUTION_API_KEY},
                )
            if response.status_code in (200, 201):
                payload = response.json() if response.content else {}
                media_bytes, mime_type, file_name = _extract_media_payload(payload)
                if media_bytes:
                    final_mime, final_name = _finalize_media_metadata(
                        media_type=media_type,
                        remote_message_id=remote_message_id,
                        mime_type=mime_type,
                        file_name=file_name,
                    )
                    return media_bytes, final_mime, final_name
            else:
                response_detail = ""
                try:
                    payload = response.json()
                    if isinstance(payload, dict):
                        response_detail = str(
                            payload.get("response", {}).get("message")
                            or payload.get("message")
                            or payload
                        )
                except Exception:
                    response_detail = response.text[:180] if response.text else ""
                logger.warning(
                    "getBase64FromMediaMessage failed (%s) for instance=%s msg=%s detail=%s",
                    response.status_code,
                    instance_name,
                    remote_message_id,
                    response_detail[:180],
                )
        except Exception as exc:
            logger.warning(
                "getBase64FromMediaMessage request error for instance=%s msg=%s: %s",
                instance_name,
                remote_message_id,
                exc,
            )

    # Fallback to direct URL only for non-WhatsApp CDN hosts.
    # mmg.whatsapp.* often serves encrypted payloads (unplayable without decrypt step).
    if _is_whatsapp_cdn_media_url(media_url):
        return None, None, None

    direct_bytes, direct_mime, direct_name = await _fetch_remote_media_url(media_url or "")
    if not direct_bytes:
        return None, None, None

    final_mime, final_name = _finalize_media_metadata(
        media_type=media_type,
        remote_message_id=remote_message_id,
        mime_type=direct_mime,
        file_name=direct_name,
    )
    return direct_bytes, final_mime, final_name


def _get_telegram_bot_token() -> str:
    token = settings.telegram_bot_token or os.getenv("TELEGRAM_BOT_TOKEN") or ""
    return token.strip()


def _get_telegram_bot_username_hint() -> str:
    username = settings.telegram_bot_username or os.getenv("TELEGRAM_BOT_USERNAME") or ""
    return username.strip().lstrip("@")


def _get_telegram_webhook_secret() -> str:
    secret = settings.telegram_webhook_secret or os.getenv("TELEGRAM_WEBHOOK_SECRET") or ""
    return secret.strip()


def _telegram_api_url(token: str, method: str) -> str:
    return f"{TELEGRAM_API_BASE}/bot{token}/{method}"


async def _telegram_call(method: str, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    token = _get_telegram_bot_token()
    if not token:
        raise HTTPException(503, "Telegram no configurado en el servidor")

    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.post(_telegram_api_url(token, method), json=payload or {})

    if response.status_code != 200:
        logger.error("Telegram API error (%s): %s", method, response.text[:300])
        raise HTTPException(502, "No se pudo contactar con Telegram")

    data = response.json() if response.content else {}
    if not isinstance(data, dict) or not data.get("ok"):
        logger.error("Telegram API invalid response (%s): %s", method, str(data)[:300])
        raise HTTPException(502, "Telegram devolvio un error al procesar la solicitud")
    return data


async def _telegram_send_text(chat_id: str, text: str) -> Optional[str]:
    payload = {"chat_id": chat_id, "text": text}
    data = await _telegram_call("sendMessage", payload)
    result = data.get("result") if isinstance(data.get("result"), dict) else {}
    message_id = result.get("message_id")
    return str(message_id) if message_id is not None else None


def _extract_telegram_message_text(message: Dict[str, Any]) -> str:
    text = message.get("text")
    if isinstance(text, str) and text.strip():
        return text.strip()

    caption = message.get("caption")
    if isinstance(caption, str) and caption.strip():
        return caption.strip()

    if message.get("photo"):
        return "[foto]"
    if message.get("video"):
        return "[video]"
    if message.get("audio"):
        return "[audio]"
    if message.get("document"):
        return "[documento]"
    if message.get("sticker"):
        return "[sticker]"

    return ""


def _extract_telegram_media_info(message: Dict[str, Any]) -> tuple[Optional[str], Optional[str]]:
    if message.get("photo"):
        return "image", None
    if message.get("video"):
        return "video", None
    if message.get("audio") or message.get("voice"):
        return "audio", None
    if message.get("document"):
        return "document", None
    if message.get("sticker"):
        return "sticker", None
    return None, None


def _telegram_contact_name(chat: Dict[str, Any], sender: Dict[str, Any]) -> str:
    title = chat.get("title")
    if isinstance(title, str) and title.strip():
        return title.strip()

    first_name = sender.get("first_name") if isinstance(sender.get("first_name"), str) else ""
    last_name = sender.get("last_name") if isinstance(sender.get("last_name"), str) else ""
    full_name = f"{first_name} {last_name}".strip()
    if full_name:
        return full_name

    username = sender.get("username") if isinstance(sender.get("username"), str) else ""
    if username:
        return f"@{username}"

    chat_username = chat.get("username") if isinstance(chat.get("username"), str) else ""
    if chat_username:
        return f"@{chat_username}"

    chat_id = chat.get("id")
    return str(chat_id) if chat_id is not None else "Telegram"


def _extract_telegram_update_message(body: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    for key in ("message", "edited_message", "channel_post", "edited_channel_post"):
        candidate = body.get(key)
        if isinstance(candidate, dict):
            return candidate
    return None


async def _ensure_telegram_webhook() -> str:
    bot_data = await _telegram_call("getMe")
    bot_info = bot_data.get("result") if isinstance(bot_data.get("result"), dict) else {}

    username = (
        bot_info.get("username")
        if isinstance(bot_info.get("username"), str) and bot_info.get("username")
        else _get_telegram_bot_username_hint()
    )
    if not username:
        raise HTTPException(502, "No se pudo leer el username del bot de Telegram")

    webhook_payload: Dict[str, Any] = {"url": TELEGRAM_WEBHOOK_URL}
    secret_token = _get_telegram_webhook_secret()
    if secret_token:
        webhook_payload["secret_token"] = secret_token

    await _telegram_call("setWebhook", webhook_payload)
    return username


def _should_refresh_chat_snapshot(config: Dict[str, Any], now_utc: datetime) -> bool:
    """Throttle expensive chat snapshot pulls from Evolution API."""
    last_sync_raw = config.get("last_chat_sync_at")
    if not isinstance(last_sync_raw, str):
        return True

    try:
        last_sync = datetime.fromisoformat(last_sync_raw.replace("Z", "+00:00"))
        return (now_utc - last_sync).total_seconds() >= 45
    except Exception:
        return True


async def _sync_whatsapp_chats_from_evolution(
    supabase,
    account: Dict[str, Any],
    max_chats: int = 1000,
) -> int:
    """Backfill WhatsApp chats from Evolution so UI can render full list fast."""
    account_id = account.get("id")
    instance_name = account.get("instance_name")
    if not account_id or not instance_name:
        return 0

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{EVOLUTION_API_URL}/chat/findChats/{instance_name}",
                json={"where": {}},
                headers={"apikey": EVOLUTION_API_KEY},
            )

        if resp.status_code != 200:
            logger.warning(
                "Chat sync skipped for %s: status=%s body=%s",
                instance_name,
                resp.status_code,
                resp.text[:200],
            )
            return 0

        payload = resp.json()
        chats_raw = payload.get("data", payload) if isinstance(payload, dict) else payload
        if not isinstance(chats_raw, list):
            return 0

        rows = []
        for chat in chats_raw[:max_chats]:
            if not isinstance(chat, dict):
                continue

            remote_jid = chat.get("remoteJid")
            if not isinstance(remote_jid, str) or not remote_jid:
                continue

            last_message = chat.get("lastMessage") if isinstance(chat.get("lastMessage"), dict) else {}
            msg_payload = last_message.get("message") if isinstance(last_message.get("message"), dict) else {}
            msg_type = last_message.get("messageType") if isinstance(last_message.get("messageType"), str) else None

            last_message_at = chat.get("updatedAt")
            if not isinstance(last_message_at, str) or not last_message_at:
                last_message_at = _iso_from_epoch_seconds(last_message.get("messageTimestamp"))

            avatar_url = (
                chat.get("profilePicUrl")
                or chat.get("profilePictureUrl")
                or chat.get("profile_pic_url")
            )
            if not isinstance(avatar_url, str) or not avatar_url:
                avatar_url = None

            is_group = remote_jid.endswith("@g.us")
            # For groups, use subject/name from chat metadata; pushName is the sender
            if is_group:
                display_name = (chat.get("subject") or chat.get("name") or chat.get("pushName") or remote_jid.split("@")[0])[:120]
            else:
                display_name = (chat.get("pushName") or chat.get("name") or remote_jid.split("@")[0])[:120]

            rows.append(
                {
                    "account_id": account_id,
                    "remote_jid": remote_jid,
                    "contact_name": display_name,
                    "contact_phone": remote_jid.split("@")[0],
                    "contact_avatar_url": avatar_url,
                    "is_group": is_group,
                    "last_message_at": last_message_at,
                    "last_message_preview": _message_preview(msg_payload, msg_type),
                }
            )

        if not rows:
            return 0

        await supabase.table("external_chats").upsert(
            rows,
            on_conflict="account_id,remote_jid",
        ).execute()
        logger.info("Synced %s WhatsApp chats for instance %s", len(rows), instance_name)
        return len(rows)
    except Exception as e:
        logger.warning("WhatsApp chat sync failed for %s: %s", instance_name, e)
        return 0


async def _sync_whatsapp_messages_for_chat(
    supabase,
    chat_id: str,
    remote_jid: str,
    instance_name: str,
    max_messages: int = 80,
) -> int:
    """Hydrate a chat history from Evolution when local DB is empty."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{EVOLUTION_API_URL}/chat/findMessages/{instance_name}",
                json={"where": {"key": {"remoteJid": remote_jid}}},
                headers={"apikey": EVOLUTION_API_KEY},
            )

        if resp.status_code != 200:
            logger.warning(
                "Message sync skipped for chat %s (%s): status=%s body=%s",
                chat_id,
                remote_jid,
                resp.status_code,
                resp.text[:200],
            )
            return 0

        payload = resp.json()
        records = []
        if isinstance(payload, dict):
            messages_obj = payload.get("messages")
            if isinstance(messages_obj, dict) and isinstance(messages_obj.get("records"), list):
                records = messages_obj.get("records") or []
            elif isinstance(payload.get("data"), list):
                records = payload.get("data") or []
        elif isinstance(payload, list):
            records = payload

        if not records:
            return 0

        rows = []
        for record in records[-max_messages:]:
            if not isinstance(record, dict):
                continue

            key = record.get("key") if isinstance(record.get("key"), dict) else {}
            message = record.get("message") if isinstance(record.get("message"), dict) else {}
            media_type, media_url = _extract_media_info(message, record)
            remote_message_id = key.get("id") or ""
            if not remote_message_id:
                continue

            content = _extract_message_text(message, media_type)
            row = {
                "chat_id": chat_id,
                "remote_message_id": remote_message_id,
                "direction": "out" if key.get("fromMe") else "in",
                "content": content,
                "sender_name": record.get("pushName") or remote_jid.split("@")[0],
                "sender_jid": key.get("participant") or key.get("remoteJid") or remote_jid,
            }
            if media_type:
                row["media_type"] = media_type
            if media_url:
                row["media_url"] = media_url
            created_at = _iso_from_epoch_seconds(record.get("messageTimestamp"))
            if created_at:
                row["created_at"] = created_at
            rows.append(row)

        if not rows:
            return 0

        remote_ids: Set[str] = {row["remote_message_id"] for row in rows if row.get("remote_message_id")}
        existing_ids: Set[str] = set()
        if remote_ids:
            existing = await (
                supabase.table("external_messages")
                .select("remote_message_id")
                .eq("chat_id", chat_id)
                .in_("remote_message_id", list(remote_ids))
                .execute()
            )
            existing_ids = {
                msg.get("remote_message_id")
                for msg in (existing.data or [])
                if msg.get("remote_message_id")
            }

        new_rows = [
            row for row in rows
            if row.get("remote_message_id") not in existing_ids
        ]
        if not new_rows:
            return 0

        await supabase.table("external_messages").insert(new_rows).execute()

        newest = new_rows[-1]
        await supabase.table("external_chats").update(
            {
                "last_message_at": newest.get("created_at") or datetime.now(timezone.utc).isoformat(),
                "last_message_preview": _message_preview(
                    {"conversation": newest.get("content")},
                    newest.get("media_type"),
                ),
            }
        ).eq("id", chat_id).execute()

        logger.info("Synced %s messages for chat %s (%s)", len(new_rows), chat_id, remote_jid)
        return len(new_rows)
    except Exception as e:
        logger.warning("WhatsApp message sync failed for chat %s: %s", chat_id, e)
        return 0

class LinkWhatsAppRequest(BaseModel):
    workspace_id: Optional[str] = None  # No longer required - connections are user-level

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


def _parse_directives_metadata(directives: Optional[str]) -> tuple[Optional[str], Optional[str], str]:
    """Parse optional agent metadata embedded in directives text."""
    if not directives:
        return None, None, ""

    agent_id: Optional[str] = None
    agent_name: Optional[str] = None
    notes: list[str] = []

    for raw_line in directives.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith("AGENT::"):
            value = line[len("AGENT::"):].strip()
            if value:
                agent_name = value
            continue
        if line.startswith("AGENT_ID:"):
            value = line[len("AGENT_ID:"):].strip()
            if value:
                agent_id = value
            continue
        if line.startswith("AGENT_NAME:"):
            value = line[len("AGENT_NAME:"):].strip()
            if value:
                agent_name = value
            continue
        if line.startswith("INSTRUCCIONES:"):
            value = line[len("INSTRUCCIONES:"):].strip()
            if value:
                notes.append(value)
            continue
        notes.append(line)

    return agent_id, agent_name, "\n".join(notes).strip()


def _format_agent_config(config: object) -> str:
    if not isinstance(config, dict):
        return "- sin configuracion adicional"

    lines = []
    for key, value in config.items():
        if value in (None, "", [], {}):
            continue
        if isinstance(value, (dict, list)):
            rendered = json.dumps(value, ensure_ascii=False)
        else:
            rendered = str(value)
        lines.append(f"- {key}: {rendered}")

    return "\n".join(lines) if lines else "- sin configuracion adicional"


# ── WhatsApp Account Management ──

@router.post("/whatsapp/link")
async def link_whatsapp(
    request: LinkWhatsAppRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Start WhatsApp linking process. Returns QR code.

    Flow:
    1. Delete any existing instance for this user (clean slate)
    2. Create a new instance with qrcode=true
    3. The create response includes the QR in qrcode.base64
       (already a full data URI: "data:image/png;base64,...")
    4. Save account in DB and return QR to frontend
    """
    supabase = await get_async_service_role_client()

    instance_name = f"pulse-wa-{user_id[:8]}"

    async with httpx.AsyncClient(timeout=30.0) as client:
        # Clean up any previous instance for this user
        try:
            await client.delete(
                f"{EVOLUTION_API_URL}/instance/delete/{instance_name}",
                headers={"apikey": EVOLUTION_API_KEY},
            )
            logger.info(f"Deleted previous instance: {instance_name}")
        except Exception:
            pass  # Instance may not exist, that's fine

        # Create instance with QR code generation
        resp = await client.post(
            f"{EVOLUTION_API_URL}/instance/create",
            json={
                "instanceName": instance_name,
                "integration": "WHATSAPP-BAILEYS",
                "qrcode": True,
                "webhook": {
                    "url": WEBHOOK_BASE_URL,
                    "byEvents": True,
                    "events": [
                        "MESSAGES_UPSERT",
                        "MESSAGES_UPDATE",
                        "CONNECTION_UPDATE",
                    ],
                },
            },
            headers={"apikey": EVOLUTION_API_KEY},
        )

        if resp.status_code not in (200, 201):
            logger.error(f"Evolution API create error: {resp.status_code} {resp.text}")
            raise HTTPException(502, "No se pudo crear la instancia de WhatsApp")

        data = resp.json()
        logger.info(f"Instance created: {instance_name}, status: {data.get('instance', {}).get('status')}")

        # QR comes as data:image/png;base64,... (full data URI)
        qr_data = data.get("qrcode", {})
        qr_base64 = qr_data.get("base64", "")

        # If QR wasn't ready in create response, try connect endpoint
        if not qr_base64:
            logger.info(f"QR not in create response, trying connect endpoint for {instance_name}")
            for attempt in range(3):
                await asyncio.sleep(2)
                connect_resp = await client.get(
                    f"{EVOLUTION_API_URL}/instance/connect/{instance_name}",
                    headers={"apikey": EVOLUTION_API_KEY},
                )
                if connect_resp.status_code == 200:
                    connect_data = connect_resp.json()
                    qr_base64 = connect_data.get("base64", "")
                    if qr_base64:
                        logger.info(f"Got QR from connect endpoint on attempt {attempt + 1}")
                        break

    # Save account in DB
    await supabase.table("external_accounts").upsert({
        "user_id": user_id,
        "provider": "whatsapp",
        "instance_id": instance_name,
        "instance_name": instance_name,
        "status": "qr_pending",
    }, on_conflict="user_id,provider").execute()

    return {"qr_code": qr_base64, "instance_name": instance_name}


@router.get("/whatsapp/qr")
async def get_whatsapp_qr(
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Get current QR code and connection status for WhatsApp linking.

    Returns:
      qr_code: data URI string (data:image/png;base64,...) or empty
      status: "connecting" | "open" | "close" | "unknown"
    """
    supabase = await get_async_service_role_client()

    account = await supabase.table("external_accounts")\
        .select("instance_name, status")\
        .eq("user_id", user_id)\
        .eq("provider", "whatsapp")\
        .maybe_single()\
        .execute()

    if not account or not account.data:
        raise HTTPException(404, "No hay cuenta de WhatsApp pendiente")

    instance_name = account.data["instance_name"]

    async with httpx.AsyncClient(timeout=15.0) as client:
        # First check connection state
        state_resp = await client.get(
            f"{EVOLUTION_API_URL}/instance/connectionState/{instance_name}",
            headers={"apikey": EVOLUTION_API_KEY},
        )
        connection_state = "unknown"
        if state_resp.status_code == 200:
            state_data = state_resp.json()
            connection_state = state_data.get("instance", {}).get("state", "unknown")
            logger.info(f"Connection state for {instance_name}: {connection_state}")

        # If already connected, update DB and return
        if connection_state == "open":
            await supabase.table("external_accounts")\
                .update({"status": "connected"})\
                .eq("instance_name", instance_name)\
                .execute()
            return {"qr_code": "", "status": "connected"}

        # Get fresh QR code via connect endpoint
        resp = await client.get(
            f"{EVOLUTION_API_URL}/instance/connect/{instance_name}",
            headers={"apikey": EVOLUTION_API_KEY},
        )
        if resp.status_code != 200:
            logger.error(f"Connect endpoint error: {resp.status_code} {resp.text}")
            raise HTTPException(502, "No se pudo obtener el QR")

        data = resp.json()
        # base64 is already a full data URI: data:image/png;base64,...
        return {"qr_code": data.get("base64", ""), "status": connection_state}


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


@router.post("/telegram/link")
async def link_telegram(
    request: LinkWhatsAppRequest,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Start Telegram linking flow via bot deep-link token."""
    if not _get_telegram_bot_token():
        raise HTTPException(503, "Telegram no esta configurado en este servidor: falta TELEGRAM_BOT_TOKEN")

    supabase = await get_async_service_role_client()
    bot_username = await _ensure_telegram_webhook()
    link_token = secrets.token_urlsafe(24)
    now_iso = datetime.now(timezone.utc).isoformat()

    existing = await (
        supabase.table("external_accounts")
        .select("id, config")
        .eq("user_id", user_id)
        .eq("provider", "telegram")
        .maybe_single()
        .execute()
    )
    existing_config = existing.data.get("config") if existing and existing.data else {}
    if not isinstance(existing_config, dict):
        existing_config = {}

    config = {
        **existing_config,
        "telegram_link_token": link_token,
        "telegram_link_token_created_at": now_iso,
        "telegram_bot_username": bot_username,
    }

    await supabase.table("external_accounts").upsert(
        {
            "user_id": user_id,
            "provider": "telegram",
            "instance_name": bot_username,
            "telegram_chat_id": None,
            "status": "link_pending",
            "config": config,
        },
        on_conflict="user_id,provider",
    ).execute()

    return {
        "deep_link_url": f"https://t.me/{bot_username}?start={link_token}",
        "bot_username": bot_username,
        "status": "link_pending",
    }


@router.delete("/telegram/unlink")
async def unlink_telegram(
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Disconnect Telegram account and cascade-remove chats/messages."""
    supabase = await get_async_service_role_client()
    await (
        supabase.table("external_accounts")
        .delete()
        .eq("user_id", user_id)
        .eq("provider", "telegram")
        .execute()
    )
    return {"status": "unlinked"}


# ── Account Status ──

@router.get("/accounts")
async def list_accounts(
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """List user's linked messaging accounts.

    For accounts whose DB status is 'connected', we verify live state from
    Evolution API. If the instance is no longer open (e.g. user disconnected
    from their phone), we update the DB to 'disconnected' so the UI reflects
    the real state.
    """
    supabase = await get_async_service_role_client()

    result = await supabase.table("external_accounts")\
        .select("id, provider, status, phone_number, away_mode, away_message, away_directives, instance_name, created_at")\
        .eq("user_id", user_id)\
        .execute()

    accounts = result.data or []

    # For WhatsApp accounts that appear connected, verify live state
    async with httpx.AsyncClient(timeout=10.0) as client:
        for account in accounts:
            if account.get("provider") != "whatsapp":
                continue
            if account.get("status") not in ("connected", "connecting", "qr_pending"):
                continue

            instance_name = account.get("instance_name")
            if not instance_name:
                continue

            try:
                state_resp = await client.get(
                    f"{EVOLUTION_API_URL}/instance/connectionState/{instance_name}",
                    headers={"apikey": EVOLUTION_API_KEY},
                )
                if state_resp.status_code == 200:
                    state_data = state_resp.json()
                    live_state = state_data.get("instance", {}).get("state", "unknown")
                    logger.info(f"Live connection state for {instance_name}: {live_state}")

                    if live_state == "open":
                        if account["status"] != "connected":
                            await supabase.table("external_accounts")\
                                .update({"status": "connected"})\
                                .eq("id", account["id"])\
                                .execute()
                            account["status"] = "connected"
                    else:
                        # Not open — mark as disconnected if DB says connected
                        if account["status"] in ("connected", "connecting"):
                            await supabase.table("external_accounts")\
                                .update({"status": "disconnected"})\
                                .eq("id", account["id"])\
                                .execute()
                            account["status"] = "disconnected"
                elif state_resp.status_code == 404:
                    # Instance doesn't exist in Evolution API anymore
                    if account["status"] in ("connected", "connecting", "qr_pending"):
                        await supabase.table("external_accounts")\
                            .update({"status": "disconnected"})\
                            .eq("id", account["id"])\
                            .execute()
                        account["status"] = "disconnected"
            except Exception as e:
                logger.warning(f"Could not check live state for {instance_name}: {e}")

    # Remove internal field before returning
    for account in accounts:
        account.pop("instance_name", None)

    return {"accounts": accounts}


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
    accounts_q = (
        supabase.table("external_accounts")
        .select("id, provider, status, instance_name, config")
        .eq("user_id", user_id)
    )
    if provider:
        accounts_q = accounts_q.eq("provider", provider)
    accounts_result = await accounts_q.execute()
    accounts = accounts_result.data or []
    account_ids = [a["id"] for a in accounts]

    if not account_ids:
        return {"chats": []}

    async def fetch_chats():
        return await (
            supabase.table("external_chats")
            .select("*, account:external_accounts(provider)")
            .in_("account_id", account_ids)
            .order("last_message_at", desc=True)
            .limit(500)
            .execute()
        )

    chats_result = await fetch_chats()
    chats = chats_result.data or []

    # If WhatsApp looks nearly empty, bootstrap from Evolution API.
    if provider == "whatsapp" and len(chats) < 20:
        now_utc = datetime.now(timezone.utc)
        for account in accounts:
            if account.get("provider") != "whatsapp":
                continue
            if account.get("status") != "connected":
                continue
            if not account.get("instance_name"):
                continue

            config = account.get("config") if isinstance(account.get("config"), dict) else {}
            if not _should_refresh_chat_snapshot(config, now_utc):
                continue

            synced_count = await _sync_whatsapp_chats_from_evolution(supabase, account)
            if synced_count:
                new_config = {
                    **config,
                    "last_chat_sync_at": now_utc.isoformat(),
                    "last_chat_sync_count": synced_count,
                }
                await (
                    supabase.table("external_accounts")
                    .update({"config": new_config})
                    .eq("id", account["id"])
                    .execute()
                )

        chats_result = await fetch_chats()
        chats = chats_result.data or []

    return {"chats": chats}


@router.get("/unread-summary")
async def get_messaging_unread_summary(
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Return unread totals for external messaging (user-level, cross-workspace)."""
    supabase = await get_async_service_role_client()

    accounts_q = (
        supabase.table("external_accounts")
        .select("id")
        .eq("user_id", user_id)
    )

    accounts_result = await accounts_q.execute()
    accounts = accounts_result.data or []
    if not accounts:
        return {"total_unread": 0, "chats_with_unread": 0}

    account_ids = [a["id"] for a in accounts]
    # workspace_id no longer tracked - connections are user-level

    chats_result = await (
        supabase.table("external_chats")
        .select("id, account_id, unread_count")
        .in_("account_id", account_ids)
        .gt("unread_count", 0)
        .execute()
    )
    unread_chats = chats_result.data or []

    total_unread = 0
    for chat in unread_chats:
        count = int(chat.get("unread_count") or 0)
        if count <= 0:
            continue
        total_unread += count

    return {
        "total_unread": total_unread,
        "chats_with_unread": len(unread_chats),
    }


@router.get("/accounts/{account_id}/auto-replies")
async def get_auto_reply_summary(
    account_id: str,
    limit: int = 30,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Recent auto-replies sent by AI for a specific external account."""
    supabase = await get_async_service_role_client()

    account = await (
        supabase.table("external_accounts")
        .select("id, user_id")
        .eq("id", account_id)
        .maybe_single()
        .execute()
    )
    if not account or not account.data or account.data.get("user_id") != user_id:
        raise HTTPException(404, "Cuenta no encontrada")

    # Limit candidate chats to keep PostgREST query size bounded.
    # Large `in_(chat_id, ...)` lists can trigger transport/protocol failures.
    chats_result = await (
        supabase.table("external_chats")
        .select("id, contact_name, remote_jid, last_message_at")
        .eq("account_id", account_id)
        .order("last_message_at", desc=True)
        .limit(200)
        .execute()
    )
    chats = chats_result.data or []
    if not chats:
        return {"items": [], "count": 0}

    chat_map = {
        chat["id"]: {
            "contact_name": chat.get("contact_name") or chat.get("remote_jid") or "Contacto",
            "remote_jid": chat.get("remote_jid"),
        }
        for chat in chats
        if chat.get("id")
    }
    chat_ids = list(chat_map.keys())
    if not chat_ids:
        return {"items": [], "count": 0}

    safe_limit = max(1, min(limit, 100))
    chunk_size = 40
    collected: list[dict] = []

    for index in range(0, len(chat_ids), chunk_size):
        chunk_chat_ids = chat_ids[index:index + chunk_size]
        if not chunk_chat_ids:
            continue

        chunk_result = None
        chunk_error: Optional[Exception] = None
        for attempt in range(2):
            try:
                chunk_result = await (
                    supabase.table("external_messages")
                    .select("id, chat_id, content, created_at, status")
                    .in_("chat_id", chunk_chat_ids)
                    .eq("direction", "out")
                    .eq("is_auto_reply", True)
                    .order("created_at", desc=True)
                    .limit(safe_limit)
                    .execute()
                )
                chunk_error = None
                break
            except Exception as exc:
                chunk_error = exc
                if attempt == 0:
                    await asyncio.sleep(0.2)

        if chunk_error is not None:
            logger.warning(
                "Auto-reply summary chunk failed for account %s (chunk %s): %s",
                account_id,
                index // chunk_size,
                chunk_error,
            )
            continue

        collected.extend(chunk_result.data or [])

    if not collected:
        return {"items": [], "count": 0}

    collected.sort(key=lambda row: row.get("created_at") or "", reverse=True)
    selected = collected[:safe_limit]

    items = []
    for msg in selected:
        chat_meta = chat_map.get(msg.get("chat_id"), {})
        items.append(
            {
                "message_id": msg.get("id"),
                "chat_id": msg.get("chat_id"),
                "contact_name": chat_meta.get("contact_name", "Contacto"),
                "remote_jid": chat_meta.get("remote_jid"),
                "content": msg.get("content") or "",
                "created_at": msg.get("created_at"),
                "status": msg.get("status"),
            }
        )

    return {"items": items, "count": len(items)}


# ── Messages ──

@router.get("/messages/{message_id}/media")
async def get_message_media(
    message_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Resolve external message media through backend (avoids direct WhatsApp CDN 403)."""
    supabase = await get_async_service_role_client()

    message_result = await (
        supabase.table("external_messages")
        .select(
            "id, media_type, media_url, remote_message_id, "
            "chat:external_chats(id, remote_jid, account:external_accounts(user_id, provider, instance_name))"
        )
        .eq("id", message_id)
        .maybe_single()
        .execute()
    )
    message = message_result.data if message_result else None
    if not message:
        raise HTTPException(404, "Mensaje no encontrado")

    chat = message.get("chat") or {}
    account = chat.get("account") or {}
    if account.get("user_id") != user_id:
        raise HTTPException(404, "Mensaje no encontrado")

    provider = account.get("provider")
    media_type = message.get("media_type")
    media_url = message.get("media_url")
    remote_message_id = message.get("remote_message_id")
    remote_jid = chat.get("remote_jid")
    instance_name = account.get("instance_name")

    payload_bytes: Optional[bytes] = None
    mime_type: Optional[str] = None
    file_name: Optional[str] = None

    if provider == "whatsapp":
        payload_bytes, mime_type, file_name = await _fetch_whatsapp_media_payload(
            instance_name=instance_name,
            remote_jid=remote_jid,
            remote_message_id=remote_message_id,
            media_type=media_type,
            media_url=media_url,
        )
    elif provider == "telegram":
        payload_bytes, mime_type, file_name = await _fetch_remote_media_url(media_url or "")
        if not payload_bytes:
            raise HTTPException(404, "Este adjunto de Telegram no esta disponible para descarga")
    else:
        raise HTTPException(400, "Proveedor no soportado para multimedia")

    if not payload_bytes:
        if provider == "whatsapp":
            raise HTTPException(410, "Adjunto de WhatsApp no disponible (puede haber expirado)")
        raise HTTPException(502, "No se pudo recuperar el adjunto multimedia")

    final_mime = (mime_type or "").strip() or _default_mime_for_media_type(media_type)
    final_name = _infer_filename(remote_message_id, final_mime, file_name)
    headers = {
        "Cache-Control": "private, max-age=300",
        "Content-Disposition": f'inline; filename="{final_name}"',
    }
    return Response(content=payload_bytes, media_type=final_mime, headers=headers)


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

    chat = await (
        supabase.table("external_chats")
        .select("id, remote_jid, account:external_accounts(user_id, provider, instance_name)")
        .eq("id", chat_id)
        .maybe_single()
        .execute()
    )
    if not chat or not chat.data:
        raise HTTPException(404, "Chat no encontrado")

    account = chat.data.get("account") or {}
    if account.get("user_id") != user_id:
        raise HTTPException(404, "Chat no encontrado")

    query = supabase.table("external_messages")\
        .select("*")\
        .eq("chat_id", chat_id)\
        .order("created_at", desc=True)\
        .limit(limit)

    if before:
        query = query.lt("created_at", before)

    result = await query.execute()
    messages = result.data or []

    # If local history is empty, hydrate from Evolution API for this chat.
    if (
        not before
        and not messages
        and account.get("provider") == "whatsapp"
        and account.get("instance_name")
    ):
        synced = await _sync_whatsapp_messages_for_chat(
            supabase=supabase,
            chat_id=chat_id,
            remote_jid=chat.data.get("remote_jid", ""),
            instance_name=account.get("instance_name"),
            max_messages=max(limit, 80),
        )
        if synced:
            result = await query.execute()
            messages = result.data or []

    # Mark as read
    await supabase.table("external_chats")\
        .update({"unread_count": 0})\
        .eq("id", chat_id)\
        .execute()

    return {"messages": list(reversed(messages))}



@router.post("/chats/{chat_id}/sync-history")
async def sync_chat_history(
    chat_id: str,
    user_jwt: str = Depends(get_current_user_jwt),
    user_id: str = Depends(get_current_user_id),
):
    """Force a one-shot WhatsApp history sync for a chat."""
    supabase = await get_async_service_role_client()

    chat = await (
        supabase.table("external_chats")
        .select("id, remote_jid, account:external_accounts(user_id, provider, instance_name)")
        .eq("id", chat_id)
        .maybe_single()
        .execute()
    )
    if not chat or not chat.data:
        raise HTTPException(404, "Chat no encontrado")

    account = chat.data.get("account") or {}
    if account.get("user_id") != user_id:
        raise HTTPException(404, "Chat no encontrado")

    if account.get("provider") != "whatsapp" or not account.get("instance_name"):
        return {"synced": 0}

    synced = await _sync_whatsapp_messages_for_chat(
        supabase=supabase,
        chat_id=chat_id,
        remote_jid=chat.data.get("remote_jid", ""),
        instance_name=account.get("instance_name"),
        max_messages=300,
    )
    return {"synced": synced}

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
    chat = await (
        supabase.table("external_chats")
        .select("*, account:external_accounts(instance_name, provider, user_id, telegram_chat_id)")
        .eq("id", chat_id)
        .maybe_single()
        .execute()
    )

    if not chat or not chat.data:
        raise HTTPException(404, "Chat no encontrado")

    chat_data = chat.data
    account = chat_data["account"]
    if account.get("user_id") != user_id:
        raise HTTPException(404, "Chat no encontrado")

    remote_message_id = ""

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
            try:
                response_payload = resp.json() if resp.content else {}
            except Exception:
                response_payload = {}
            remote_message_id = _extract_remote_message_id(response_payload)

    elif account["provider"] == "telegram":
        remote_jid = chat_data.get("remote_jid")
        telegram_chat_id = ""
        if isinstance(remote_jid, str) and remote_jid.startswith("telegram:"):
            telegram_chat_id = remote_jid.split(":", 1)[1]
        if not telegram_chat_id:
            telegram_chat_id = str(account.get("telegram_chat_id") or "")

        if not telegram_chat_id:
            raise HTTPException(400, "Este chat de Telegram no esta vinculado correctamente")

        remote_message_id = await _telegram_send_text(telegram_chat_id, request.content) or ""

    else:
        raise HTTPException(400, "Proveedor de mensajeria no soportado")

    # Save outgoing message
    payload = {
        "chat_id": chat_id,
        "direction": "out",
        "content": request.content,
        "status": "sent",
    }
    if remote_message_id:
        payload["remote_message_id"] = remote_message_id

    msg = await supabase.table("external_messages").insert(payload).execute()

    # Update chat last message
    await supabase.table("external_chats").update({
        "last_message_at": "now()",
        "last_message_preview": request.content[:100],
    }).eq("id", chat_id).execute()

    return {"message": msg.data[0] if msg.data else None}


# ── Webhook (receives messages from Evolution API) ──

def _normalize_webhook_event(raw_event: str, event_suffix: Optional[str]) -> str:
    """Normalize Evolution event names from payload and suffix route variants."""
    event = (raw_event or "").strip()
    suffix = (event_suffix or "").strip().lower()

    if not event and suffix:
        suffix_map = {
            "connection-update": "connection.update",
            "messages-upsert": "messages.upsert",
            "messages-update": "messages.update",
        }
        event = suffix_map.get(suffix, suffix.replace("-", "."))

    return event.lower().replace("_", ".").replace("-", ".")

@router.post("/webhook/whatsapp")
@router.post("/webhook/whatsapp/{event_suffix}")
async def whatsapp_webhook(request: Request):
    """Receive incoming WhatsApp messages from Evolution API."""
    try:
        body = await request.json()
    except Exception:
        return {"status": "ignored"}
    event_suffix = request.path_params.get("event_suffix")
    event = _normalize_webhook_event(body.get("event", ""), event_suffix)
    instance = body.get("instance", "")
    data = body.get("data", {})

    if isinstance(instance, dict):
        instance = (
            instance.get("instanceName")
            or instance.get("instance_name")
            or instance.get("name")
            or ""
        )

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
                        # Reserved for future phone extraction from connection metadata.
                        pass
            except Exception:
                pass

        return {"status": "ok"}

    if event == "messages.upsert":
        supabase = await get_async_service_role_client()

        # Get account
        account_result = await supabase.table("external_accounts")\
            .select("id, user_id, workspace_id, away_mode, away_message, away_directives, style_profile")\
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
            message = msg_data.get("message", {}) if isinstance(msg_data.get("message"), dict) else {}
            media_type, media_url = _extract_media_info(message, msg_data if isinstance(msg_data, dict) else None)

            from_me = key.get("fromMe", False)
            remote_jid = key.get("remoteJid", "")
            if not remote_jid:
                continue

            is_group = "@g.us" in remote_jid

            # For groups, participant is the actual sender; for 1:1, it's the remote_jid
            sender_jid = key.get("participant", remote_jid) if is_group else remote_jid
            sender_name = msg_data.get("pushName", "") or sender_jid.split("@")[0]

            # Extract text content
            text = _extract_message_text(message, media_type)

            # Get or create chat
            chat_result = await supabase.table("external_chats")\
                .select("id, contact_name, auto_reply_enabled, auto_reply_directives, unread_count, is_group")\
                .eq("account_id", account["id"])\
                .eq("remote_jid", remote_jid)\
                .maybe_single()\
                .execute()

            if chat_result and chat_result.data:
                chat_id = chat_result.data["id"]
                chat_config = chat_result.data
            else:
                # Create new chat — for groups, try to get the group subject
                if is_group:
                    group_display_name = remote_jid.split("@")[0]
                    # Try to fetch group name from Evolution API
                    try:
                        async with httpx.AsyncClient(timeout=5.0) as http:
                            resp = await http.get(
                                f"{EVOLUTION_API_URL}/group/findGroupInfos/{instance}",
                                params={"groupJid": remote_jid},
                                headers={"apikey": EVOLUTION_API_KEY},
                            )
                            if resp.status_code == 200:
                                group_info = resp.json()
                                group_display_name = group_info.get("subject") or group_info.get("name") or group_display_name
                    except Exception as e:
                        logger.debug(f"Could not fetch group name for {remote_jid}: {e}")
                    chat_display_name = group_display_name
                else:
                    chat_display_name = sender_name

                new_chat = await supabase.table("external_chats").insert({
                    "account_id": account["id"],
                    "remote_jid": remote_jid,
                    "contact_name": chat_display_name,
                    "contact_phone": remote_jid.split("@")[0],
                    "is_group": is_group,
                }).execute()
                chat_id = new_chat.data[0]["id"]
                chat_config = {"contact_name": chat_display_name, "auto_reply_enabled": None, "auto_reply_directives": None, "unread_count": 0}

            remote_message_id = key.get("id", "") or _extract_remote_message_id(msg_data)
            if remote_message_id:
                exists = await supabase.table("external_messages")\
                    .select("id")\
                    .eq("chat_id", chat_id)\
                    .eq("remote_message_id", remote_message_id)\
                    .limit(1)\
                    .execute()
                if exists.data:
                    continue

            # For incoming messages, check for outgoing echo duplicates
            if not from_me and text:
                recent_threshold = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
                recent_out = await supabase.table("external_messages")\
                    .select("id, content, created_at, is_auto_reply, remote_message_id")\
                    .eq("chat_id", chat_id)\
                    .eq("direction", "out")\
                    .gte("created_at", recent_threshold)\
                    .order("created_at", desc=True)\
                    .limit(30)\
                    .execute()
                if _is_probable_outgoing_echo(text, recent_out.data or []):
                    logger.info("Skipping probable outgoing echo in chat %s", chat_id)
                    continue

            # Save message (both incoming AND outgoing from phone)
            direction = "out" if from_me else "in"
            msg_payload = {
                "chat_id": chat_id,
                "remote_message_id": remote_message_id,
                "direction": direction,
                "content": text,
                "sender_name": sender_name if not from_me else None,
                "sender_jid": sender_jid,
            }
            if media_type:
                msg_payload["media_type"] = media_type
            if media_url:
                msg_payload["media_url"] = media_url
            if from_me:
                msg_payload["status"] = "sent"
            await supabase.table("external_messages").insert(msg_payload).execute()

            # Update chat metadata — never overwrite group name with sender name
            chat_update = {
                "last_message_at": "now()",
                "last_message_preview": _message_preview(message, media_type),
            }
            # Only update contact_name for 1:1 chats (not groups)
            if not is_group:
                chat_update["contact_name"] = sender_name
            await supabase.table("external_chats").update(chat_update).eq("id", chat_id).execute()

            # Only increment unread for incoming messages
            if not from_me:
                await supabase.table("external_chats")\
                    .update({"unread_count": int(chat_config.get("unread_count") or 0) + 1})\
                    .eq("id", chat_id)\
                    .execute()

                # Fire automation trigger for incoming WhatsApp messages
                asyncio.create_task(fire_automation_trigger(
                    account.get("workspace_id", ""),
                    "whatsapp.message.received",
                    {"chat_id": chat_id, "sender": sender_name, "sender_jid": sender_jid, "text": text or "", "media_type": media_type, "instance": instance}
                ))

            # Check auto-reply (only for incoming messages, not our own)
            if not from_me:
                should_reply = False
                reply_directives = ""

                if chat_config.get("auto_reply_enabled") is True:
                    should_reply = True
                    reply_directives = chat_config.get("auto_reply_directives", "")
                elif chat_config.get("auto_reply_enabled") is None and account.get("away_mode"):
                    should_reply = True
                    reply_directives = account.get("away_directives", "")
                elif chat_config.get("auto_reply_enabled") is False:
                    should_reply = False

                should_reply_text = text or _media_placeholder(media_type)
                if should_reply and should_reply_text:
                    import asyncio
                    asyncio.create_task(
                        _auto_reply(account, chat_id, remote_jid, instance, should_reply_text, sender_name, reply_directives)
                    )

        return {"status": "ok"}

    return {"status": "ignored"}


@router.post("/webhook/telegram")
async def telegram_webhook(request: Request):
    """Receive incoming updates from Telegram Bot API."""
    secret_token = _get_telegram_webhook_secret()
    if secret_token:
        incoming_secret = request.headers.get("x-telegram-bot-api-secret-token", "")
        if incoming_secret != secret_token:
            logger.warning("Telegram webhook ignored: invalid secret token")
            return {"status": "ignored"}

    try:
        body = await request.json()
    except Exception:
        return {"status": "ignored"}

    if not isinstance(body, dict):
        return {"status": "ignored"}

    message = _extract_telegram_update_message(body)
    if not message:
        return {"status": "ignored"}

    chat = message.get("chat") if isinstance(message.get("chat"), dict) else {}
    sender = message.get("from") if isinstance(message.get("from"), dict) else {}
    chat_id_raw = chat.get("id")
    if chat_id_raw is None:
        return {"status": "ignored"}

    chat_id = str(chat_id_raw)
    text = _extract_telegram_message_text(message)
    media_type, media_url = _extract_telegram_media_info(message)
    message_id = message.get("message_id")
    remote_message_id = str(message_id) if message_id is not None else ""
    message_created_at = _iso_from_epoch_seconds(message.get("date")) or datetime.now(timezone.utc).isoformat()
    contact_name = _telegram_contact_name(chat, sender)
    chat_type = chat.get("type") if isinstance(chat.get("type"), str) else ""

    supabase = await get_async_service_role_client()

    # /start <token> links this Telegram chat to the pending Pulse account.
    if isinstance(text, str) and text.startswith("/start"):
        parts = text.split(maxsplit=1)
        link_token = parts[1].strip() if len(parts) > 1 else ""

        if not link_token:
            await _telegram_send_text(
                chat_id,
                "Entra desde Pulse y pulsa en Vincular Telegram para generar un enlace valido.",
            )
            return {"status": "start_without_token"}

        pending_accounts = await (
            supabase.table("external_accounts")
            .select("id, config")
            .eq("provider", "telegram")
            .eq("status", "link_pending")
            .execute()
        )

        target_account = None
        target_config: Dict[str, Any] = {}
        for account_candidate in pending_accounts.data or []:
            cfg = account_candidate.get("config") if isinstance(account_candidate.get("config"), dict) else {}
            if cfg.get("telegram_link_token") == link_token:
                target_account = account_candidate
                target_config = cfg
                break

        if not target_account:
            await _telegram_send_text(chat_id, "Este enlace ya no es valido. Vuelve a vincular Telegram desde Pulse.")
            return {"status": "invalid_link_token"}

        already_bound = await (
            supabase.table("external_accounts")
            .select("id")
            .eq("provider", "telegram")
            .eq("telegram_chat_id", chat_id)
            .neq("id", target_account["id"])
            .limit(1)
            .execute()
        )
        if already_bound.data:
            await _telegram_send_text(
                chat_id,
                "Este chat de Telegram ya esta vinculado a otra cuenta de Pulse.",
            )
            return {"status": "chat_already_linked"}

        username = sender.get("username") if isinstance(sender.get("username"), str) else ""
        linked_config = {
            **target_config,
            "telegram_linked_at": datetime.now(timezone.utc).isoformat(),
            "telegram_username": username,
            "telegram_user_id": str(sender.get("id")) if sender.get("id") is not None else None,
        }
        linked_config.pop("telegram_link_token", None)
        linked_config.pop("telegram_link_token_created_at", None)

        await (
            supabase.table("external_accounts")
            .update(
                {
                    "status": "connected",
                    "telegram_chat_id": chat_id,
                    "phone_number": f"@{username}" if username else chat_id,
                    "config": linked_config,
                }
            )
            .eq("id", target_account["id"])
            .execute()
        )

        await _telegram_send_text(
            chat_id,
            "Listo, Telegram ya esta vinculado con Pulse. Puedes volver a la web y empezar a responder.",
        )
        return {"status": "linked"}

    account_result = await (
        supabase.table("external_accounts")
        .select("id, away_mode, away_message")
        .eq("provider", "telegram")
        .eq("telegram_chat_id", chat_id)
        .maybe_single()
        .execute()
    )

    if not account_result or not account_result.data:
        logger.info("Telegram webhook without linked account for chat_id=%s", chat_id)
        return {"status": "no_account"}

    account = account_result.data
    remote_jid = f"telegram:{chat_id}"

    chat_result = await (
        supabase.table("external_chats")
        .select("id, auto_reply_enabled, unread_count")
        .eq("account_id", account["id"])
        .eq("remote_jid", remote_jid)
        .maybe_single()
        .execute()
    )

    if chat_result and chat_result.data:
        chat_id_db = chat_result.data["id"]
        chat_config = chat_result.data
    else:
        username = sender.get("username") if isinstance(sender.get("username"), str) else ""
        contact_phone = f"@{username}" if username else chat_id
        created_chat = await (
            supabase.table("external_chats")
            .insert(
                {
                    "account_id": account["id"],
                    "remote_jid": remote_jid,
                    "contact_name": contact_name,
                    "contact_phone": contact_phone,
                    "is_group": chat_type in ("group", "supergroup", "channel"),
                }
            )
            .execute()
        )
        chat_id_db = created_chat.data[0]["id"]
        chat_config = {"auto_reply_enabled": None, "unread_count": 0}

    if remote_message_id:
        existing_message = await (
            supabase.table("external_messages")
            .select("id")
            .eq("chat_id", chat_id_db)
            .eq("remote_message_id", remote_message_id)
            .limit(1)
            .execute()
        )
        if existing_message.data:
            return {"status": "duplicate"}

    incoming_payload = {
        "chat_id": chat_id_db,
        "remote_message_id": remote_message_id or None,
        "direction": "in",
        "content": text,
        "sender_name": contact_name,
        "sender_jid": f"telegram:{sender.get('id')}" if sender.get("id") is not None else remote_jid,
        "created_at": message_created_at,
    }
    if media_type:
        incoming_payload["media_type"] = media_type
    if media_url:
        incoming_payload["media_url"] = media_url
    await supabase.table("external_messages").insert(incoming_payload).execute()

    await (
        supabase.table("external_chats")
        .update(
            {
                "last_message_at": message_created_at,
                "last_message_preview": (text or _media_placeholder(media_type or "media"))[:100],
                "contact_name": contact_name,
                "unread_count": int(chat_config.get("unread_count") or 0) + 1,
            }
        )
        .eq("id", chat_id_db)
        .execute()
    )

    should_reply = False
    if chat_config.get("auto_reply_enabled") is True:
        should_reply = True
    elif chat_config.get("auto_reply_enabled") is None and account.get("away_mode"):
        should_reply = True

    if should_reply and text and not text.startswith("/"):
        reply_text = account.get("away_message") or "Ahora mismo no puedo responder, te contesto en cuanto pueda."
        reply_remote_id = await _telegram_send_text(chat_id, reply_text)

        auto_reply_payload = {
            "chat_id": chat_id_db,
            "direction": "out",
            "content": reply_text,
            "is_auto_reply": True,
            "status": "sent",
        }
        if reply_remote_id:
            auto_reply_payload["remote_message_id"] = reply_remote_id
        await supabase.table("external_messages").insert(auto_reply_payload).execute()

        await (
            supabase.table("external_chats")
            .update(
                {
                    "last_message_at": datetime.now(timezone.utc).isoformat(),
                    "last_message_preview": reply_text[:100],
                }
            )
            .eq("id", chat_id_db)
            .execute()
        )

    return {"status": "ok"}


async def _auto_reply(account, chat_id, remote_jid, instance, incoming_text, contact_name, directives):
    """Generate and send auto-reply using Haiku."""
    try:
        from lib.openai_client import get_async_openai_client

        supabase = await get_async_service_role_client()
        agent_id, agent_name, directive_notes = _parse_directives_metadata(directives)

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
        role_hint = (
            style_profile.get("role")
            or style_profile.get("job_title")
            or style_profile.get("occupation")
            or style_profile.get("persona")
            or ""
        )
        agent_context = ""

        selected_agent = None
        if account.get("workspace_id") and (agent_id or agent_name):
            try:
                if agent_id:
                    agent_result = await supabase.table("agent_instances")\
                        .select("id, name, system_prompt, config")\
                        .eq("id", agent_id)\
                        .eq("workspace_id", account["workspace_id"])\
                        .maybe_single()\
                        .execute()
                    selected_agent = agent_result.data if agent_result else None
                elif agent_name:
                    agents_result = await supabase.table("agent_instances")\
                        .select("id, name, system_prompt, config")\
                        .eq("workspace_id", account["workspace_id"])\
                        .execute()
                    for candidate in (agents_result.data or []):
                        name_value = candidate.get("name")
                        if not isinstance(name_value, str):
                            continue
                        if name_value.strip().lower() == agent_name.strip().lower():
                            selected_agent = candidate
                            break
            except Exception as e:
                lookup_key = agent_id or agent_name or "unknown"
                logger.warning(f"Could not load assigned agent ({lookup_key}): {e}")
                selected_agent = None

        if selected_agent:
            agent_context = (
                f"Agente asignado: {selected_agent.get('name', 'Sin nombre')}\n"
                f"System prompt del agente:\n{selected_agent.get('system_prompt', '').strip() or '(vacio)'}\n\n"
                "Configuracion del agente:\n"
                f"{_format_agent_config(selected_agent.get('config'))}"
            )
        elif agent_name:
            agent_context = f"Agente asignado (referencia): {agent_name}."

        account_directives = (account.get("away_directives") or "").strip()
        default_message = account.get("away_message") or "Estoy ocupado ahora mismo, te respondo en cuanto pueda."

        if directive_notes:
            effective_directives = directive_notes
        elif agent_id or agent_name:
            effective_directives = account_directives or default_message
        else:
            effective_directives = (directives or "").strip() or account_directives or default_message

        agent_block = ""
        if agent_context:
            agent_block = f"Contexto del agente seleccionado:\n{agent_context}\n\n"
        role_block = ""
        if isinstance(role_hint, str) and role_hint.strip():
            role_block = f"Rol/contexto profesional del usuario:\n{role_hint.strip()}\n\n"

        recent_user_lines = [
            str(msg.get("content") or "")
            for msg in (recent.data or [])
            if msg.get("direction") == "out" and isinstance(msg.get("content"), str)
        ]
        recent_user_text = "\n".join(recent_user_lines).lower()
        affectionate_re = re.compile(
            r"\b(te amo|mi amor|amor|cariñ|corazón|corazon|vida m[ií]a|mi vida|guap[ao]|cielo)\b"
        )
        affectionate_history = bool(affectionate_re.search(recent_user_text))
        explicit_affection = False
        effective_directives_lower = (effective_directives or "").lower()
        contact_name_lower = (contact_name or "").strip().lower()
        if contact_name_lower and contact_name_lower in effective_directives_lower:
            explicit_affection = any(
                marker in effective_directives_lower
                for marker in ("esposa", "pareja", "novia", "novio", "familia", "marido")
            )
        affection_allowed = affectionate_history or explicit_affection

        system_prompt = f"""Eres el asistente personal de un usuario. Estás respondiendo mensajes de WhatsApp en su nombre porque está ausente.

Estilo de comunicación del usuario:
{style_desc}

{role_block}

{agent_block}

Directrices del usuario:
{effective_directives}

Contexto de este contacto:
- Contacto actual: {contact_name}
- Historial afectivo detectado en este chat: {"sí" if affectionate_history else "no"}
- Se permiten expresiones íntimas por directrices: {"sí" if explicit_affection else "no"}

REGLAS:
- Responde como si fueras el usuario, NO como un bot
- Usa su estilo de comunicación (tono, formalidad, emojis si los usa)
- Si hay contexto de agente asignado, úsalo como marco para decidir qué responder
- Sé breve como en WhatsApp (no escribas párrafos largos)
- NO digas que eres un bot o IA
- Nunca pidas más contexto al remitente ni digas que no tienes contexto
- Nunca repitas literalmente el mensaje recibido
- Si el mensaje es vulgar o provocador, responde corto con límite cordial
- Solo usa frases íntimas (ej. "te amo", "mi amor") cuando haya contexto afectivo real con este contacto
- Si no aplica contexto afectivo, esquiva con una respuesta cálida pero neutra"""

        client = get_async_openai_client()

        response = await client.chat.completions.create(
            model="gpt-5.4-mini",
            max_tokens=300,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Conversación reciente:\n{history}\n\n{contact_name} acaba de escribir: {incoming_text}\n\nResponde como el usuario:"},
            ],
        )

        reply_text = response.choices[0].message.content

        # Send via Evolution API
        reply_remote_id = ""
        async with httpx.AsyncClient(timeout=30.0) as http_client:
            resp = await http_client.post(
                f"{EVOLUTION_API_URL}/message/sendText/{instance}",
                json={"number": remote_jid, "text": reply_text},
                headers={"apikey": EVOLUTION_API_KEY},
            )
            if resp.status_code not in (200, 201):
                raise RuntimeError(f"Auto-reply send failed: {resp.status_code} {resp.text[:200]}")
            try:
                payload = resp.json() if resp.content else {}
            except Exception:
                payload = {}
            reply_remote_id = _extract_remote_message_id(payload)

        # Save auto-reply message
        auto_reply_payload = {
            "chat_id": chat_id,
            "direction": "out",
            "content": reply_text,
            "is_auto_reply": True,
            "status": "sent",
        }
        if reply_remote_id:
            auto_reply_payload["remote_message_id"] = reply_remote_id
        await supabase.table("external_messages").insert(auto_reply_payload).execute()

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
    """Suggest a reply using AI with user's style."""
    from lib.openai_client import get_async_openai_client

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

    client = get_async_openai_client()

    response = await client.chat.completions.create(
        model="gpt-5.4-mini",
        max_tokens=300,
        messages=[
            {"role": "system", "content": f"Sugiere una respuesta para este chat de WhatsApp. Estilo del usuario: {style_desc}. Responde como el usuario, breve y natural."},
            {"role": "user", "content": f"Conversación:\n{history}\n\nSugiere la siguiente respuesta del usuario:"},
        ],
    )

    return {"suggestion": response.choices[0].message.content}


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

    await supabase.table("external_accounts")\
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
    from lib.openai_client import get_async_openai_client

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

    client = get_async_openai_client()

    response = await client.chat.completions.create(
        model="gpt-5.4-mini",
        max_tokens=500,
        messages=[
            {"role": "system", "content": "Eres un analista de comunicación. Analiza estos mensajes de WhatsApp/Telegram y genera un perfil de estilo de comunicación conciso."},
            {"role": "user", "content": f"Analiza el estilo de comunicación de estos mensajes y genera un perfil:\n\n{sample[:3000]}\n\nGenera un perfil con: tono (formal/informal), longitud típica, uso de emojis, muletillas, formalidad, idioma, y cualquier patrón notable. Formato JSON con campo 'description' (texto libre) y campos individuales."},
        ],
    )

    # Try to parse as JSON, fallback to text description
    import json
    try:
        profile = json.loads(response.choices[0].message.content)
    except json.JSONDecodeError:
        profile = {"description": response.choices[0].message.content}

    # Save profile
    await supabase.table("external_accounts")\
        .update({"style_profile": profile})\
        .eq("id", account_id)\
        .execute()

    return {"profile": profile}
