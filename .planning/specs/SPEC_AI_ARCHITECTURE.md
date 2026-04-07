# SPEC: AI Architecture - Pulse
> Ultima actualizacion: 2026-04-07
> Migracion: Anthropic SDK -> OpenAI SDK (2026-04-07)

---

## Contexto

El 4 de abril de 2026, Anthropic anuncio que el uso del SDK con tokens OAuth de suscripcion
(como usabamos via Claude CLI) se consideraria "uso adicional" con coste extra. Se migro
toda la plataforma de Anthropic SDK a OpenAI SDK usando autenticacion por suscripcion via
el mismo mecanismo que OpenClaw/Codex CLI.

---

## Autenticacion

### Flujo de auth (subscription-based, sin API key)

```
~/.codex/auth.json          openai-oauth proxy         OpenAI SDK (Python)
(OAuth tokens de Codex)  ->  :10531/v1 (systemd)   ->  base_url=127.0.0.1:10531/v1
```

1. El usuario hace `codex login` una vez (abre navegador, OAuth flow)
2. Los tokens se guardan en `~/.codex/auth.json`
3. `openai-oauth` proxy (systemd service) lee esos tokens y expone endpoint OpenAI-compatible
4. Todo el codigo Python apunta a `http://127.0.0.1:10531/v1` como `base_url`
5. No se necesita `OPENAI_API_KEY` — el proxy maneja auth y token refresh

### Archivo de tokens

- Path: `~/.codex/auth.json` (mismo que usa OpenClaw y Codex CLI)
- Permisos: `600` (solo root)
- Refresh: automatico por el proxy

### Fallback

Si el proxy no esta disponible, el sistema cae a `OPENAI_API_KEY` (env var) como fallback.
Esto es util para desarrollo local o si el proxy falla.

---

## Cliente centralizado

Archivo: `core-api/lib/openai_client.py`

```python
from lib.openai_client import get_openai_client        # sync
from lib.openai_client import get_async_openai_client   # async
```

Un solo punto de configuracion. Todos los archivos del proyecto importan de aqui.
Nunca se crea un `OpenAI()` o `AsyncOpenAI()` directamente.

### Configuracion (config.py)

```
OPENAI_API_KEY=          # fallback, vacio en produccion
OPENAI_PROXY_URL=http://127.0.0.1:10531/v1   # proxy de suscripcion
```

---

## Modelos

| Componente | Modelo | Razon |
|---|---|---|
| Chat Pulse (general) | `gpt-5.4-mini` | Rapido, barato, suficiente para chat general |
| Pulse Agent (dev) | `gpt-5.3-codex` | Optimizado para codigo y ejecucion agentica |
| OdooPulse (dev) | `gpt-5.3-codex` | Idem |
| Lexy Dev | `gpt-5.3-codex` | Idem |
| Email AI (analysis + compose) | `gpt-5.4-mini` | Tareas simples de clasificacion/redaccion |
| CRM Pulse Context | `gpt-5.4-mini` | Resumenes ejecutivos |
| WhatsApp auto-reply | `gpt-5.4-mini` | Respuestas rapidas |
| WhatsApp style analysis | `gpt-5.4-mini` | Analisis de estilo |
| App Builder (code gen) | `gpt-5.4-mini` | Generacion de codigo React Native |
| CRM relationship summary | `gpt-5.4-mini` | Resumenes de relacion |
| E2B sandbox agents | `gpt-5.3-codex` | Agentes autonomos con tool calling |
| Title generator | `gpt-5.4-mini` | Titulos de conversacion |
| Intent classifier | `gpt-5.4-mini` | Clasificacion de intenciones |
| Embeddings | `text-embedding-3-large` | Busqueda semantica (1536 dims) |

### Routing de modelos (chat)

En `claude_agent.py` (nombre historico, ahora usa OpenAI):

```python
DEFAULT_CHAT_MODEL = "gpt-5.4-mini"
DEV_AGENT_MODEL = "gpt-5.3-codex"
DEV_AGENT_NAMES = {"pulse agent", "odoopulse", "odoo developer", "lexy dev"}
```

Si el mensaje del usuario menciona un agente dev, se usa `gpt-5.3-codex`.
De lo contrario, `gpt-5.4-mini`.

---

## Servicios systemd

### openai-oauth.service

```ini
[Unit]
Description=OpenAI OAuth Proxy (subscription auth via Codex)
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/openai-oauth --host 127.0.0.1 --port 10531
Restart=always
RestartSec=5
Environment=HOME=/root

[Install]
WantedBy=multi-user.target
```

Comandos:
```bash
systemctl status openai-oauth    # verificar
systemctl restart openai-oauth   # reiniciar (ej. tras renovar token)
journalctl -u openai-oauth -f    # logs en vivo
```

### Verificar que funciona

```bash
curl http://127.0.0.1:10531/v1/models
# Debe listar gpt-5.4-mini, gpt-5.3-codex, etc.
```

---

## Renovacion de tokens

Los tokens OAuth de `~/.codex/auth.json` tienen caducidad. El proxy los refresca
automaticamente. Si el refresh falla:

1. En el servidor: `codex login` (abre navegador)
2. O copiar `auth.json` desde una maquina donde funcione:
   ```bash
   scp ~/.codex/auth.json root@85.215.105.45:~/.codex/auth.json
   systemctl restart openai-oauth
   ```

---

## Archivos modificados (migracion 2026-04-07)

| Archivo | Cambio |
|---|---|
| `lib/openai_client.py` | **NUEVO** - Cliente centralizado con proxy auth |
| `api/services/chat/claude_agent.py` | Reescrito: streaming + tool calling OpenAI format |
| `api/services/email/analyze_email_ai.py` | Anthropic -> OpenAI |
| `api/services/crm/pulse_context_cron.py` | Anthropic -> OpenAI |
| `api/services/builder/generator.py` | Streaming OpenAI |
| `api/services/agents/dispatch.py` | ANTHROPIC_API_KEY -> OPENAI_API_KEY en E2B |
| `api/services/agents/runtime_bundle.py` | Agent loop + tool defs -> OpenAI format |
| `api/routers/email.py` | Compose AI endpoint |
| `api/routers/crm.py` | Pulse Context endpoint |
| `api/routers/messaging.py` | Auto-reply, suggest-reply, analyze-style |
| `api/routers/openclaw_agents.py` | 4 endpoints core agents |
| `api/services/crm/contacts.py` | Relationship summary |
| `api/services/chat/agent.py` | Cliente centralizado |
| `api/services/chat/title_generator.py` | Cliente centralizado |
| `api/services/app_drawer/classify_intent.py` | Cliente centralizado |
| `api/services/smart_search/reranker.py` | Cliente centralizado |
| `api/services/smart_search/provider_search.py` | Cliente centralizado |
| `lib/embeddings.py` | Cliente centralizado |
| `requirements.txt` | Eliminado `anthropic>=0.39.0` |
| `api/config.py` | Nuevo: `openai_proxy_url` setting |

---

## Diferencias clave Anthropic vs OpenAI SDK

| Aspecto | Anthropic (antes) | OpenAI (ahora) |
|---|---|---|
| System prompt | `system=` param separado | `{"role": "system"}` en messages |
| Streaming | `client.messages.stream()` context manager | `client.chat.completions.create(stream=True)` |
| Tool calling format | `input_schema` + `tool_use` blocks | `type: "function"` + `function.parameters` |
| Tool results | `{"role": "user", "content": [{"type": "tool_result"}]}` | `{"role": "tool", "tool_call_id": "..."}` |
| Images | `{"type": "image", "source": {"type": "base64"}}` | `{"type": "image_url", "image_url": {"url": "data:..."}}` |
| Stop reason | `response.stop_reason == "end_turn"` | `choice.finish_reason == "stop"` |
| Token usage | `response.usage.input_tokens` | `response.usage.prompt_tokens` |
