# SPEC-003: Agente OpenClaw Contable en Shell Odoo — Piloto Biomag

**Fecha:** 2026-04-06
**Estado:** Borrador
**Autor:** Juan Manuel Ojeda + Claude
**Piloto:** Biomag (Odoo 18.0, instancia migración)

---

## Visión

Un agente contable IA que vive como proceso OpenClaw dentro del shell de Odoo, con acceso ORM directo. Opera en tres modos: autómata (heartbeats), a petición (chat desde Pulse) y por README (instrucciones de cliente traducidas por JUMO). Pulse queda como UI pura — chat, logs, aprobaciones.

## Arquitectura

```
Odoo 18.0 Biomag
├── :8069 (producción, intocable)
└── :8169 (agent shell)
    └── OpenClaw
        ├── Gateway
        ├── ~/.openclaw/agents/contable_biomag/
        │   ├── SOUL.md          ← personalidad + expertise
        │   ├── TOOLS.md         ← operaciones ORM permitidas
        │   ├── README.md        ← instrucciones cliente (generado por JUMO)
        │   ├── HEARTBEAT.md     ← schedule automático
        │   └── MEMORY.md        ← aprendizaje acumulado
        ├── LLM client → Claude API
        ├── Cursor staging (rollback always)
        ├── Cursor prod (commit on approval)
        └── WSS → Pulse (UI + aprobaciones)
```

### Flujo de datos

```
Pulse (UI)                    Odoo Shell (:8169)              Odoo Prod (:8069)
    │                              │                               │
    │── tarea via WSS ──→          │                               │
    │                              │── ejecuta en cursor staging   │
    │                              │── valida resultado            │
    │                              │── rollback staging            │
    │←── resultado + diff ──       │                               │
    │                              │                               │
    │── aprobación ──→             │                               │
    │                              │── replica en cursor prod ──→  │
    │                              │── commit                      │
    │←── confirmación ──           │                               │
```

## Funciones del agente contable Biomag

### Tareas core

| Tarea | Modelos Odoo | Modo |
|---|---|---|
| Revisar pedidos de marketplaces | sale.order, sale.order.line | Autómata (heartbeat) |
| Verificar posición fiscal de partners | res.partner, account.fiscal.position | Autómata + a petición |
| Revisar impuestos correctos en facturas | account.move, account.move.line, account.tax | Autómata |
| Validar series de facturación | ir.sequence, account.journal | Autómata |
| Publicar facturas (draft → posted) | account.move | Con aprobación |
| Conciliación bancaria | account.bank.statement, account.bank.statement.line | Con aprobación |

### Heartbeats (modo autómata)

```markdown
# HEARTBEAT.md — Contable Biomag

## Cada hora (horario laboral 8-20)
- Revisar pedidos marketplace nuevos sin factura
- Verificar posición fiscal de partners nuevos/modificados

## Cada día 7:00
- Auditoría de impuestos en facturas borrador
- Validar series de facturación (gaps, duplicados)
- Listar facturas listas para publicar → enviar a Pulse para aprobación

## Cada día 22:00
- Conciliación bancaria: proponer matches → enviar a Pulse para aprobación

## Cada lunes 9:00
- Informe semanal: facturas publicadas, pendientes, descuadres, partners sin fiscal position
```

### README (instrucciones cliente, generado por JUMO)

```markdown
# README.md — Contable Biomag
# Generado por JUMO el 2026-04-XX. No editar manualmente.

## Marketplace Rules
- sale.order where channel = 'amazon' → priority: high, review fiscal position mandatory
- sale.order where channel = 'prestashop' → priority: normal
- Pedidos intracomunitarios (partner.country != ES) → verificar NIF-IVA via VIES

## Tax Validation
- Ventas nacionales: IVA 21% por defecto, verificar excepciones (4%, 10%)
- Ventas intracomunitarias: IVA 0% + fiscal position "Intra-community"
- Ventas Canarias/Ceuta/Melilla: IGIC, no IVA
- Amazon FBA EU: verificar país de envío real, no país del marketplace

## Invoice Series
- Facturas nacionales: serie BINV/YYYY/
- Facturas rectificativas: serie BRINV/YYYY/
- No permitir gaps en secuencia

## Approval Rules
- Publicar facturas < 1.000€ → auto-approve
- Publicar facturas >= 1.000€ → aprobación humana
- Conciliación bancaria → siempre aprobación humana
- Cualquier write sobre res.partner.property_account_position_id → aprobación humana

## Alerts
- Partner sin posición fiscal asignada → alert canal #contabilidad
- Factura con impuesto 0% en venta nacional → alert canal #contabilidad
- Descuadre en conciliación > 0.50€ → alert canal #contabilidad
```

## Modos de operación

### 1. Autómata (heartbeats)
El agente corre según schedule sin intervención. Ejecuta en staging, valida, y:
- **Si es read-only** (informes, alertas): reporta a Pulse directamente
- **Si requiere write**: envía propuesta a Pulse, espera aprobación

### 2. A petición (chat)
El usuario escribe en Pulse: `@contable revisa los pedidos de Amazon de esta semana`
Pulse envía la tarea por WSS al agente en :8169.

### 3. Por README
El README condiciona todas las decisiones del agente. JUMO lo genera traduciendo las indicaciones del cliente a reglas que el agente interpreta. El cliente nunca ve ni edita el README.

## Seguridad

### Transporte
- WSS (TLS) entre Pulse y :8169
- Puerto 8169 no expuesto a internet — solo accesible desde IP de Pulse

### Autenticación
- JWT firmado por Pulse al abrir socket
- Token corta vida (15min), renovación por socket
- JWT scoped: workspace_id + agent_id + odoo_instance_id

### Permisos Odoo
- Usuario técnico: `pulse_contable@biomag`
- Grupos: `account.group_account_invoice`, `account.group_account_readonly`
- **Sin** `base.group_system` — no puede instalar, configurar ni tocar settings
- Record rules: solo acceso a companies asignadas

### Operaciones
| Tipo | Comportamiento |
|---|---|
| search, read | Siempre permitido, sin aprobación |
| write, create | Ejecuta en staging, pide aprobación, replica en prod |
| unlink | Prohibido. El agente no borra nada |
| SQL directo | Prohibido. Siempre ORM |

### Límites
- Timeout por operación: 30s
- Máximo writes por tarea: 50 registros
- Rate limit: 100 operaciones/minuto
- Exceso → rollback + kill + alerta a Pulse

### Auditoría
- Modelo `pulse.agent.log` en Odoo (inmutable para el agente)
- Campos: timestamp, agent_id, model, method, record_ids, approved_by, result
- Pulse muestra el log en UI del workspace

## Tracking de uso y facturación

### Qué se registra

Cada llamada al LLM que hace el agente genera un registro:

| Campo | Origen | Ejemplo |
|---|---|---|
| timestamp | Agente | 2026-04-06 14:32:01 |
| agent_id | OpenClaw | contable_biomag |
| task_type | Agente | heartbeat / petición / readme |
| model_llm | Claude API response | claude-sonnet-4-20250514 |
| tokens_in | Claude API response | 3.420 |
| tokens_out | Claude API response | 1.150 |
| cost_usd | Calculado (precio por token) | $0.018 |
| odoo_operations | Agente | 12 reads, 3 writes |
| duration_s | Agente | 8.4 |
| workspace_id | JWT | uuid del workspace Biomag |

### Dónde se almacena

```
Agente (shell Odoo)                    Pulse (Supabase)
pulse.agent.log                        pulse_usage
├── operaciones ORM     ── WSS ──→     ├── tokens por tarea
├── resultado                          ├── coste por tarea
└── auditoría local                    ├── agregado por agente/mes
                                       └── agregado por cliente/mes
```

Doble registro:
- **En Odoo** (`pulse.agent.log`): auditoría operacional — qué hizo el agente
- **En Pulse** (`pulse_usage`): facturación — cuánto costó

### Dashboard en Pulse

```
┌─────────────────────────────────────────────────┐
│ Biomag — Agente Contable          Abril 2026    │
├─────────────────────────────────────────────────┤
│ Tareas ejecutadas:          142                 │
│   Heartbeats:               98                  │
│   A petición:               31                  │
│   README triggers:          13                  │
│                                                 │
│ Tokens consumidos:          487.320             │
│   Input:                    312.100             │
│   Output:                   175.220             │
│                                                 │
│ Coste LLM real:             $7.42               │
│ Operaciones Odoo:           1.847               │
│                                                 │
│ Facturar al cliente:        99€ (tier Básico)   │
│ Margen:                     91.2%               │
└─────────────────────────────────────────────────┘
```

### Facturación

| Dato | Fuente |
|---|---|
| Coste real (tokens) | Claude API response → pulse_usage |
| Precio al cliente | Tier contratado (99/199/349€) |
| Margen | Precio - coste real |
| Alertas | Si coste real > 30% del precio → revisar uso |

JUMO ve el coste real y el margen. El cliente ve el tier que paga y un resumen de actividad (tareas ejecutadas, no tokens ni costes).

## Dry-Run Sandbox: bloqueo de side-effects irreversibles

`cr.rollback()` solo deshace escrituras en PostgreSQL. Tres cosas escapan al rollback:
queue_job (encola trabajos en workers externos), emails (SMTP sale del proceso),
y llamadas HTTP a APIs externas (Amazon SP-API, marketplaces, VIES, etc.).

El agente opera **siempre** con `pulse_dry_run=True` en contexto durante la fase
de simulación. Esto bloquea las tres puertas:

### 1. queue_job — bloqueo de with_delay

```python
# En jt_pulse_agent, override de with_delay:
# Si pulse_dry_run=True, no encola — devuelve self para no romper la cadena
if self.env.context.get('pulse_dry_run'):
    _logger.info('DRY RUN: job %s bloqueado', method.__name__)
    return self
```

### 2. Emails — bloqueo de mail.mail send

```python
# Monkey-patch al arrancar el shell del agente
original_send = type(env['mail.mail']).send

def _blocked_send(self, *args, **kwargs):
    if self.env.context.get('pulse_dry_run'):
        _logger.info('DRY RUN: %d emails bloqueados', len(self))
        return True
    return original_send(self, *args, **kwargs)

type(env['mail.mail']).send = _blocked_send
```

### 3. APIs externas — bloqueo de HTTP saliente

```python
# Bloquear cualquier HTTP saliente durante dry run
import requests, threading
_original_request = requests.Session.request

def _blocked_request(self, method, url, **kwargs):
    if getattr(threading.current_thread(), 'pulse_dry_run', False):
        raise RuntimeError(f'DRY RUN: HTTP {method} {url} bloqueado')
    return _original_request(self, method, url, **kwargs)

requests.Session.request = _blocked_request
```

### Ciclo simulate → execute

```
SIMULATE (dry run)                    EXECUTE (real)
───────────────────────────           ─────────────────────
ctx = pulse_dry_run=True              ctx = pulse_dry_run=False
emails: bloqueados                    emails: permitidos
queue_job: bloqueados                 queue_job: permitidos
HTTP externo: bloqueado               HTTP externo: permitido

ejecuta acción ORM completa           ejecuta misma acción ORM
valida resultado (asserts)
cr.rollback()                         cr.commit()

→ devuelve: OK / KO + motivo         → hecho, log en pulse.agent.log
```

El agente **nunca ejecuta en modo real algo que no haya simulado y validado primero**.

### Side-effects en modo execute

Incluso en modo real, las acciones con side-effects irreversibles (emails, API calls)
no se ejecutan directamente. Se encolan como `pulse.pending_action` con delay configurable
(por defecto 5 min). Un cron separado las ejecuta. Si el agente detecta un error en el
siguiente ciclo de razonamiento, cancela la pending_action antes de que se materialice.

## Aislamiento de proceso y locks PostgreSQL

### El problema

Un agente que mantiene un cursor abierto mientras el LLM razona (5-30 segundos)
toma row locks en PostgreSQL. Si esos locks afectan a `account_move`, `sale_order`
u otros modelos críticos, **paraliza la operativa del Odoo de producción** que
comparte la misma BD.

Biomag: 32 cores, 12 workers, 50+ addons custom con queue_job en 16 canales.
Un lock en `account_move` durante 10 segundos bloquea facturación, conciliación
y sincronización de marketplaces simultáneamente.

### Solución: proceso separado + patrón Read-Reason-Act

**Proceso separado:** El agente NO corre en el proceso principal de Odoo (:8069).
Corre en un segundo proceso (`odoo shell --no-http --http-port=8169`) con su propio
PID. Comparte la BD PostgreSQL pero si el proceso del agente muere, Odoo producción
sigue sirviendo sin interrupción.

**Patrón Read-Reason-Act:** El agente NUNCA mantiene un cursor abierto mientras
el LLM piensa. Las tres fases están estrictamente separadas:

```python
# FASE 1: READ — cursor abierto solo para lectura, milisegundos
cr = registry.cursor()
env = api.Environment(cr, agent_uid, {'pulse_dry_run': True})
data = env['account.move'].search_read(domain, fields)
cr.close()  # cursor cerrado ANTES de llamar al LLM
# No hay locks retenidos en PostgreSQL

# FASE 2: REASON — sin cursor, sin conexión a BD
# El LLM razona sobre los datos en memoria Python
# Puede tardar 5, 10, 30 segundos — da igual, no hay locks
action = openclaw.reason(data)  # → Claude API call

# FASE 3: ACT — cursor nuevo, savepoint, operación atómica
if action.type == 'write':
    cr = registry.cursor()
    env = api.Environment(cr, agent_uid, {'pulse_dry_run': True})
    with cr.savepoint():
        env['account.move'].browse(action.ids).write(action.vals)
        # Validar post-condiciones
        if not action.validate(env):
            raise UserError('Validación fallida')
    cr.rollback()  # dry run: siempre rollback
    cr.close()     # cursor cerrado, milisegundos totales
```

### Tiempos de retención de cursor

| Fase | Cursor abierto | Duración típica | Locks |
|---|---|---|---|
| Read | Sí | 50-500ms | SELECT → shared lock, no bloquea writes |
| Reason | **No** | 5-30s | **Ninguno** |
| Act (dry run) | Sí | 50-200ms | Row lock → rollback inmediato |
| Act (real) | Sí | 50-200ms | Row lock → commit inmediato |

El cursor de producción nunca está abierto más de 500ms. El razonamiento LLM
(la parte lenta) ocurre con **cero conexiones a PostgreSQL abiertas**.

### Garantías

- Si el proceso del agente (:8169) muere → Odoo (:8069) no se entera
- Si PostgreSQL está bajo carga → el agente espera su turno como cualquier otro cliente
- Si una operación del agente tarda > 30s → timeout, rollback, kill, alerta a Pulse
- El agente nunca ejecuta `FOR UPDATE`, `LOCK TABLE` ni SQL directo

## Dual cursor (staging/prod)

```python
# Staging: el agente trastea sin consecuencias
cr_staging = registry.cursor()
env_staging = api.Environment(cr_staging, agent_uid, ctx)
# ... ejecuta operaciones ...
# ... valida resultado ...
cr_staging.rollback()  # siempre rollback

# Prod: solo tras aprobación humana (o auto-approve según README)
cr_prod = registry.cursor()
env_prod = api.Environment(cr_prod, agent_uid, ctx)
# ... replica las mismas operaciones ...
cr_prod.commit()
```

## Ventanas de rollback

Dos ventanas distintas según el tipo de operación:

### Escrituras en BD (rollback transaccional)

```
[────────── dry run ──────────]  cr.rollback()  → como si no hubiera pasado
                                  ↓ si OK
[── execute ── cr.commit() ──]   → irreversible en BD
```

- **En dry run**: la ventana es ilimitada. El agente puede ejecutar 50 operaciones,
  validarlas todas, y `cr.rollback()` las deshace en <1ms.
- **En execute**: el commit es atómico al final. Una vez commiteado, no hay vuelta
  atrás — pero ya fue validado completamente en dry run.

### Side-effects irreversibles (emails, APIs, queue_job)

```
[── encola pulse.pending_action ──]  [── delay configurable ──]  [── cron ejecuta ──]
                                      ↑ cancelable                 → irreversible
```

- **Delay por defecto**: 5 minutos. Configurable por tipo de acción en README.md.
- **Acciones críticas** (SII, Amazon SP-API, envío factura): delay 15min o aprobación humana.
- **Acciones informativas** (email resumen, alerta Discuss): delay 1min.
- El agente puede cancelar cualquier pending_action durante la ventana de delay.
- Si el agente muere, las pending_actions quedan huérfanas → cron las marca como
  `cancelled` si no tienen confirmación del agente en 2x el delay.

| Tipo de acción | Ventana rollback | Quién cancela |
|---|---|---|
| Write en BD (dry run) | Ilimitada | `cr.rollback()` |
| Write en BD (execute) | 0 (atómico) | No cancelable |
| Email / notificación | 1-5 min (delay) | Agente o humano |
| API externa (marketplace) | 5-15 min (delay) | Agente o humano |
| Publicar factura (SII) | Aprobación humana | Humano |

## Integración con Pulse: gestión y monitorización de agentes

Pulse es el **plano de control** de todos los agentes OpenClaw desplegados en clientes.
El agente vive en el shell de Odoo del cliente. Pulse vive en el servidor JUMO (85.215.105.45).
La comunicación es un WebSocket bidireccional.

### Roles

| Componente | Rol | Dónde vive |
|---|---|---|
| Agente OpenClaw | Ejecuta, lee ORM, razona con LLM | Shell Odoo cliente (:8169) |
| Pulse | Gestiona, monitoriza, aprueba, factura | Servidor JUMO (85.215.105.45) |
| Cliente (humano) | Ve actividad, aprueba acciones críticas | UI Pulse (web) o Discuss (Odoo) |
| JUMO (admin) | Config reglas, ve costes reales, debug | Dashboard Pulse (admin) |

### Protocolo WSS: Agent → Pulse

Un solo WebSocket persistente por agente. Heartbeat cada 30s.

```json
// Heartbeat (cada 30s)
{"type": "heartbeat", "agent_id": "contable_biomag", "status": "idle", "ts": "..."}

// Finding (el agente detectó algo)
{"type": "finding", "agent_id": "contable_biomag",
 "category": "tax_mismatch", "severity": "warning",
 "summary": "Factura BINV/2026/0412 tiene IVA 21% pero partner es intracomunitario",
 "data": {"move_id": 4521, "partner_id": 892, "expected_tax": "0%", "actual_tax": "21%"}}

// Propuesta de acción (requiere aprobación)
{"type": "action_proposal", "agent_id": "contable_biomag",
 "action": "write", "model": "account.move.line", "ids": [12043, 12044],
 "description": "Corregir IVA de 21% a 0% en líneas de factura BINV/2026/0412",
 "dry_run_result": "OK", "rollback_clean": true,
 "approval_required": true, "auto_approve_eligible": false}

// Resultado de ejecución
{"type": "action_result", "agent_id": "contable_biomag",
 "action_id": "uuid", "status": "committed",
 "records_affected": 2, "duration_ms": 142}

// Error / alerta
{"type": "alert", "agent_id": "contable_biomag", "level": "error",
 "message": "Timeout en operación: rollback ejecutado", "task_id": "uuid"}
```

### Protocolo WSS: Pulse → Agent

```json
// Tarea manual (usuario pide algo via chat)
{"type": "task", "task_id": "uuid",
 "instruction": "Revisa los pedidos de Amazon de esta semana",
 "source": "chat", "user": "contabilidad@biomag.es"}

// Aprobación de acción propuesta
{"type": "approval", "action_id": "uuid", "approved": true, "by": "admin@jumo"}

// Cancelar pending_action
{"type": "cancel_action", "action_id": "uuid", "reason": "usuario canceló"}

// Kill (emergencia)
{"type": "kill", "reason": "admin kill manual"}
```

### Monitorización en Pulse

#### Dashboard por agente (vista cliente)

```
┌─────────────────────────────────────────────────────────┐
│ 🟢 Agente Contable Biomag          Última actividad: 2m│
├─────────────────────────────────────────────────────────┤
│ Estado: idle (esperando próximo heartbeat 14:30)        │
│                                                         │
│ Hoy:                                                    │
│   Findings: 3 (1 warning, 2 info)                       │
│   Acciones ejecutadas: 7 (5 auto, 2 aprobadas)          │
│   Acciones pendientes: 1 (esperando aprobación)         │
│   Errores: 0                                            │
│                                                         │
│ Pending actions:                                        │
│   ⏳ Corregir fiscal position partner #892 [APROBAR|❌] │
│                                                         │
│ Últimas acciones:                                       │
│   14:12 ✅ Verificó impuestos 12 facturas borrador      │
│   13:45 ✅ Detectó partner sin fiscal position → alerta │
│   13:30 ✅ Heartbeat: 0 pedidos marketplace nuevos      │
└─────────────────────────────────────────────────────────┘
```

#### Dashboard admin JUMO (vista interna)

```
┌─────────────────────────────────────────────────────────────┐
│ Pulse Admin — Agentes activos: 3/5                          │
├─────────────────────────────────────────────────────────────┤
│ Agente              │ Cliente  │ Estado │ Coste mes │ Tier  │
│ contable_biomag     │ Biomag   │ 🟢     │ €7.42     │ €199  │
│ contable_skynet     │ Skynet   │ 🟢     │ €3.18     │ €99   │
│ contable_hods       │ HODS     │ 🟡 err │ €1.02     │ €99   │
│ contable_friman     │ Friman   │ ⚫ off │ —         │ —     │
│ contable_tecnausa   │ Tecnausa │ ⚫ off │ —         │ —     │
├─────────────────────────────────────────────────────────────┤
│ Margen total mes: €282.38 / €397 (71.1%)                    │
│ Tokens totales: 1.2M in / 487K out                          │
│ Alertas activas: 1 (HODS: timeout recurrente en heartbeat)  │
└─────────────────────────────────────────────────────────────┘
```

### Gestión de agentes desde Pulse

| Operación | Quién | Cómo |
|---|---|---|
| Desplegar agente nuevo | JUMO admin | Config JSON + instalar módulo `jt_pulse_agent` |
| Pausar agente | JUMO admin o cliente | Botón en Pulse → envía `{"type": "pause"}` |
| Kill emergencia | JUMO admin | Botón → envía `{"type": "kill"}` → mata proceso :8169 |
| Modificar reglas | JUMO admin | Edita README.md → push al agente via WSS |
| Ver logs operacionales | Cliente | UI Pulse (filtrado: solo su workspace) |
| Ver costes reales | JUMO admin | Dashboard admin (cliente NO ve tokens ni costes LLM) |
| Aprobar acción | Cliente o JUMO | Botón en Pulse o auto-approve según README |
| Escalar finding | Cliente | Marca finding como "necesita atención humana" |

### Alertas automáticas Pulse → JUMO

| Condición | Alerta |
|---|---|
| Heartbeat ausente > 5min | Agente caído — reiniciar proceso |
| 3+ errores consecutivos | Agente en bucle — pausar y revisar |
| Coste mensual > 30% del tier | Consumo anómalo — revisar patrones |
| Pending action sin resolver > 1h | Acción huérfana — cancelar o escalar |
| Rollback fallido (no debería pasar) | Crítico — kill inmediato + alerta |

## Comunicación

| Canal | Protocolo | Uso |
|---|---|---|
| Pulse ↔ Agent | WSS | Tareas, progreso, resultados, aprobaciones, heartbeat |
| Agent ↔ Odoo | ORM directo | Read-Reason-Act, cursores con savepoints |
| Agent → Claude API | HTTPS | Llamadas al LLM (fase Reason) |
| Pulse → Cliente | Web UI | Dashboard, aprobaciones, chat |
| Pulse → JUMO | Web UI (admin) | Costes, alertas, gestión |

Un solo WebSocket por agente. Heartbeat cada 30s. Sin HTTP, sin colas, sin RPC entre el agente y Odoo.

## Componentes a desarrollar

### 1. Módulo Odoo: `jt_pulse_agent` (en Odoo del cliente)
- Modelo `pulse.agent.log` para auditoría (inmutable para el agente)
- Modelo `pulse.pending_action` para side-effects con delay
- Override `with_delay` + monkey-patch `mail.mail.send` + `requests.Session`
- Usuario técnico + grupos + record rules
- Cron ejecutor de pending_actions
- Cron watchdog: cancela pending_actions huérfanas

### 2. OpenClaw agent runtime (proceso shell :8169)
- Daemon Python que arranca `odoo shell --no-http`
- Implementa patrón Read-Reason-Act con gestión de cursores
- Gestión de contexto `pulse_dry_run`
- Cliente WSS hacia Pulse
- Heartbeat scheduler (cron interno Python, no ir.cron de Odoo)

### 3. OpenClaw agent config: `contable_biomag`
- SOUL.md — personalidad + expertise contable
- TOOLS.md — operaciones ORM permitidas (whitelist)
- HEARTBEAT.md — schedule de tareas autónomas
- README.md — reglas de negocio Biomag (generado por JUMO)
- MEMORY.md — aprendizaje acumulado entre sesiones

### 4. Pulse backend (servidor JUMO)
- WSS endpoint para N agentes concurrentes
- Almacén de usage/facturación (Supabase `pulse_usage`)
- API para dashboard cliente (findings, acciones, aprobaciones)
- API para dashboard admin (costes, alertas, gestión)
- Motor de alertas automáticas

### 5. Pulse frontend (web)
- Dashboard cliente: actividad agente, pending approvals, chat
- Dashboard admin JUMO: todos los agentes, costes, márgenes, alertas
- Chat: enviar instrucciones al agente via WSS

### 6. `odoo-rpc.py` (fallback para clientes sin shell)
- CLI JSON-RPC para clientes que no quieren/pueden instalar el módulo
- El agente detecta si hay shell disponible; si no, cae a RPC
- Pierde dry-run nativo (no hay rollback transaccional via RPC)

## Siguiente paso

1. Crear módulo `jt_pulse_agent` para Odoo 18.0 (modelos + dry-run sandbox)
2. Crear daemon Read-Reason-Act con gestión de cursores
3. Configurar OpenClaw agent `contable_biomag` con SOUL + TOOLS
4. Escribir README.md con las reglas de Biomag
5. Conectar WSS desde agente a Pulse
6. Probar flujo: heartbeat → finding → dry run → propuesta → aprobación → execute → commit

## Protección de propiedad intelectual

### Búsqueda de anterioridades (estado del arte a abril 2026)

Se ha realizado búsqueda en Google Patents, USPTO, EPO (Espacenet) y WIPO. Resultado:

**No existe patente que combine estos tres elementos:**
1. Agente autónomo IA ejecutando operaciones en el ORM de un ERP con rollback transaccional
2. Aislamiento de cursor durante razonamiento LLM (Read-Reason-Act)
3. Bloqueo selectivo de side-effects irreversibles durante simulación

**Patentes cercanas encontradas (ninguna cubre el sistema completo):**

| Patente | Qué cubre | Qué NO cubre |
|---|---|---|
| WO2021084510A1 — "Executing AI agents in an operating environment" | Orquestación multi-agente, dashboard, data transforms | No hay rollback transaccional, no hay shell ERP, no hay dry-run |
| US20120102360A1 — "System and method for business function reversibility" | Undo/rollback en software suites ERP | No hay agente IA, no hay LLM, no hay cursor isolation |
| US11829796B2 — "Automated rollback" | Rollback automático basado en métricas | Es rollback de deployments, no de operaciones de negocio en BD |
| US20030126159A1 — "Rollback of ERP system upgrade" | Rollback de upgrades funcionales en ERP | Es rollback de versión, no transaccional por operación |

**Competencia analizada:**

| Producto | Arquitectura | Diferencia clave con nuestro sistema |
|---|---|---|
| SAP Joule (2024-2026) | Agentes sobre API, sin acceso ORM directo | No tiene dry-run transaccional, no vive en el proceso ERP |
| Salesforce Agentforce (2024-2026) | Agentes sobre CRM via API, ~10.000 contratos | No tiene rollback transaccional, no tiene shell, opera sobre API |
| Odoo SA v19 AI (2025) | Agentes reactivos via server actions, Enterprise-only | Server actions commitean sin dry-run, no hay cursor isolation |
| Odoo SA v20 "Agentic AI" (sept 2026) | Proactivo, Enterprise-only (anunciado) | Aún no lanzado. Mismo enfoque server actions previsible |
| OdooSense (GitHub) | API externa + ChatGPT | No vive en el ORM, no tiene rollback, proyecto pequeño |
| OCA llm_agent (v16) | Framework LLM tools en Odoo | No es autónomo, no tiene dry-run, no tiene cursor isolation |

**Conclusión**: El sistema compuesto (shell ERP + dry-run transaccional + Read-Reason-Act +
bloqueo side-effects + agente LLM autónomo) es novel. Los componentes individuales existen
pero la combinación no está patentada ni implementada por ningún competidor.

### Estrategia de protección IP (sin litigación)

No se busca litigar contra competidores con más recursos. La estrategia es defensiva
y basada en velocidad al mercado.

#### 1. Prior art defensivo (coste: 0€)

Publicar el método técnico con fecha certificada para impedir que terceros lo patenten:
- Paper técnico en arXiv o Zenodo (fecha inmutable, acceso global)
- Blog técnico en jumotech.com describiendo la arquitectura (sin código)
- Defensive Publication en IP.com (~200€)

Esto NO da exclusividad, pero impide que SAP, Odoo SA o Salesforce patenten el método
y bloqueen a JUMO.

#### 2. Registro de marcas (coste: ~1.700€)

| Marca | Clase EUIPO | Estado búsqueda |
|---|---|---|
| OpenClaw | 9 (software) + 42 (SaaS) | Sin resultados — probablemente disponible |
| Pulse | 9 + 42 | Nombre genérico — alta probabilidad de conflicto, buscar alternativa |

Acción: registrar OpenClaw en EUIPO. Para Pulse, verificar disponibilidad y considerar
nombre alternativo más distintivo si está tomado.

#### 3. Licencia copyleft estratégica (coste: 0€)

Separación entre código público y propietario:

```
AGPL-3.0 (público)                  Propietario (moat de JUMO)
──────────────────────               ─────────────────────────────
jt_pulse_agent (módulo Odoo)         OpenClaw (motor razonamiento LLM)
├── pulse.proposal                   Pulse (dashboard, facturación)
├── pulse.agent.log                  SOUL.md / TOOLS.md / README.md
├── pulse.pending_action             Memoria persistente del agente
├── dry-run sandbox patches          Reglas de negocio por cliente
└── Read-Reason-Act runtime          Métricas y costes reales
```

El módulo Odoo es AGPL (como Odoo Community). Si Odoo SA lo copia, debe publicar
sus cambios bajo AGPL — no puede meterlo en Enterprise (propietario).

El valor real (cerebro LLM, orquestación, memoria, reglas aprendidas) es propietario
y nunca se publica.

#### 4. Cláusula IP en contratos de servicio

> "El agente autónomo opera bajo configuración propietaria de JUMO Technologies.
> Las reglas de negocio, memoria acumulada del agente, y configuración de
> razonamiento son propiedad intelectual de JUMO y no se transfieren al cliente
> al terminar el servicio."

Lock-in legítimo: el cliente paga el tier, si se va pierde el agente con toda
su memoria y aprendizaje acumulado.

#### 5. Solicitud provisional de patente (coste: ~1.500€, opcional)

Si se decide patentar, redactar la solicitud en términos genéricos (sin marcas):

| En la spec | En la patente |
|---|---|
| Odoo | "Sistema ERP con capa ORM y soporte transaccional" |
| PostgreSQL | "SGBD relacional con savepoints" |
| Claude API | "Servicio externo de inferencia de modelo de lenguaje" |
| Shell de Odoo | "Shell interactivo con acceso al ORM del sistema ERP" |
| queue_job | "Sistema de colas de trabajo asíncrono" |
| mail.mail | "Subsistema de mensajería del sistema ERP" |

Reivindicaciones principales (claims):

1. Método para operar un agente de inteligencia artificial autónomo dentro de un
   shell interactivo de un sistema ERP, donde el agente ejecuta operaciones sobre
   la capa ORM con rollback transaccional previo al commit definitivo.

2. El método de la reivindicación 1, donde el agente implementa un patrón de
   ejecución en tres fases (lectura, razonamiento, acción) en el que el cursor
   de base de datos se cierra antes de la fase de razonamiento del modelo de
   lenguaje y se abre un nuevo cursor atómico para la fase de acción.

3. El método de la reivindicación 1, donde durante la fase de simulación se
   interceptan selectivamente los side-effects irreversibles del sistema ERP
   (envío de correo, encola de trabajos asíncronos, llamadas HTTP a servicios
   externos) mientras se permite la ejecución completa de operaciones ORM con
   rollback transaccional.

4. Sistema que implementa el método de las reivindicaciones 1-3, compuesto por:
   un proceso shell del ERP con PID separado del proceso de producción, un motor
   de razonamiento LLM externo, y un plano de control remoto para monitorización
   y gestión.

La solicitud provisional da 12 meses de "patent pending" y fecha de prioridad.
Si hay tracción comercial, se convierte en EPO/PCT completa. Si no, caduca
sin haber gastado 15.000€.

#### 6. Velocidad al mercado (la mejor protección)

| Competidor | Lanzamiento esperado | Mercado |
|---|---|---|
| Odoo SA v20 Agentic AI | Septiembre 2026 | Enterprise only |
| SAP Joule agents | Ya disponible | SAP Enterprise |
| Salesforce Agentforce | Ya disponible | Salesforce CRM |
| **JUMO Pulse + OpenClaw** | **Q2 2026 (piloto Biomag)** | **Community ERP** |

Estar en producción con clientes reales antes de que Odoo SA lance v20 es la
protección más efectiva. Un producto funcionando con testimonios > una patente
pendiente.

#### Resumen de coste total de protección IP

| Acción | Coste | Prioridad |
|---|---|---|
| Prior art (Zenodo + blog) | 0€ | Inmediata |
| Registro marca OpenClaw EUIPO | ~850€ | Alta |
| Cláusula IP en contratos | 0€ | Con primer cliente |
| AGPL módulo / propietario cerebro | 0€ | Al publicar código |
| Provisional patente (opcional) | ~1.500€ | Después de validar piloto |
| **Total mínimo** | **~850€** | |
| **Total con patente provisional** | **~2.350€** | |

## Notas

- El piloto es sobre la instancia 18.0 de migración de Biomag, no producción 15.0
- Las series de facturación (BINV, BRINV) son placeholder — confirmar con Biomag
- Las reglas de auto-approve (< 1.000€) son propuesta — validar con cliente
- `odoo-rpc.py` se desarrolla en paralelo como fallback para clientes sin shell
