# SPEC: CRM
> Estado: COMPLETO | Última revisión: 2026-04-06

---

## 1. MODELOS DE DATOS

### `crm_contacts`
```
id, workspace_id
first_name, last_name, email, phone, job_title
company_id (FK crm_companies)
avatar_url, linkedin_url
additional_emails[], additional_phones[]
source: manual|email_auto|import|ai_suggested
ai_relationship_summary, ai_summary_updated_at
email_count, last_email_at
created_by, updated_by, deleted_at (soft-delete)
```

### `crm_companies`
```
id, workspace_id, name, domain, industry, website, phone, address
employees_count, annual_revenue, currency_code
linkedin_url, account_owner_id, position
created_by, updated_by, deleted_at
```

### `crm_opportunities`
```
id, workspace_id, name
stage: lead|qualified|proposal|negotiation|won|lost
amount, currency_code, close_date
company_id, contact_id, owner_id
description, tags[], custom_fields (jsonb)
pulse_context (text), pulse_context_updated_at  -- AI summary
assigned_agent_id, agent_status, agent_instructions  (AI agent support)
created_by, updated_by, deleted_at
```

### `crm_opportunity_emails`
```
id, opportunity_id (FK), workspace_id
email_thread_id, email_id
email_subject, email_from, email_from_name, email_date
added_by, added_at
UNIQUE(opportunity_id, email_thread_id)
```

### `crm_notes`
```
id, workspace_id, title, body, position
created_by, updated_by, deleted_at
-- Linked via crm_note_targets (polymorphic)
```

### `crm_note_targets`
```
id, note_id
target_contact_id | target_company_id | target_opportunity_id
-- CHECK: exactamente 1 target
```

### `crm_timeline`
```
id, workspace_id, happens_at, event_type, event_data (JSONB), actor_id
target_contact_id | target_company_id | target_opportunity_id
-- Inmutable: log de eventos
```
**Eventos:** created, updated, deleted, note_added, stage_changed

### `crm_products`
```
id, workspace_id, name, description
unit_price, currency_code, unit_of_measure, tax_rate, category
is_active, created_by, created_at, updated_at
```

### `crm_quotations`
```
id, workspace_id, opportunity_id, company_id, contact_id
quotation_number (auto: P00001, P00002...)
status: draft|sent|accepted|rejected|cancelled
expiry_date, payment_terms, currency_code
subtotal, tax_total, total
created_by, created_at, updated_at
```

### `crm_quotation_lines`
```
id, quotation_id
line_type: product|section|note
product_id (opcional), name, description
quantity, unit_price, unit_of_measure, discount, tax_rate
subtotal = qty * price * (1 - discount/100)
position
```

### `crm_workflows`
```
id, workspace_id, name, description, is_active
trigger_type: stage_change|new_lead|lead_won|lead_lost|scheduled|manual
trigger_config (JSONB)
created_by, created_at, updated_at
```

### `crm_workflow_steps`
```
id, workflow_id, position
action_type: send_email|wait|create_task|update_stage|assign_agent|
             create_meeting|send_notification|create_quotation|ai_action
action_config (JSONB), condition (JSONB)
```

### `crm_workflow_runs`
```
id, workflow_id, opportunity_id, workspace_id
status: running|waiting|completed|failed|cancelled
current_step, context_data (JSONB)
started_at, completed_at, next_action_at
error_message
```

### `crm_opportunity_tasks`
```
id, opportunity_id, workspace_id, title
due_date, assignee_id
status: pending|done
created_by, created_at, completed_at
```

### `crm_agent_queue`
```
id, workspace_id, opportunity_id, contact_id, agent_id
task_type: research_contact|draft_email|update_deal|summarize_relationship|custom
status: pending|processing|completed|failed
instructions, result (JSONB)
created_by, created_at, started_at, completed_at
```

### `email_participants`
```
id, email_id, contact_id, email_address, display_name
role: from|to|cc|bcc
-- Conecta emails del módulo Email con contactos CRM
```

---

## 2. ENDPOINTS API

**Base:** `/api/crm`

### Contactos
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/contacts` | Listar (workspace_id, search, limit, offset) |
| GET | `/contacts/{id}` | Detalle + timeline + emails relacionados |
| POST | `/contacts` | Crear |
| PATCH | `/contacts/{id}` | Actualizar |
| DELETE | `/contacts/{id}` | Soft-delete |
| POST | `/contacts/from-email` | Crear desde email (AI relationship summary) |

**Crear desde email:** Extrae nombre del email, busca historial, Claude (`claude-sonnet-4-20250514`) genera ai_relationship_summary, tags: ["from-email"]

### Empresas
| Método | Ruta |
|--------|------|
| GET | `/companies` |
| GET | `/companies/{id}` | Detalle + contactos + oportunidades |
| POST | `/companies` |
| PATCH | `/companies/{id}` |
| DELETE | `/companies/{id}` |

### Oportunidades / Pipeline
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/pipeline` | Resumen por stages |
| GET | `/opportunities` | Listar (stage?, search?) |
| GET | `/opportunities/{id}` | Detalle + timeline + contact/company |
| GET | `/opportunities/{id}/full` | Detalle expandido |
| POST | `/opportunities` | Crear |
| PATCH | `/opportunities/{id}` | Actualizar |
| PATCH | `/opportunities/{id}/stage` | Cambiar stage (dispara workflows) |
| DELETE | `/opportunities/{id}` | Soft-delete |
| POST | `/opportunities/{id}/messages` | Agregar mensaje |
| GET | `/opportunities/{id}/messages` | Listar mensajes |
| GET | `/opportunities/{id}/emails` | Listar correos vinculados |
| POST | `/opportunities/{id}/emails` | Vincular thread de email |
| DELETE | `/opportunities/{id}/emails/{thread_id}` | Desvincular email |

**Workflow triggers en cambio de stage:**
- `new_lead` → stage=lead (al crear)
- `stage_change` → cualquier cambio
- `lead_won` → stage=won
- `lead_lost` → stage=lost

### Productos
| Método | Ruta |
|--------|------|
| GET | `/products` | search, category |
| POST | `/products` |
| PATCH | `/products/{id}` |

### Presupuestos (Quotations)
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/quotations` | Listar (opportunity_id?) |
| GET | `/quotations/{id}` | Detalle + líneas |
| POST | `/quotations` | Crear (con líneas opcionales) |
| PATCH | `/quotations/{id}` | Actualizar header |
| POST | `/quotations/{id}/lines` | Agregar línea |
| PATCH | `/quotation-lines/{id}` | Actualizar línea |
| DELETE | `/quotation-lines/{id}` | Eliminar línea |
| POST | `/quotations/{id}/recalculate` | Recalcular totales |

**Cálculo:** `subtotal = qty * price * (1 - discount/100)` | `total = sum(subtotal * (1 + tax_rate/100))`

### Notas
| Método | Ruta |
|--------|------|
| GET | `/notes` | entity_type?, entity_id? |
| POST | `/notes` | title, body, entity_type?, entity_id? |
| PATCH | `/notes/{id}` |
| DELETE | `/notes/{id}` |

### Timeline
| Método | Ruta | Params |
|--------|------|--------|
| GET | `/timeline` | entity_type, entity_id, workspace_id, limit, offset |

### Workflows
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/workflows` | Listar |
| POST | `/workflows` | Crear (+ steps) |
| PATCH | `/workflows/{id}` | Actualizar |
| DELETE | `/workflows/{id}` |
| GET | `/workflow-runs` | Ejecuciones (workflow_id?, status?) |
| POST | `/workflows/{id}/trigger` | Trigger manual |

### Búsqueda Global
| Método | Ruta | Params |
|--------|------|--------|
| GET | `/search` | q (min 2 chars), workspace_id, limit |
Retorna: contacts, companies, opportunities, total_count

### Agent Queue
| Método | Ruta |
|--------|------|
| POST | `/agent-queue` | Crear task para agente |
| GET | `/agent-queue` | Listar (status?, agent_id?, opportunity_id?) |
| GET | `/agent-queue/{id}` | Detalle con resultado |

---

## 3. COMPONENTES FRONTEND

```
core-web/src/components/CRM/
  CrmView.tsx              -- Container + tab navigation
  ContactsList.tsx
  ContactDetail.tsx
  CompaniesList.tsx
  CompanyDetail.tsx
  PipelineView.tsx         -- Kanban + agent assignment
  OpportunityDetail.tsx    -- Tasks, chat, pipeline
  QuotationsList.tsx
  QuotationDetail.tsx      -- Editor de líneas
  ProductsView.tsx         -- Cards estilo Odoo
  NotesView.tsx
  WorkflowsView.tsx        -- Builder + templates
  WorkflowRunsList.tsx
  TimelinePanel.tsx
  NoteEditor.tsx
  CreateContactFromEmailButton.tsx
```

**Tabs en CrmView:** Pipeline, Products, Contacts, Companies, Notes, Workflows

**Chat context:** `ViewContextStore` permite al SidebarChat saber el sub-view activo y entidad seleccionada

### Tools AI de Chat para CRM
El chat tiene tools CRM disponibles cuando el usuario está en la vista CRM:
- `search_contacts` — buscar contactos
- `search_pipeline` — ver oportunidades
- `create_note` — crear nota
- `create_opportunity` — crear oportunidad (recibe `name`, `workspace_id`)

---

## 4. FLUJOS PRINCIPALES

### A. Crear Contacto desde Email
1. Click "Crear desde Email" → pasa email_address
2. API verifica no existe contacto con ese email
3. Extrae nombre (antes del @)
4. Busca historial de emails (from/to/cc/bcc)
5. Claude genera ai_relationship_summary si hay emails
6. Crea contact con tags: ["from-email"]
7. Crea timeline event: "created from-email"

### B. Cambiar Stage → Trigger Workflows
1. PATCH `/opportunities/{id}/stage`
2. API actualiza opportunity
3. Crea timeline event: stage_changed
4. Determina trigger_type
5. `trigger_workflows()` → crea `crm_workflow_runs`
6. Ejecuta steps secuencialmente
7. Si `wait` action: status=waiting, set `next_action_at`
8. Cron resume workflows en espera

### C. Crear Presupuesto con Líneas
1. `POST /quotations` → crea header
2. `POST /quotations/{id}/lines` por cada línea
3. API calcula subtotal por línea
4. `_recalculate()` actualiza totals (subtotal, tax_total, total)
5. Frontend muestra totales en tiempo real

### D. Agent Queue en CRM
1. `POST /crm/agent-queue` con task_type + instructions
2. Agente CRM recoge de queue (status=pending → processing)
3. Ejecuta task (research, draft, update, etc.)
4. Guarda result en `crm_agent_queue.result`
5. `GET /crm/agent-queue/{id}` para ver resultado

---

## 5. MIGRACIONES SUPABASE

```
supabase/migrations/
  20260404000002_crm_tables.sql           -- Tablas core
  20260404000003_add_crm_to_default_apps.sql -- Enum + workspace defaults
  20260404000003_crm_agent_support.sql    -- Agent queue + columnas
  20260405000001_crm_products_quotations.sql -- Products + quotations + trigger
  20260405000002_crm_opportunity_tasks.sql   -- Tasks table
  20260405000002_crm_workflows.sql           -- Workflows tables
```

---

## 6. ARCHIVOS CLAVE

```
core-api/api/routers/crm.py
core-api/api/services/crm/
  contacts.py
  companies.py
  opportunities.py
  quotations.py
  products.py
  notes.py
  timeline.py
  workflows.py       -- CRUD + execution + step processing + cron
core-web/src/
  components/CRM/
  stores/crmStore.ts
  api/client.ts (métodos CRM)
```

---

## 7. ESTADO

### ✅ Completo
- CRUD contactos, empresas, oportunidades
- Pipeline Kanban con drag de stages
- Timeline inmutable por entidad
- Notas (polymorphic: contact/company/opportunity)
- Búsqueda global CRM
- Productos catálogo (estilo Odoo)
- Presupuestos (quotations) con line items y cálculo automático
- Workflow automation (triggers, steps, runs, wait, cron resume)
- AI tools en chat (search, create opportunity/note)
- Agent queue para CRM
- Crear contacto desde email + AI relationship summary
- Chat context awareness (CRM sub-view)
- **Contexto Pulse**: tab IA en OpportunityDetail, genera resumen de la oportunidad orientado a ventas (notas, tareas, correos). Actualización manual o nightly.
- **Correos vinculados**: tabla `crm_opportunity_emails`, sección en OpportunityDetail
- **Botón Oportunidad en email**: desde EmailView se puede crear oportunidad o vincular correo a existente

### 🔄 Pendiente
- Email compose directo desde OpportunityDetail
- Import/export masivo de contactos
- Reportes y analytics de pipeline
- Integración calendario para meetings en oportunidades
- Templates de email para workflows
- Workflow `ai_action` step (tipo existe, lógica pendiente)
- Actualización automática nightly de Contexto Pulse (cron)
- Pop-up de hilo completo al clicar correo vinculado desde OpportunityDetail
- Buscar en bandeja al agregar correo a oportunidad existente
