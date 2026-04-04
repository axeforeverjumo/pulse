# CRM Integration Design — Pulse + Twenty

**Fecha:** 2026-04-04
**Estado:** Validado

## Resumen

Integrar funcionalidades CRM de Twenty directamente en Pulse como modulos nativos. Nuevas entidades (Contactos, Empresas, Oportunidades, Notas) + mejoras a modulos existentes (Email, Tasks, Calendar) + integracion con el chat IA.

---

## Fase 1: Base de datos CRM (migracion)

### Tabla: crm_contacts (People)
- id, user_id, workspace_id
- first_name, last_name
- emails (JSONB: primary + additional)
- phones (JSONB: primary + additional con country code)
- job_title, city
- avatar_url, linkedin_url
- company_id (FK -> crm_companies)
- source (manual | email_auto | import)
- position, created_by, updated_by
- search_vector (tsvector)

### Tabla: crm_companies (Companies)
- id, user_id, workspace_id
- name, domain
- industry, employees_count
- annual_revenue, currency_code
- address (JSONB: street, city, state, postal, country)
- linkedin_url, website
- account_owner_id (FK -> users)
- position, created_by, updated_by
- search_vector (tsvector)

### Tabla: crm_opportunities (Deals)
- id, user_id, workspace_id
- name
- amount, currency_code
- stage (TEXT: lead, qualified, proposal, negotiation, won, lost)
- close_date
- company_id (FK -> crm_companies)
- contact_id (FK -> crm_contacts)
- owner_id (FK -> users)
- position, created_by, updated_by
- search_vector (tsvector)

### Tabla: crm_notes
- id, user_id, workspace_id
- title
- body (TEXT, rich text markdown/HTML)
- position, created_by, updated_by
- search_vector (tsvector)

### Tabla: crm_note_targets (polymorphic linking)
- id, note_id (FK -> crm_notes)
- target_contact_id (FK -> crm_contacts, nullable)
- target_company_id (FK -> crm_companies, nullable)
- target_opportunity_id (FK -> crm_opportunities, nullable)
- CHECK: exactly one target set

### Tabla: crm_timeline (activity feed)
- id, workspace_id
- happens_at
- event_type (email_received, note_created, deal_stage_changed, task_completed, etc.)
- event_data (JSONB)
- actor_id (FK -> users)
- target_contact_id, target_company_id, target_opportunity_id (all nullable)
- search_vector (tsvector)

### Tabla: email_participants (mejora email existente)
- id, email_id (FK -> emails)
- contact_id (FK -> crm_contacts, nullable)
- email_address, display_name
- role (from, to, cc, bcc)

---

## Fase 2: Backend API (FastAPI)

### Endpoints CRM
- CRUD: /api/crm/contacts, /api/crm/companies, /api/crm/opportunities
- CRUD: /api/crm/notes (con note_targets)
- GET: /api/crm/timeline/{entity_type}/{entity_id}
- GET: /api/crm/search?q=... (busqueda global CRM)
- POST: /api/crm/contacts/auto-create (desde email participants)

### Mejoras Email
- Al sincronizar emails: crear email_participants + auto-crear contactos
- Vincular participantes a crm_contacts existentes por email

---

## Fase 3: Frontend React

### Nuevas vistas en sidebar
- Contactos: tabla con filtros, detalle con timeline
- Empresas: tabla con filtros, detalle con contactos vinculados
- Pipeline: kanban de oportunidades por stage
- Notas: lista vinculada a cualquier entidad CRM

### Mejoras existentes
- Email: mostrar contacto vinculado en cada email
- Tasks: poder vincular tarea a contacto/empresa
- Chat IA: herramientas para buscar/crear/actualizar contactos, empresas, deals

---

## Fase 4: Chat IA integration

### Nuevas tools para el agente
- search_crm_contacts(query) -> buscar contactos
- get_contact_details(id) -> detalle con timeline
- create_contact(data) -> crear contacto
- search_companies(query) -> buscar empresas
- get_pipeline_summary() -> resumen de deals
- update_opportunity_stage(id, stage) -> mover deal
- create_note(title, body, targets) -> crear nota vinculada

Estas tools funcionan tanto en el chat global como en el panel lateral.
