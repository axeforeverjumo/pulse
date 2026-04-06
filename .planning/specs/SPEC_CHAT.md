# SPEC: Chat
> Estado: COMPLETO | Última revisión: 2026-04-06

---

## 1. ARQUITECTURA

### Flujo de un Mensaje
1. Usuario escribe en `ChatInput` + selecciona workspaces + adjunta imágenes
2. Frontend sube imágenes directo a R2 (presigned URL — no pasa por backend)
3. Confirma upload: `POST /api/chat/attachments/{id}/confirm`
4. Envía: `POST /api/chat/conversations/{id}/messages` con `attachment_ids`
5. Backend crea mensaje en DB con `content_parts`
6. Backend llama `stream_chat_response()` → NDJSON stream
7. Cliente renderiza incrementalmente y guarda en DB al completar

### Autenticación con Claude
- **Prioridad 1:** Claude CLI OAuth token en `/home/claude/.claude/.credentials.json`
  - Usa suscripción del usuario ($200/mo), NO créditos API
  - Auto-refresca si expira
- **Prioridad 2:** `ANTHROPIC_API_KEY` env var (fallback)

### Selección de Modelo
| Condición | Modelo |
|-----------|--------|
| Default general | `claude-haiku-4-5-20251001` |
| Mensaje menciona "pulse agent", "odoopulse", "odoo developer", "lexy dev" | `claude-sonnet-4-6` |

---

## 2. MODELOS DE DATOS

### Tabla: `conversations`
```
id (UUID), user_id, title (auto-generado), created_at, updated_at
```

### Tabla: `messages`
```
id (UUID), conversation_id (FK), role (user|assistant)
content (text, deprecated), content_parts (JSONB)
created_at
```

### `content_parts` Schema
```json
[
  {
    "id": "uuid",
    "type": "text|source_ref|email_ref|cal_ref|tool_result|action|reasoning|sources|tool_call",
    "phase": "grounded|result|reasoning",
    "data": { ... }
  }
]
```

### Tabla: `chat_attachments`
```
id, user_id, conversation_id, message_id (null hasta vincularse)
filename, mime_type, file_size, width, height
r2_key, thumbnail_r2_key
status: uploading|uploaded|error
created_at
```

---

## 3. ENDPOINTS API

### Conversaciones
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/chat/conversations` | Listar todas |
| POST | `/api/chat/conversations` | Crear nueva |
| PATCH | `/api/chat/conversations/{id}` | Renombrar |
| DELETE | `/api/chat/conversations/{id}` | Eliminar (cascada + limpia R2) |

### Mensajes
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/chat/conversations/{id}/messages` | Historial (ASC por created_at) |
| POST | `/api/chat/conversations/{id}/messages` | **Enviar mensaje (STREAMING NDJSON)** |
| POST | `/api/chat/conversations/{id}/messages/{msg_id}/regenerate` | Regenerar (STREAMING) |
| PATCH | `/api/chat/messages/{msg_id}/actions/{action_id}/execute` | Ejecutar acción staged |

**SendMessageRequest:**
```json
{
  "content": "string",
  "attachment_ids": ["uuid"],
  "timezone": "Europe/Madrid",
  "context": { "emails": [...], "documents": [...] },
  "workspace_ids": ["uuid"]
}
```

**Rate limits:** 10/minuto, 500/día

### Attachments
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/chat/attachments/upload-url` | Presigned URLs (original + thumbnail) |
| POST | `/api/chat/attachments/{id}/confirm` | Confirmar upload |
| GET | `/api/chat/attachments/{id}/url` | URL de descarga |
| DELETE | `/api/chat/attachments/{id}` | Eliminar + limpia R2 |
| GET | `/api/chat/attachments/conversation/{id}` | Listar por conversación |

---

## 4. STREAMING NDJSON

### Tipos de Eventos
```
{ "type": "content",       "delta": "texto parcial" }
{ "type": "display",       "display_type": "...", ... }
{ "type": "action",        ... }
{ "type": "sources",       "sources": [...] }
{ "type": "tool_exchange", ... }
{ "type": "done" }
```

---

## 5. FUNCIONALIDADES AI

### System Prompt (`prompts.py`)
Incluye:
- Fecha/hora en timezone del usuario
- Preferencias: `show_embedded_cards`, `always_search_content`
- Instrucciones de formato (embedded cards, refs inline `{E1}`, `{C1}`)
- Contexto inyectado (emails/documentos)
- Info del workspace

### Tools Dinámicas
Registry según `ext_connections` del usuario:
- `search` (Exa), `smart_search`
- `create_calendar_event`, `send_email`, `get_emails`
- Ejecución **paralela**, timeout 30s, truncate a 4000 chars

### Content Builder (`content_builder.py`)
- Parsea texto con `[N]` citas, `{EN}` refs email, `{CN}` refs calendar
- Preserva interleaving: text → source_ref → text → email_ref
- Corrige placement de citas

### Action Staging
Tools pueden retornar `status="staged"` → acción pendiente de aprobación del usuario (create_event, send_email, etc.)

### Web Search (Exa)
- Emite evento `sources_event` con URLs, titles, favicons
- Integrado en stream

### Image Attachments
- Soporta jpg/png, max size validado
- Fetched de R2 como base64 → pasado a Claude como `image` blocks

---

## 6. COMPONENTES FRONTEND

### `ChatView.tsx`
```typescript
State:
  messages: DisplayMessage[]
  input: string
  selectedWorkspaceIds: string[]
  isWaitingForResponse: boolean
  pendingAttachments: UploadedAttachmentInfo[]
  mentions: MentionData[]
  conversations: Conversation[]
  activeConversationId: string | null
```

### `ChatInput.tsx`
- Mention autocomplete (`@`)
- Drag-drop attachments
- Workspace selector multi-select

### Hooks
- `useChatStream` — streaming handler, ContentBuilder, abort/regenerate
- `useChatAttachments` — presigned upload, thumbnail client-side, drag-drop

---

## 7. SERVICIOS BACKEND

```
core-api/api/services/chat/
  claude_agent.py      -- Orchestration respuestas
  prompts.py           -- System prompt builder
  content_builder.py   -- Parse content_parts
  events.py            -- NDJSON generators
  title_generator.py   -- Auto-title
```

---

## 8. ARCHIVOS CLAVE

```
core-web/src/components/Chat/
core-web/src/components/SidebarChat/
core-web/src/components/ChatPanel/
core-api/api/routers/chat.py
core-api/api/services/chat/
```

---

## 9. ESTADO

### ✅ Completo
- CRUD conversaciones
- Streaming chat con Anthropic
- Attachments R2 (upload/download)
- Tool calling paralelo
- Content parts (citations, email_ref, cal_ref, tool_results)
- Auto-title generation
- Multi-workspace scoping
- Action staging + ejecución
- Claude CLI OAuth (subscription-based)
- Rate limiting
- Regenerate mensaje

### 🔄 Pendiente
- Voice input/output
- Reaction emoji
- Draft message persistence
- Árbol de regenerates (actualmente borra y regenera linear)
