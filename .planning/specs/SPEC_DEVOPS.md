# SPEC: DevOps
> Estado: COMPLETO | Última revisión: 2026-04-06
> Implementado: 2026-04-05 a 2026-04-06

---

## 1. DESCRIPCION

Modulo de gestion de infraestructura para equipos de desarrollo. Permite a los workspaces registrar servidores de produccion, gestionar claves SSH para deploy, y almacenar tokens de repositorios (GitHub, GitLab, Bitbucket). Es la base para el sistema de deploy automatico del modulo Projects.

---

## 2. MODELOS DE DATOS

### `workspace_servers`
```
id (UUID), workspace_id
name (str)
host (str), port (int, default 22), username (str, default 'root')
auth_type: ssh_key | password | both
ssh_private_key_encrypted (Fernet), password_encrypted (Fernet)
wildcard_domain (str, opcional)
status: pending | verified | failed | offline
last_verified_at (timestamp), verification_details (JSONB)
is_default (bool)
created_by, created_at, updated_at
```

**`verification_details` JSONB schema:**
```json
{
  "checked_at": "ISO timestamp",
  "os": "Ubuntu 24.04 LTS",
  "docker_installed": true,
  "docker_version": "Docker version 26.x",
  "nginx_installed": true,
  "nginx_version": "nginx/1.24.0",
  "disk_total_gb": 200,
  "disk_used_gb": 45,
  "disk_free_gb": 155,
  "ram_total_mb": 128000,
  "ram_available_mb": 100000,
  "error": null
}
```

### `workspace_ssh_keys`
```
id (UUID), workspace_id
name (str, default 'pulse-deploy')
public_key (text — RSA-4096 OpenSSH format)
private_key_encrypted (Fernet)
fingerprint (str)
created_by, created_at
```

### `repo_tokens`
```
id (UUID), workspace_id
name (str)
provider: github | gitlab | bitbucket
token_encrypted (Fernet), username (str, opcional)
is_default (bool)
created_by, created_at, updated_at
```

---

## 3. ENDPOINTS API

**Base router:** `/api/servers`

### Servers
| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| GET | `/api/servers?workspace_id={id}` | Listar servidores del workspace |
| POST | `/api/servers` | Registrar servidor (SSH key o password) |
| PATCH | `/api/servers/{server_id}` | Actualizar configuracion |
| DELETE | `/api/servers/{server_id}` | Eliminar servidor |
| POST | `/api/servers/{server_id}/verify` | Verificar conectividad + software instalado |

**Body POST/PATCH server:**
```json
{
  "workspace_id": "uuid",
  "name": "produccion-01",
  "host": "85.215.105.45",
  "port": 22,
  "username": "root",
  "auth_type": "ssh_key",
  "ssh_private_key": "-----BEGIN...",
  "password": null,
  "wildcard_domain": "*.ejemplo.com",
  "is_default": false
}
```

### SSH Keys
| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| GET | `/api/servers/ssh-keys?workspace_id={id}` | Listar claves SSH |
| POST | `/api/servers/ssh-keys/generate` | Generar par RSA-4096 (clave privada nunca sale de DB) |
| GET | `/api/servers/ssh-keys/{key_id}/public` | Obtener clave publica (para pegar en `authorized_keys`) |
| DELETE | `/api/servers/ssh-keys/{key_id}` | Eliminar clave |

**Body generate:**
```json
{ "workspace_id": "uuid", "name": "pulse-deploy" }
```

### Repo Tokens
| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| GET | `/api/servers/tokens?workspace_id={id}` | Listar tokens |
| POST | `/api/servers/tokens` | Registrar token |
| PATCH | `/api/servers/tokens/{token_id}` | Actualizar nombre / username / is_default |
| DELETE | `/api/servers/tokens/{token_id}` | Eliminar |
| GET | `/api/servers/tokens/{token_id}/value` | Obtener token decriptado (uso interno — sin exponer en UI) |

---

## 4. LOGICA DE VERIFICACION

`POST /api/servers/{server_id}/verify` ejecuta:

1. Carga credenciales del servidor desde DB (decripta Fernet)
2. Fallback: si el servidor no tiene clave propia, usa la ultima `workspace_ssh_keys` del workspace
3. Conecta via **system `ssh` binary** (subprocess, no asyncssh) con timeout 15s
4. Ejecuta script multi-seccion: OS, Docker version, nginx version, disk `df -BG /`, RAM `free -m`
5. Parsea output y guarda en `verification_details` JSONB
6. Actualiza `status` → `verified` o `failed` + `last_verified_at`

**Software detectado:** OS, Docker, nginx. Campos preparados para git, certbot (no implementado en parser aun).

---

## 5. SEGURIDAD

- Claves SSH privadas y passwords cifrados con **Fernet** (clave: env `TOKEN_ENCRYPTION_KEY`)
- La clave privada generada nunca se expone en ningun endpoint — solo la publica via `/public`
- Tokens de repo cifrados con el mismo mecanismo Fernet
- Endpoint `/tokens/{id}/value` marcado como interno (sin exponer al usuario en UI)
- Cifrado: libreria `cryptography==44.0.0`

---

## 6. RELACION CON PROJECTS

Los servers se usan en el modulo Projects para deploy automatico:

- `project_boards.deploy_server_id` → FK a `workspace_servers`
- `project_boards.deploy_mode`: `local | external | dedicated`
- `project_boards.wildcard_domain` / `deploy_subdomain` — para crear subdominios via nginx
- `deploy_manager.py` en `core-api/api/services/projects/` usa las credenciales del server para SSH deploy

---

## 7. COMPONENTES FRONTEND

```
core-web/src/components/DevOps/
  DevOpsView.tsx    -- Vista principal con 4 tabs
```

### Tabs en DevOpsView
| Tab | Contenido |
|-----|-----------|
| **Servers** | Lista de servidores con badge de status (pending/verified/failed), boton Verify, agregar, eliminar |
| **SSH Keys** | Lista de claves, boton Generate, copiar/descargar clave publica, eliminar |
| **Tokens** | Lista de tokens con provider badge, agregar, editar nombre/username, eliminar |
| **Overview** | Estadisticas generales (pendiente — datos reales no implementados) |

---

## 8. MIGRACIONES SUPABASE

```
supabase/migrations/
  20260406000001_server_management.sql   -- workspace_servers + workspace_ssh_keys
  20260406000003_devops_tokens.sql       -- repo_tokens
  20260406000002_project_deploy_modes.sql -- deploy_mode en project_boards (relacionado)
```

---

## 9. ARCHIVOS CLAVE

```
core-api/api/routers/servers.py
core-api/api/services/servers/
  manager.py      -- CRUD servers + SSH verify (subprocess)
  ssh_keys.py     -- Generacion RSA-4096 + CRUD claves
  tokens.py       -- CRUD repo tokens

core-web/src/components/DevOps/
  DevOpsView.tsx  -- UI completa (Servers, SSH Keys, Tokens, Overview tabs)

supabase/migrations/
  20260406000001_server_management.sql
  20260406000003_devops_tokens.sql
```

---

## 10. ESTADO

### Completo
- CRUD servers con verificacion SSH real (subprocess)
- SSH key generation RSA-4096 + almacenamiento seguro
- Descarga / copia de clave publica
- Repo tokens (GitHub/GitLab/Bitbucket) con cifrado Fernet
- Wildcard domain support en servers
- Integracion con project_boards (deploy_server_id)
- UI completa con 4 tabs

### Pendiente
- Overview tab con metricas reales del servidor
- Logs de verificacion historicos en UI
- Deteccion de mas software (git, certbot, node, python)
- Multi-server deploy para un mismo proyecto
- Notificacion cuando un servidor pasa a estado offline
