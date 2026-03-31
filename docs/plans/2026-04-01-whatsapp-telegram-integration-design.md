# WhatsApp & Telegram Integration for Pulse

## Date: 2026-04-01

## Overview
Integrate WhatsApp and Telegram into Pulse as a "Mensajería" section. Users link their personal accounts and can read/send messages from Pulse. An AI assistant (Haiku) can auto-reply when the user is away, trained on their communication style.

## Architecture

### Infrastructure
- **Evolution API** (Docker, port 8080) — handles WhatsApp connections via QR
- **Telegram Bot** (@PulseFactoriaBot) — handles Telegram via Bot API
- **Webhooks** → Pulse FastAPI backend receives all incoming messages

### Database (Pulse Supabase only)
- `external_accounts` — linked accounts (whatsapp/telegram, status, instance_id)
- `external_chats` — conversations (contact name, phone/telegram_id, last_message, unread)
- `external_messages` — messages (content, media_url, direction in/out, timestamp)
- `auto_reply_config` — away mode config + per-contact rules
- `user_style_profiles` — AI-generated communication style profile

### Auto-Reply System
1. Mode: global away toggle + per-contact/group exceptions
2. Style: auto-analyzed from last 200 messages + manual directives
3. Engine: Haiku with system prompt = style profile + user directives + contact context
4. Response flow: message arrives → check if away → generate with Haiku → send via Evolution API

### UI
- New sidebar section "Mensajería" with tabs [WhatsApp | Telegram]
- Chat list + conversation view (like WhatsApp Web)
- "Sugerir respuesta" button for manual AI assistance
- Settings: link accounts, configure away mode, style profile

## Implementation Order
1. Evolution API Docker setup + Telegram bot creation
2. Database tables migration
3. Backend: webhook receiver, message CRUD, auto-reply engine
4. Frontend: Settings (link accounts), Messaging view, Chat UI
5. Style profile analyzer
6. Auto-reply with per-contact rules
