# SPEC: Messaging, WhatsApp y DevOps
> Estado: Messaging COMPLETO | WhatsApp integración externa PENDIENTE | DevOps COMPLETO | Última revisión: 2026-04-06

---

## PARTE 1: MESSAGING (Canales internos)

### 1. MODELOS DE DATOS

#### `channels`
```
id, workspace_app_id
name (nullable para DMs), description
is_private (bool), is_dm (bool)
dm_participants (UUID[]) — array user IDs (sorted, para lookups)
created_by, created_at, updated_at
-- Constraint: DM → name=NULL + dm_participants NOT NULL
```

#### `channel_members`
```
id, channel_id, user_id
role: owner|moderator|member
joined_at
-- Unique: (channel_id, user_id)
```

#### `channel_messages`
```
id, channel_id
user_id (nullable), agent_id (nullable)
content (text, legacy)
blocks (JSONB): [{type: text|mention|file|link_preview|code|quote|embed, data: {...}}]
thread_parent_id (UUID FK, nullable)
reply_count (int, actualizado por trigger)
is_edited, edited_at
embedding (pgvector 1536)
created_at
```

#### `message_reactions`
```
id, message_id, user_id, emoji
-- Unique: (message_id, user_id, emoji)
```

#### `channel_read_status`
```
id, channel_id, user_id, last_read_at
-- Unique: (channel_id, user_id)
```

### 2. ENDPOINTS API

#### Channels
| Método | Ruta |
|--------|------|
| GET | `/api/workspaces/apps/{app_id}/channels` |
| POST | `/api/workspaces/apps/{app_id}/channels` |
| GET | `/api/channels/{id}` |
| PATCH | `/api/channels/{id}` |
| DELETE | `/api/channels/{id}` |

#### Members (canales privados)
| Método | Ruta |
|--------|------|
| GET | `/api/channels/{id}/members` |
| POST | `/api/channels/{id}/members` |
| DELETE | `/api/channels/{id}/members/{user_id}` |

#### DMs
| Método | Ruta |
|--------|------|
| POST | `/api/dms` | RPC: get_or_create_dm |
| GET | `/api/dms` | Listar DMs del usuario |

#### Messages
| Método | Ruta |
|--------|------|
| GET | `/api/channels/{id}/messages` | Con paginación |
| GET | `/api/messages/{id}` |
| POST | `/api/channels/{id}/messages` |
| PATCH | `/api/messages/{id}` |
| DELETE | `/api/messages/{id}` |
| GET | `/api/messages/{id}/replies` | Thread replies |

#### Reactions y Unread
| Método | Ruta |
|--------|------|
| POST | `/api/messages/{id}/reactions` |
| DELETE | `/api/messages/{id}/reactions/{emoji}` |
| GET | `/api/workspaces/apps/{app_id}/unread` |
| POST | `/api/channels/{id}/mark-read` |

### 3. CARACTERÍSTICAS ESPECIALES

**Threading:** `thread_parent_id` FK + `reply_count` (trigger automático)

**Unread tracking:**
- `channel_read_status` por usuario
- RPC: `get_channel_unread_count()`, `get_workspace_unread_counts()`
- Excluye propios mensajes, solo top-level (no replies)

**Presence:**
- `broadcastTyping()` / `stopTyping()`
- `usePresenceStore` para tracking

**Rich Content (blocks):**
- `text`, `mention`, `file`, `link_preview`, `code`, `quote`, `embed`

**Agent Messages:**
- `agent_id` en `channel_messages` para mensajes de agentes
- Mentions: `@AgentName` → agent responde en canal

### 4. COMPONENTES FRONTEND

```
core-web/src/components/Messages/
  MessagesView.tsx           -- Vista principal (sidebar + panel + composer)
  MessageComposer.tsx        -- ContentBlock builder, mentions, file picker
  MessagesSettingsDropdown.tsx
  ChannelCalendar.tsx
  ThreadParticipantAvatars.tsx
  MentionAutocomplete.tsx
  GifPicker.tsx
  GoogleDrivePicker.tsx
```

**MessageComposer features:**
- Mention autocomplete (`@user`)
- File picker (drag-drop + click)
- GIF picker
- Google Drive picker
- HEIC → JPEG conversion

---

## PARTE 2: WHATSAPP / MESSAGING EXTERNO

### 1. MODELOS DE DATOS

#### `external_accounts`
```
id, workspace_id
provider: whatsapp|telegram
status: connected|pending|failed
phone_number
away_mode (bool)
away_message, away_directives (para AutoMode)
created_at, updated_at
```

#### `external_chats`
```
id, account_id (FK)
remote_jid (ID remoto WhatsApp)
contact_name, contact_phone, contact_avatar_url
is_group (bool)
unread_count
last_message_at, last_message_preview
auto_reply_enabled, auto_reply_directives
muted (bool)
created_at, updated_at
```

#### `external_messages`
```
id, chat_id (FK)
remote_message_id
direction: in|out
content
media_type: image|video|gif|audio|document|sticker
media_url
is_auto_reply (bool)
sender_name
status: pending|sent|failed|read
created_at
```

### 2. AutoMode (Auto-Reply AI)

**Configuración:**
- `away_mode` bool en `external_accounts`
- `auto_reply_directives` — instrucciones para el agente
- Default: *"Responde de forma natural en mi nombre, manteniendo mi tono y el contexto de la conversación..."*
- Override por chat: `auto_reply_enabled` + `auto_reply_directives` en `external_chats`
- `is_auto_reply` flag en `external_messages` para identificar respuestas automáticas

### 3. Grupos WhatsApp
- `is_group` bool en `external_chats`
- Soporte completo de conversaciones grupales

### 4. ESTADO WhatsApp
**Estructura de datos: COMPLETA** (tablas, tipos, AutoMode config)

**Integración externa PENDIENTE:**
- Webhooks WhatsApp Business API
- Envío/recepción real de mensajes
- Conexión de cuenta (QR code flow)

### 5. COMPONENTE FRONTEND

```
core-web/src/components/Messaging/
  MessagingView.tsx     -- Vista WhatsApp/Telegram
    sidebar: shrink-0 (fix compresión)
    lista de chats externos
    detalle de chat con mensajes
    composer para enviar
    AutoMode toggle
    grupo vs individual display
```

---

## PARTE 3: DEVOPS

### 1. MODELOS DE DATOS

#### `workspace_servers`
```
id, workspace_id, name
host, port (default 22), username (default 'root')
auth_type: ssh_key|password|both
ssh_private_key_encrypted, password_encrypted
wildcard_domain
status: pending|verified|failed|offline
last_verified_at, verification_details (JSONB)
is_default
created_by, created_at, updated_at
```

#### `workspace_ssh_keys`
```
id, workspace_id, name (default 'pulse-deploy')
public_key, private_key_encrypted
fingerprint
created_by, created_at
```

#### `repo_tokens`
```
id, workspace_id, name
provider: github|gitlab|bitbucket
token_encrypted, username
is_default
created_by, created_at, updated_at
```

### 2. ENDPOINTS API

#### Servers
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/servers?workspace_id={id}` |
| POST | `/api/servers` | SSH key o password |
| PATCH | `/api/servers/{id}` |
| DELETE | `/api/servers/{id}` |
| POST | `/api/servers/{id}/verify` | Test conectividad + software |

#### SSH Keys
| Método | Ruta |
|--------|------|
| GET | `/api/servers/ssh-keys?workspace_id={id}` |
| POST | `/api/servers/ssh-keys/generate` | RSA-4096 keypair |
| GET | `/api/servers/ssh-keys/{id}/public` |
| DELETE | `/api/servers/ssh-keys/{id}` |

#### Repo Tokens
| Método | Ruta |
|--------|------|
| GET | `/api/servers/tokens?workspace_id={id}` |
| POST | `/api/servers/tokens` |
| PATCH | `/api/servers/tokens/{id}` |
| DELETE | `/api/servers/tokens/{id}` |
| GET | `/api/servers/tokens/{id}/value` | Valor decriptado (internal) |

### 3. Server Verification
- Test conectividad via asyncssh
- Detecta software instalado: git, nginx, certbot, docker, etc.
- Guarda detalles en `verification_details (JSONB)`

### 4. COMPONENTES FRONTEND

```
core-web/src/components/DevOps/
  DevOpsView.tsx    -- Tabs: Servers, SSH Keys, Tokens, Overview
    Servers tab:    -- lista con status badge, agregar, verify, delete
    SSH Keys tab:   -- lista, generate, download/copy, delete
    Tokens tab:     -- lista, agregar, edit metadata, delete
    Overview tab:   -- estadísticas generales
```

### 5. ARCHIVOS CLAVE

```
core-api/api/routers/servers.py
core-api/api/services/servers/
  manager.py, ssh_keys.py, tokens.py
core-api/supabase/migrations/
  20260406000001_server_management.sql
core-web/src/components/DevOps/DevOpsView.tsx
```

### 6. ESTADO DevOps

#### ✅ Completo
- CRUD servers con verificación SSH
- SSH key generation (RSA-4096) + management
- Repo tokens (GitHub/GitLab/Bitbucket) encriptados
- Wildcard domain support
- Deploy config en boards (deploy_mode, server_id, subdomain)

#### 🔄 Pendiente
- Overview tab con métricas reales
- Logs de conexión/verificación en UI
- Multi-server deploy para proyectos
