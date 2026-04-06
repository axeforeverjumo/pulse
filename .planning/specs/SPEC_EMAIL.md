# SPEC: Email
> Estado: ACTIVO | Última revisión: 2026-04-06

---

## 1. ARQUITECTURA

### Proveedores Soportados
- **Google (Gmail)** — OAuth 2.0, Gmail API
- **Microsoft (Outlook)** — OAuth 2.0, Microsoft Graph API

### Flujo Lectura
1. `GET /api/email/messages` con filtros
2. Backend: RPC `get_email_threads_unified` (Postgres)
3. Retorna threads con metadata: unread_count, ai_summary, ai_importance
4. UI renderiza lista threaded

### Flujo Envío
1. ComposeEmail completo (to, subject, HTML body, attachments, cc, bcc)
2. `POST /api/email/send` o `POST /api/email/drafts/{id}/send`
3. Backend: obtiene Gmail/Outlook service → construye MIME → inyecta signature → envía → update DB

### Sincronización
- Cron sync Gmail/Outlook → DB
- Normaliza labels cross-provider
- AI analysis (summary + importance) post-sync, asíncrono

---

## 2. MODELOS DE DATOS

### Tabla: `emails`
```
id, user_id, ext_connection_id (FK)
external_id (Gmail messageId / Outlook id)
thread_id, gmail_draft_id
subject, from, to, cc, bcc
body, snippet
labels[] (IDs del proveedor)
normalized_labels[]: inbox|archive|sent|draft|trash|spam|custom
is_read, is_starred, has_attachments
received_at
ai_summary (3-12 words), ai_important (bool), ai_analyzed (bool)
raw_item (JSONB — dump del provider)
created_at, updated_at
```

### Tabla: `ext_connections`
```
id, user_id, provider (google|microsoft)
provider_email, provider_name, provider_avatar
is_active, is_primary, account_order
email_signature (HTML)
access_token_encrypted, refresh_token_encrypted
token_expires_at, metadata (JSONB)
updated_at (último sync)
```

### Label Normalization
| Gmail | Outlook | Normalizado |
|-------|---------|-------------|
| INBOX | Inbox | inbox |
| SENT | Sent Items | sent |
| DRAFT | Drafts | draft |
| TRASH | Deleted Items | trash |
| SPAM | Junk Email | spam |
| Custom | Custom | custom |
| — | — | archive |

---

## 3. ENDPOINTS API

### Lectura
| Método | Ruta | Params |
|--------|------|--------|
| GET | `/api/email/messages` | max_results, offset, query, label_ids, account_id(s) |
| GET | `/api/email/messages/{id}` | — body completo |
| GET | `/api/email/threads/{thread_id}` | todos los mensajes del thread |
| GET | `/api/email/messages/{id}/attachments/{att_id}` | base64 |
| GET | `/api/email/messages/{id}/attachments/{att_id}/download` | binary |
| GET | `/api/email/counts` | unread inbox + drafts count (por account o unified) |

### Envío
| Método | Ruta | Body |
|--------|------|------|
| POST | `/api/email/send` | to, subject, body, html_body, cc, bcc, thread_id, in_reply_to, references, attachments, from_account_id |
| POST | `/api/email/messages/{id}/reply` | body, html_body, reply_all |
| POST | `/api/email/messages/{id}/forward` | to, additional_message, cc, include_attachments |

### Drafts
| Método | Ruta |
|--------|------|
| POST | `/api/email/drafts` |
| PUT / PATCH | `/api/email/drafts/{id}` |
| DELETE | `/api/email/drafts/{id}` |
| POST | `/api/email/drafts/{id}/send` |

### Labels / Acciones
| Método | Ruta |
|--------|------|
| GET | `/api/email/labels` |
| POST | `/api/email/messages/{id}/labels` |
| DELETE | `/api/email/messages/{id}/labels/{label_id}` |
| POST | `/api/email/messages/{id}/archive` |
| POST | `/api/email/messages/{id}/restore` |
| DELETE | `/api/email/messages/{id}` (→ trash) |
| POST | `/api/email/messages/{id}/mark-read` |
| POST | `/api/email/messages/{id}/mark-unread` |
| POST | `/api/email/messages/{id}/star` |
| POST | `/api/email/messages/{id}/unstar` |

### Búsqueda y Sync
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/email/search` | DB search + remote paralelo (Gmail/Outlook) |
| POST | `/api/email/sync` | Trigger manual sync |
| POST | `/api/email/fetch-remote` | Fetch single email desde provider |
| GET | `/api/email/image-proxy?url=...` | Proxy imágenes (no auth) |

### AI Compose
| Método | Ruta | Body |
|--------|------|------|
| POST | `/api/email/compose-with-ai` | prompt, subject, to, current_body → {body_html, subject} |

---

## 4. FUNCIONALIDADES AI

### Análisis Post-Sync (`analyze_email_ai.py`)
- Modelo: `claude-haiku-4-5-20251001`
- Genera `ai_summary` (3-12 palabras específicas)
- Genera `ai_important` (bool)
- Asíncrono, no bloquea sync

### AI Compose
- Backend stub disponible, endpoint activo
- Frontend: botón en ComposeEmail → llama endpoint → inserta HTML en Tiptap editor

### Email Context en Chat
- Chat puede recibir `EmailContext` (subject, snippet, body, sender)
- Inyectado en system prompt
- Referenciado con `{E1}`, `{E2}` en respuestas

---

## 5. CARACTERÍSTICAS ESPECIALES

### Multi-Account
- Unified view: sin `account_ids` → todos los accounts
- Per-account: `account_ids[]` → filtrar cuentas específicas
- `from_account_id` en send para elegir desde qué cuenta

### Threading
- Dual write: Gmail `threadId` + local `thread_id` en DB
- RPC `get_email_threads_unified` agrupa, cuenta mensajes, retorna ai_summary

### Email Signature
- Stored en `ext_connections.email_signature` (HTML)
- Auto-appended al enviar
- Configurable en settings

### Draft Cleanup (`draft_cleanup.py`)
- `cleanup_thread_drafts()` — borra auto-saves viejos del mismo thread
- Evita acumulación de drafts

### Attachment Caching (`file_cache.py`)
- Caché local de imágenes y attachments durante sync incremental
- Cron diario de limpieza de caché expirado

---

## 6. COMPONENTES FRONTEND

### `EmailView.tsx`
```typescript
State:
  emailFolder: EmailFolder
  emails: Email[]
  selectedEmail: Email | null
  selectedEmailIndex: number | null
  isComposingNew: boolean
  isDraftLoading: boolean
  unreadCount: number
  accountFilter: string[]
```

### `ComposeEmail.tsx`
- Tiptap editor HTML
- ChipInput para To/CC/BCC
- Attachments drag-drop
- AI compose button
- Auto-save draft
- Signature auto-inject

### `InlineReplyComposer.tsx`
- Quick reply en thread view
- Solo body text (sin attachments aún)

### Stores y Hooks
- `useEmailStore` — Zustand, compose state, folder selection
- `useEmailFolder`, `useEmailDetail`, `useEmailSearch` — React Query
- `useMarkEmailsRead`, `useArchiveEmail`, `useDeleteEmail` — Mutations

---

## 7. SERVICIOS BACKEND

```
core-api/api/services/email/
  send_email.py           -- Send + reply + forward
  create_draft.py
  update_draft.py
  delete_draft.py
  fetch_emails.py         -- Unified fetch
  get_email_details.py    -- Full detail
  apply_labels.py
  mark_read_unread.py
  google_api_helpers.py   -- Gmail API wrappers
  analyze_email_ai.py     -- Claude analysis
  label_normalization.py
  draft_cleanup.py
  search_providers.py     -- Gmail/Outlook paralelo
  fetch_remote_email.py
  archive_email.py
  delete_email.py
  file_cache.py           -- Attachment caching
```

---

## 8. ARCHIVOS CLAVE

```
core-web/src/components/Email/
core-api/api/routers/email.py
core-api/api/services/email/
```

---

## 9. ESTADO

### ✅ Completo
- Multi-account (Gmail + Outlook)
- Unified threaded view
- Fetch, search, archive, delete, restore
- Reply, forward, send
- Draft CRUD + auto-cleanup
- Labels (apply/remove)
- Mark read/unread/starred (incluido botón "Marcar como no leído" en toolbar)
- Attachments (view/download)
- AI summary + importance (post-sync)
- Email signature
- Search local + remote paralelo
- Image proxy
- Multi-account counts
- Attachment proactive caching + cleanup cron
- AI compose (endpoint activo)
- **AI categorización (client-side)**: Ventas, Proyectos, Personas, Acuerdos, Notificaciones, Poca prioridad — secciones colapsables en INBOX
- **Botón Oportunidad**: vincula correo a oportunidad CRM nueva o existente (filtrado por dominio)
- **Email-Opportunity linking**: tabla `crm_opportunity_emails`, endpoints GET/POST/DELETE

### 🔄 Pendiente
- Attachment upload en compose (puede ver/reenviar, no adjuntar nuevos archivos locales)
- Email template library
- Reglas/filtros automáticos con AI server-side (ahora es client-side heurístico)
- Snooze emails
- Rich text en quick reply (inline)
- Outlook calendar/task integration
- Email encryption (S/MIME, PGP)
- Pop-up para ver hilo completo desde OpportunityDetail
- Buscar correo desde bandeja al añadir a oportunidad existente
