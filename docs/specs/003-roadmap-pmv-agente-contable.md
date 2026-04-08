# Roadmap PMV: Agente Contable Autónomo en Shell Odoo

**Fecha:** 2026-04-08
**Piloto:** Biomag (Odoo 18.0, instancia migración)
**Objetivo:** Agente contable que detecta problemas, simula correcciones con dry-run,
y presenta propuestas al contable dentro de Odoo para aprobación.
**Plazo objetivo:** Antes de Odoo v20 (septiembre 2026)

---

## Qué es PMV y qué NO es

### PMV incluye
- 1 agente (contable Biomag) ejecutando 1 tarea autónoma (revisión fiscal de facturas)
- Dry-run transaccional con rollback
- Bloqueo de side-effects (emails, queue_job, HTTP)
- Propuestas visibles en Odoo (pulse.proposal)
- Aprobación/rechazo desde Odoo por el contable
- Monitorización básica en Pulse (estado agente, logs)

### PMV NO incluye
- Múltiples agentes / múltiples clientes
- Conciliación bancaria (fase 2)
- Chat bidireccional con el agente
- Dashboard de facturación / tiers
- Memoria persistente entre sesiones (MEMORY.md)
- Prior art / patente (en paralelo, no bloquea)
- Frontend Pulse para el cliente (el cliente vive en Odoo)

---

## Fases

### Fase 0: Infraestructura shell (1 semana)
**Goal:** Un proceso Odoo shell corriendo en Biomag 18.0 con PID separado,
accesible desde Pulse via WSS.

| Tarea | Detalle |
|---|---|
| 0.1 | Arrancar `odoo shell --no-http` en Biomag 18.0 migración como servicio systemd |
| 0.2 | Verificar que el shell comparte BD con Odoo principal y que `cr.rollback()` funciona |
| 0.3 | Crear usuario técnico `pulse_contable@biomag` con grupos account.group_account_invoice + readonly |
| 0.4 | Establecer conexión WSS desde Pulse (85.215.105.45) al shell Biomag |
| 0.5 | Heartbeat básico: el shell reporta "alive" cada 30s a Pulse |

**Criterio de éxito:** Desde Pulse puedo enviar un mensaje WSS al shell y recibir
respuesta con datos de `res.company.search_read()` de Biomag.

**Riesgo:** El shell de Odoo 18 no tiene servidor WSS nativo — hay que embeber
un servidor asyncio websocket dentro del proceso shell.

---

### Fase 1: Dry-run sandbox (1 semana)
**Goal:** El shell puede ejecutar operaciones ORM completas y deshacerlas
sin afectar la BD ni disparar side-effects.

| Tarea | Detalle |
|---|---|
| 1.1 | Implementar contexto `pulse_dry_run=True` en el shell |
| 1.2 | Monkey-patch `mail.mail.send` → bloqueado en dry-run |
| 1.3 | Override `with_delay` (queue_job) → bloqueado en dry-run |
| 1.4 | Monkey-patch `requests.Session.request` → bloqueado en dry-run |
| 1.5 | Implementar patrón Read-Reason-Act con gestión de cursores |
| 1.6 | Test: crear factura en dry-run, validarla, verificar que `cr.rollback()` la elimina |
| 1.7 | Test: verificar que en dry-run NO se envían emails ni se encolan jobs |

**Criterio de éxito:** Puedo ejecutar `move.action_post()` en dry-run,
verificar que el asiento es correcto, y hacer rollback sin rastro en la BD.

---

### Fase 2: Módulo jt_pulse_agent en Odoo (1-2 semanas)
**Goal:** Modelo `pulse.proposal` funcional en Odoo con vistas tree/form
para que el contable vea y apruebe propuestas del agente.

| Tarea | Detalle |
|---|---|
| 2.1 | Crear módulo `jt_pulse_agent` para Odoo 18.0 |
| 2.2 | Modelo `pulse.proposal` (campos: fecha, tipo, resumen, detalle_json, estado [pendiente/aprobado/rechazado/ejecutado], motivo_rechazo, record_model, record_ids, dry_run_result, created_by_agent) |
| 2.3 | Modelo `pulse.agent.log` (campos: timestamp, agent, model, method, record_ids, result, duration_ms) |
| 2.4 | Vista tree de propuestas: Contabilidad > Agente IA > Propuestas |
| 2.5 | Vista form con detalle de la propuesta, botones Aprobar/Rechazar, campo motivo rechazo |
| 2.6 | Acción en botón Aprobar → escribe `state='aprobado'` + señal al shell via campo `approved_at` |
| 2.7 | Acción en botón Rechazar → wizard con motivo, escribe `state='rechazado'` |
| 2.8 | Record rules: contable solo ve propuestas de su company |
| 2.9 | Chatter en pulse.proposal para historial |
| 2.10 | Menú en Contabilidad con badge de pendientes |

**Criterio de éxito:** El contable abre Contabilidad > Agente IA, ve una
lista de propuestas pendientes, puede abrir cada una, ver el detalle, y
aprobar o rechazar con un botón.

---

### Fase 3: Primera tarea autónoma — revisión fiscal (1-2 semanas)
**Goal:** El agente detecta facturas borrador con impuestos incorrectos,
simula la corrección, y crea una pulse.proposal para el contable.

| Tarea | Detalle |
|---|---|
| 3.1 | Implementar heartbeat scheduler en el shell (cron Python, no ir.cron) |
| 3.2 | Tarea "tax_audit": READ facturas borrador + partners + fiscal positions |
| 3.3 | REASON: enviar datos a Claude API, pedir análisis de coherencia fiscal |
| 3.4 | Prompt con reglas Biomag: nacionales 21%, intracomunitarias 0%+FP, Canarias IGIC |
| 3.5 | ACT (dry-run): para cada problema detectado, simular corrección con savepoint |
| 3.6 | Crear `pulse.proposal` por cada corrección propuesta con dry_run_result |
| 3.7 | Publicar mensaje en chatter de la factura afectada: "El agente ha detectado..." |
| 3.8 | Polling: el shell revisa cada 60s si hay propuestas aprobadas → ejecuta en modo real |
| 3.9 | Tras ejecución real, actualizar proposal.state='ejecutado' + log en pulse.agent.log |
| 3.10 | Publicar en chatter de la factura: "Corrección aplicada (aprobada por Rosa)" |

**Criterio de éxito:** El agente detecta una factura con IVA incorrecto,
crea una propuesta en Odoo, el contable la aprueba, y la corrección se aplica.
Todo el flujo sin intervención de JUMO.

---

### Fase 4: Monitorización en Pulse (1 semana)
**Goal:** JUMO puede ver el estado del agente Biomag desde Pulse.

| Tarea | Detalle |
|---|---|
| 4.1 | Endpoint en core-api para recibir heartbeats del agente via WSS |
| 4.2 | Endpoint para recibir logs de ejecución (proposals creadas, aprobadas, ejecutadas) |
| 4.3 | Vista en Pulse admin: estado agente (online/offline/error), último heartbeat |
| 4.4 | Vista en Pulse admin: log de actividad (findings, proposals, ejecuciones) |
| 4.5 | Alerta si heartbeat ausente > 5 min |
| 4.6 | Tracking básico de tokens consumidos por llamada a Claude API |

**Criterio de éxito:** JUMO abre Pulse, ve que el agente Biomag está online,
ve las últimas propuestas creadas, y recibe alerta si el agente cae.

---

### Fase 5: Validación y ajuste con Biomag (1 semana)
**Goal:** El agente corre en producción (migración 18.0) durante una semana,
el contable de Biomag lo usa, y se ajustan reglas según feedback.

| Tarea | Detalle |
|---|---|
| 5.1 | Activar heartbeat diario a las 7:00 (revisión fiscal facturas borrador) |
| 5.2 | Recoger feedback del contable: rechazos, falsos positivos, reglas incorrectas |
| 5.3 | Ajustar prompt/reglas según feedback |
| 5.4 | Verificar que no hay impacto en rendimiento de Odoo producción |
| 5.5 | Documentar lecciones aprendidas |

**Criterio de éxito:** El contable de Biomag ha aprobado >= 5 propuestas
del agente y la tasa de rechazo es < 30%.

---

## Timeline

```
Semana 1 (abr 14-18)     Fase 0: Shell + WSS
Semana 2 (abr 21-25)     Fase 1: Dry-run sandbox
Semana 3-4 (abr 28-may 9) Fase 2: Módulo jt_pulse_agent
Semana 5-6 (may 12-23)   Fase 3: Tarea autónoma tax_audit
Semana 7 (may 26-30)     Fase 4: Monitorización Pulse
Semana 8 (jun 2-6)       Fase 5: Validación con Biomag

PMV completo: ~8 semanas → principios junio 2026
3 meses antes de Odoo v20 (sept 2026)
```

## Dependencias externas

| Dependencia | Fase | Quién |
|---|---|---|
| Acceso SSH a Biomag 18.0 migración | 0 | JUMO (ya existe) |
| Usuario técnico en Odoo Biomag | 0 | JUMO admin |
| API key Claude (Anthropic) | 3 | JUMO (ya existe) |
| Contable de Biomag disponible para test | 5 | Biomag |
| Reglas fiscales reales de Biomag | 3 | JUMO + Biomag |

## Stack técnico PMV

| Componente | Tecnología |
|---|---|
| Shell Odoo | `odoo shell --no-http` Odoo 18.0, Python 3.10+ |
| WSS server en shell | `websockets` (asyncio, embebido en el proceso shell) |
| LLM | Claude API (Anthropic SDK Python) |
| Módulo Odoo | `jt_pulse_agent` — modelos, vistas, seguridad |
| Monitorización | Pulse core-api (FastAPI) — endpoints WSS + REST |
| BD | PostgreSQL (la misma de Odoo Biomag) |

## Qué viene después del PMV (si funciona)

| Fase post-PMV | Descripción |
|---|---|
| 6 | Segunda tarea: conciliación bancaria con aprobación en lote |
| 7 | Memoria persistente (MEMORY.md): el agente aprende de rechazos |
| 8 | pulse.pending_action para side-effects con delay |
| 9 | Segundo cliente (Skynet o HODS) |
| 10 | Dashboard facturación + tiers en Pulse |
| 11 | Prior art Zenodo + registro marca OpenClaw |

## Decisiones de scope PMV

| Decisión | Motivo |
|---|---|
| Solo 1 tarea (tax_audit) | Validar el flujo completo end-to-end antes de añadir tareas |
| Sin memoria persistente | No necesaria para la primera tarea; añade complejidad |
| Sin pending_action (delay) | Tax_audit solo escribe en BD, no envía emails ni llama APIs |
| Sin chat bidireccional | El contable aprueba/rechaza, no conversa con el agente |
| Sin dashboard cliente en Pulse | El cliente vive en Odoo, no necesita otra web |
| Polling para aprobaciones (no WSS) | El shell revisa cada 60s si hay proposals aprobadas — simple y suficiente para PMV |
| Sin tiers ni facturación | Biomag es piloto interno, no paga aún |
