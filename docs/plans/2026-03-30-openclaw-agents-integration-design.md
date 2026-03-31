# Pulse x OpenClaw — Integración de Agentes

**Fecha:** 2026-03-30
**Estado:** Borrador v2 — con feedback de Juan Manuel
**Autor:** Claude + Juan Manuel

---

## Visión

Los agentes en Pulse son agentes de OpenClaw por debajo. El usuario no sabe qué es OpenClaw — solo ve "agentes" en Pulse. Hay dos tipos:

- **Core** — Chat IA especializado. El usuario le describe un rol y Haiku genera todo. Es un chatbot inteligente con personalidad. No ejecuta código ni usa herramientas externas.
- **Advance** — Agente con herramientas. Puede buscar en internet, crear documentos en Google Drive, ejecutar código, acceder a archivos. Las herramientas se seleccionan al crear.

El admin (jmojeda@factoriaia.com) controla:
- Qué agentes ve cada workspace/usuario
- Quién puede crear agentes (Core todos, Advance con permiso)
- Quién puede crear espacios de trabajo

---

## Arquitectura

```
┌─────────────────────────────────────────────┐
│                  PULSE UI                    │
│  ┌─────────┐  ┌──────────┐  ┌────────────┐ │
│  │ Lista de│  │  Chat con │  │  Crear     │ │
│  │ Agentes │  │  Agente   │  │  Agente    │ │
│  └────┬────┘  └─────┬─────┘  └─────┬──────┘ │
└───────┼─────────────┼───────────────┼────────┘
        │             │               │
┌───────┴─────────────┴───────────────┴────────┐
│            PULSE BACKEND (FastAPI)            │
│                                               │
│  /api/agents/           → CRUD + permisos     │
│  /api/agents/:id/chat   → proxy al bridge     │
│  /api/agents/create     → Haiku genera config │
│  /api/admin/agents/     → asignación a WS     │
└──────────────────┬───────────────────────────┘
                   │
                   │ HTTP (OpenAI-compatible)
                   ▼
┌──────────────────────────────────────────────┐
│     OPENCLAW HTTP BRIDGE (puerto 4200)        │
│     POST / → model: "openclaw:{agent_id}"     │
│                                               │
│     Traduce a: openclaw agent --agent {id}    │
│                --message {msg} --json          │
└──────────────────┬───────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────┐
│         OPENCLAW GATEWAY (puerto 18789)       │
│                                               │
│  ~/.openclaw/agents/{id}/                     │
│    ├── SOUL.md         (personalidad)         │
│    ├── TOOLS.md        (herramientas)         │
│    ├── IDENTITY.md     (rol)                  │
│    ├── MEMORY.md       (memoria persistente)  │
│    └── HEARTBEAT.md    (ejecución periódica)  │
│                                               │
│  Herramientas disponibles:                    │
│    ├── web_search      (buscar en internet)   │
│    ├── web_fetch       (leer páginas web)     │
│    ├── gdocs-cli.py    (Google Drive/Docs)    │
│    ├── exec            (ejecutar código)      │
│    ├── memory          (memoria persistente)  │
│    ├── message         (enviar mensajes)      │
│    ├── read/write/edit (archivos locales)     │
│    └── browser         (navegador automático) │
│                                               │
│  Modelos: Ollama (qwen2.5), Anthropic, GPT   │
└──────────────────────────────────────────────┘
```

---

## Tipos de agente: Core vs Advance

### Core (cualquier miembro puede crear)

| Aspecto | Detalle |
|---------|---------|
| **Qué es** | Chat IA especializado con personalidad propia |
| **Herramientas** | Ninguna externa — solo conversa |
| **Modelo** | Haiku (por defecto) u Ollama |
| **Creación** | El usuario pone nombre + descripción breve. Haiku genera automáticamente: SOUL.md, IDENTITY.md, y toda la config completa |
| **Ejemplo** | "Asistente de marketing que habla como un creativo de Barcelona" |
| **Coste** | Mínimo (~$0.001 por mensaje con Haiku) |

### Advance (necesita permiso de admin)

| Aspecto | Detalle |
|---------|---------|
| **Qué es** | Agente con herramientas reales que puede actuar |
| **Herramientas** | Se eligen al crear: Google Drive, web search, ejecutar código, etc. |
| **Modelo** | Haiku, GPT, o Ollama (según la tarea) |
| **Creación** | Como Core + selección de herramientas + config adicional |
| **Google Drive** | Crea docs en carpeta compartida "Pulse Agents Work", devuelve enlace |
| **Ejemplo** | "Investigador que busca en internet y genera informes en Google Docs" |
| **Coste** | Mayor (herramientas + más tokens por la complejidad) |

### Tabla comparativa para el usuario

```
┌──────────────────────────────────────────────────────┐
│          ¿Qué tipo de agente necesitas?              │
├──────────────┬───────────────────────────────────────┤
│   ⭐ Core    │   🚀 Advance                          │
├──────────────┼───────────────────────────────────────┤
│ Chat IA      │ Chat IA + herramientas                │
│ Responde     │ Responde + HACE cosas                 │
│ Personalidad │ Personalidad + capacidades            │
│ Gratis*      │ Con permiso de admin                  │
│              │                                       │
│ Ideal para:  │ Ideal para:                           │
│ • Consultas  │ • Investigación con informes          │
│ • Brainstorm │ • Crear documentos en Google Drive    │
│ • Soporte    │ • Buscar en internet                  │
│ • Redacción  │ • Ejecutar análisis de datos          │
│ • Educación  │ • Automatizar tareas complejas        │
└──────────────┴───────────────────────────────────────┘
```

---

## Modelo de datos

### Tabla: `openclaw_agents`

```sql
CREATE TYPE agent_tier AS ENUM ('core', 'advance');

CREATE TABLE openclaw_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    openclaw_agent_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    avatar_url TEXT,
    tier agent_tier NOT NULL DEFAULT 'core',
    category TEXT DEFAULT 'general',
    model TEXT DEFAULT 'claude-haiku-4-5-20251001',
    is_active BOOLEAN DEFAULT true,
    tools JSONB DEFAULT '[]',
    -- Config generada por Haiku
    soul_md TEXT,
    identity_md TEXT,
    tools_md TEXT,
    -- Metadata
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    last_synced_at TIMESTAMPTZ
);
```

### Tabla: `workspace_agent_assignments`

```sql
CREATE TABLE workspace_agent_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES openclaw_agents(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES auth.users(id),
    assigned_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(workspace_id, agent_id)
);
```

### Tabla: `agent_conversations` (adaptar existente)

```sql
-- Añadir campos para memoria por usuario y soporte de grupos
ALTER TABLE agent_conversations
    ADD COLUMN openclaw_agent_id UUID REFERENCES openclaw_agents(id),
    ADD COLUMN is_group BOOLEAN DEFAULT false;

-- El agente recuerda quién le habla
-- Cada mensaje ya tiene user_id, así el agente sabe quién es
```

### Tabla: `agent_mentions` (nuevo — para grupos)

```sql
-- Cuando mencionan a un agente en un chat de grupo, se activa
CREATE TABLE agent_mentions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_message_id UUID REFERENCES channel_messages(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES openclaw_agents(id) ON DELETE CASCADE,
    responded BOOLEAN DEFAULT false,
    response_message_id UUID REFERENCES channel_messages(id),
    created_at TIMESTAMPTZ DEFAULT now()
);
```

### Tabla: `admin_permissions`

```sql
CREATE TABLE admin_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    permission TEXT NOT NULL,
    -- Permisos: 'super_admin', 'create_workspaces', 'manage_agents', 'create_advance_agents'
    granted_by UUID REFERENCES auth.users(id),
    granted_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, permission)
);
```

---

## Google Drive — Integración para agentes Advance

### Setup (ya existe la infraestructura)

| Componente | Estado | Detalle |
|-----------|--------|---------|
| Service Account | ✅ Existe | `openfang-agents@automatizaciones-475710.iam.gserviceaccount.com` |
| CLI Tool | ✅ Existe | `/opt/gdocs-cli.py` en el servidor |
| Google Drive API | ✅ Activa | Proyecto `automatizaciones-475710` |

### Lo que hay que hacer

1. **Crear carpeta** "Pulse Agents Work" en Google Drive de Factoría IA
2. **Compartir** la carpeta con `openfang-agents@automatizaciones-475710.iam.gserviceaccount.com` como editor
3. **Configurar** el folder ID en el .env de Pulse

### Cómo funciona para el agente

```
Usuario: "Investiga las tendencias de IA en marketing 2026 y hazme un informe"

Agente Advance (con tools: web_search + gdocs):
1. Busca en internet → recopila información
2. Sintetiza el contenido
3. Llama a gdocs-cli.py → crea Google Doc en "Pulse Agents Work"
4. Responde: "He creado el informe. Aquí tienes el enlace: [link]"
```

El documento queda en la carpeta compartida, accesible para todo el equipo.

---

## Memoria del agente — Quién le habla

Cada agente recuerda con quién habla. El contexto enviado al agente incluye:

```json
{
  "model": "openclaw:soporte-tecnico",
  "messages": [
    {
      "role": "system",
      "content": "[Contexto de Pulse]\nUsuario actual: Juan Manuel Ojeda (jmojeda@factoriaia.com)\nWorkspace: Factoría IA\nConversación: individual\n\n[Tu identidad]\n{contenido de SOUL.md + IDENTITY.md}"
    },
    {
      "role": "user",
      "content": "¿Cómo configuro el módulo de inventario?"
    }
  ]
}
```

En **grupo**, cuando le mencionan (@Soporte):

```json
{
  "role": "system",
  "content": "[Contexto de Pulse]\nCanal: #soporte-general\nMensaje de: Ana García (ana@empresa.com)\nTe han mencionado directamente.\nOtros participantes: Juan, Pedro, María\n\n[Tu identidad]\n..."
}
```

El agente sabe quién es, dónde está, y quién le habla.

---

## Flujos actualizados

### Flujo 1: Usuario chatea con agente

```
1. Usuario abre "Agentes" en sidebar
2. Ve agentes asignados a su workspace (Core y Advance mezclados)
3. Hace clic en "Soporte Técnico"
4. Escribe: "¿Cómo resuelvo error 500 en la API?"
5. Backend proxy → OpenClaw bridge → agente responde
6. Se guarda en agent_conversations CON user_id
7. El agente recuerda esta conversación en el futuro
8. Si es grupo: el agente responde cuando le mencionan con @nombre
```

### Flujo 2: Sync automático desde OpenClaw (cron 3:00 AM diario)

```
1. Cron a las 3:00 AM ejecuta /api/admin/agents/sync
2. Pulse consulta OpenClaw: lista de agentes activos en Gateway
3. Compara con openclaw_agents en Supabase
4. Agentes nuevos → se crean con datos de OpenClaw (nombre, modelo, tools)
5. Agentes eliminados → se marcan como inactivos
6. Log de cambios en audit_log
7. Sin intervención manual
```

### Flujo 3: Miembro crea agente Core

```
1. Cualquier miembro va a Agentes → "Crear agente"
2. Pantalla con dos opciones: [⭐ Core] [🚀 Advance]
3. Elige Core
4. Formulario MÍNIMO:
   - Nombre: "Coach de Ventas"
   - ¿En qué es experto?: "Técnicas de venta B2B, negociación, CRM"
   (solo esto — el usuario es vago)
5. Haiku genera automáticamente:
   - SOUL.md (personalidad completa, tono, valores)
   - IDENTITY.md (rol detallado, límites, especialidad)
   - TOOLS.md (vacío — es Core)
   - MEMORY.md (template inicial)
   - Avatar (selección automática de un set de avatares)
   - Descripción larga para la card del agente
6. Se crea workspace en OpenClaw
7. Agente aparece en el workspace del usuario
8. Listo para chatear
```

### Flujo 4: Admin/usuario con permiso crea agente Advance

```
1. Va a Agentes → "Crear agente" → elige Advance
2. Formulario:
   - Nombre: "Investigador de Mercado"
   - ¿En qué es experto?: "Análisis de mercado, tendencias, competencia"
   - Herramientas: ☑ web_search ☑ Google Drive ☐ exec ☐ browser
   - Modelo: [Haiku ▾]
3. Haiku genera config completa (como Core + TOOLS.md con las herramientas)
4. Google Drive: se configura acceso a carpeta "Pulse Agents Work"
5. Se crea workspace en OpenClaw con tools habilitados
6. Admin asigna a workspaces (o se auto-asigna al del creador)
```

### Flujo 5: Agente en grupo de chat

```
1. Admin añade agente "Soporte Técnico" al canal #general
2. Un usuario escribe en #general: "@Soporte ¿por qué falla el login?"
3. Pulse detecta la mención → crea entrada en agent_mentions
4. Backend envía el mensaje al agente con contexto de grupo
5. Agente responde en el canal como un miembro más
6. La respuesta se guarda como channel_message con author_type='agent'
```

---

## Control de acceso

| Rol | Ver agentes | Chatear | Crear Core | Crear Advance | Asignar a WS | Crear WS |
|-----|------------|---------|------------|---------------|-------------|----------|
| **super_admin** | Todos | ✅ | ✅ | ✅ | ✅ | ✅ |
| **manage_agents** | Todos | ✅ | ✅ | ✅ | ✅ | ❌ |
| **create_advance** | Su WS | ✅ | ✅ | ✅ | ❌ | ❌ |
| **create_workspaces** | Su WS | ✅ | ✅ | ❌ | ❌ | ✅ |
| **member** (default) | Su WS | ✅ | ✅ | ❌ | ❌ | ❌ |

```sql
-- Seed inicial
INSERT INTO admin_permissions (user_id, permission)
SELECT id, 'super_admin' FROM auth.users WHERE email = 'jmojeda@factoriaia.com';
```

---

## Fases de implementación

### Fase 1: Bridge + Chat con agentes existentes (4h)
**Mínimo viable — chatear con agentes de OpenClaw desde Pulse.**

- [ ] Crear tabla `openclaw_agents` + migración
- [ ] Crear tabla `workspace_agent_assignments` + migración
- [ ] Endpoint `POST /api/agents/:id/chat` → proxy a bridge HTTP 4200
- [ ] Registrar agentes existentes de OpenClaw en la tabla (seed SQL)
- [ ] Asignar agentes al workspace de Juan Manuel
- [ ] Adaptar frontend: lista de agentes + chat usando nuevo endpoint
- [ ] Incluir contexto de usuario (nombre, email) en cada mensaje al agente

**Resultado:** Abres Pulse → Agentes → ves los de OpenClaw → chateas.

### Fase 2: Panel admin + Sync automático (4h)
**Control de visibilidad y sincronización.**

- [ ] Crear tabla `admin_permissions` + seed jmojeda como super_admin
- [ ] Endpoints admin: CRUD agentes, asignar/desasignar a workspaces
- [ ] Cron job: sync automático a las 3:00 AM (compara OpenClaw ↔ Supabase)
- [ ] Página admin en frontend (solo visible para admins)
- [ ] Middleware de permisos en backend

**Resultado:** Controlas qué agentes ve cada workspace.

### Fase 3: Crear agentes Core desde Pulse (4h)
**Cualquier miembro crea chatbots especializados.**

- [ ] Formulario de creación Core: nombre + expertise (mínimo)
- [ ] Endpoint que llama a Haiku para generar SOUL.md, IDENTITY.md, etc.
- [ ] Script que crea workspace OpenClaw con los archivos generados
- [ ] Auto-asignar al workspace del creador
- [ ] UI: selector Core vs Advance, preview del agente antes de crear

**Resultado:** Miembro pone "Coach de Ventas" + "venta B2B" → agente listo.

### Fase 4: Agentes Advance + Google Drive (5h)
**Herramientas reales para agentes potentes.**

- [ ] Crear carpeta "Pulse Agents Work" en Google Drive
- [ ] Configurar service account como editor
- [ ] Formulario Advance: herramientas seleccionables (checkboxes)
- [ ] Generar TOOLS.md con las herramientas seleccionadas
- [ ] Integración gdocs-cli.py → agente puede crear docs y devolver enlace
- [ ] Integración web_search → agente busca en internet
- [ ] Permisos: solo admin o create_advance puede crear estos

**Resultado:** Agente investiga + crea informe en Google Drive → enlace.

### Fase 5: Agentes en grupos de chat (4h)
**Agentes como miembros de canales.**

- [ ] Crear tabla `agent_mentions`
- [ ] Permitir añadir agente a un canal como "miembro"
- [ ] Detectar @menciones en mensajes de canal
- [ ] Enviar mensaje al agente con contexto de grupo
- [ ] Agente responde como channel_message con author_type='agent'
- [ ] Memoria: agente recuerda conversaciones previas por usuario

**Resultado:** @Soporte en #general → agente responde en el canal.

### Fase 6: Streaming + UX pulida (3h)
**Experiencia fluida.**

- [ ] Reescribir bridge para soportar SSE streaming
- [ ] Indicadores: "pensando" / "buscando en web" / "creando documento"
- [ ] Avatares auto-generados por categoría
- [ ] Cards bonitas para cada agente (tier badge, stats de uso)

**Resultado:** Chat fluido tipo ChatGPT con feedback visual.

---

## Dependencias y estado

| Necesito | Existe? | Acción |
|----------|---------|--------|
| OpenClaw Gateway | ✅ Puerto 18789 | Nada |
| HTTP Bridge | ✅ Puerto 4200 | Nada |
| Google Drive Service Account | ✅ `openfang-agents@...` | Reutilizar |
| gdocs-cli.py | ✅ `/opt/gdocs-cli.py` | Reutilizar |
| Carpeta "Pulse Agents Work" | ❌ | Crear en Drive de Factoría |
| Tabla openclaw_agents | ❌ | Crear migración |
| Tabla workspace_agent_assignments | ❌ | Crear migración |
| Tabla admin_permissions | ❌ | Crear migración |
| Tabla agent_mentions | ❌ | Crear migración (Fase 5) |
| Cron sync 3AM | ❌ | systemd timer |
| Haiku agent generator | ❌ | Prompt + endpoint |

---

## Qué NO se incluye (de momento)

- WhatsApp/Telegram (eso es Chamito)
- Heartbeat/ejecución periódica desde Pulse (se mantiene en OpenClaw)
- Marketplace público de agentes
- Agentes que se comunican entre sí
- Facturación por uso de agentes
- Multi-modelo por conversación (futuro)
