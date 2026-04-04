# Multi-Workspace Improvements Design

**Fecha:** 2026-04-04
**Estado:** Validado

## Resumen

Conjunto de mejoras para la plataforma Pulse centradas en multi-workspace, integraciones compartidas, email, y control de acceso por invitación.

---

## 1. Registro solo por invitación

### Decisiones
- Eliminar registro público. Solo login en la landing.
- La landing muestra el producto (lo guay que es) pero sin botón de registro.
- Las cuentas se crean únicamente al aceptar una invitación.

### Cambios

**Supabase Auth:**
- Desactivar signup libre en la configuración de Supabase.

**Backend (`auth.py`):**
- Modificar el endpoint de aceptar invitación por token para soportar creación de cuenta inline.
- Flujo: invitado sin cuenta → formulario nombre + contraseña → crear cuenta + aceptar invitación en un solo paso.
- Invitado con cuenta → login → aceptar invitación directamente.

**Frontend:**
- Landing page: mostrar features, screenshots, valor del producto. Botón de "Iniciar sesión" solamente.
- Eliminar rutas/botones de registro público.
- Nuevo flujo en `/invite/{token}`: detectar si tiene cuenta → login o crear cuenta → aceptar.

---

## 2. Conexiones compartidas entre workspaces (WhatsApp + Email)

### Decisiones
- Las conexiones externas se vinculan al **usuario**, no al workspace.
- Una sola vinculación de WhatsApp/Gmail/Outlook visible en todos los workspaces del usuario.
- No hay bandejas compartidas entre usuarios — cada quien ve solo sus propias cuentas.

### Cambios

**Backend:**
- Queries de `ext_connections`: filtrar solo por `user_id`, eliminar filtro por `workspace_id`.
- Endpoints de email y WhatsApp: servir datos basados en `user_id` sin considerar workspace activo.
- Endpoints de mensajería (WhatsApp): misma instancia de Evolution API accesible desde cualquier workspace.

**Frontend:**
- Mover configuración de "Conectar WhatsApp" / "Conectar Email" a ajustes de perfil de usuario (no de workspace).
- Los módulos de email y WhatsApp muestran los mismos datos independientemente del workspace seleccionado.

---

## 3. UI para múltiples cuentas de email

### Decisiones
- Solo Gmail + Outlook (no IMAP genérico por ahora).
- El backend ya soporta múltiples `ext_connections` por usuario — solo falta UI.

### Cambios

**Frontend:**
- Botón "Añadir cuenta" visible en la sección de email que lanza flujo OAuth.
- Lista de cuentas conectadas con opción de desconectar cada una.
- Selector de cuenta activa o vista unificada (ya existe lógica de `get_email_threads_unified`).

---

## 4. Fix de imágenes y adjuntos en emails

### Problema
- Imágenes inline en el cuerpo del email aparecen rotas (CORS de proveedores).
- Adjuntos no se pueden descargar (falta endpoint funcional).

### Cambios

**Imágenes inline:**
- Reescribir URLs de `<img>` en el HTML del email para pasar por proxy del backend.
- Endpoint: `GET /api/email/image-proxy?url={encoded_url}` — descarga imagen desde proveedor y la sirve.
- Ya existe `image_proxy_url` en config — conectarlo al flujo de renderizado.

**Adjuntos:**
- Nuevo endpoint: `GET /api/email/{email_id}/attachments/{attachment_id}/download`.
- Descarga el adjunto desde Gmail API (`messages.attachments.get`) o Microsoft Graph.
- Sirve al usuario con headers correctos (Content-Type, Content-Disposition).
- UI: lista de adjuntos con icono por tipo, nombre, tamaño y botón de descarga.

---

## 5. Caché de archivos de email con limpieza mensual

### Decisiones
- Correos nuevos (sync): descarga proactiva de imágenes/adjuntos a R2.
- Correos antiguos: descarga bajo demanda al abrir el email.
- Limpieza: cron diario borra archivos con `last_accessed_at` > 30 días.
- Re-apertura: si los archivos fueron limpiados, se re-descargan desde el proveedor.

### Cambios

**Nueva tabla: `email_cached_files`**
```sql
CREATE TABLE email_cached_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  email_external_id TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('inline', 'attachment')),
  original_filename TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_email_cached_files_cleanup ON email_cached_files(last_accessed_at);
```

**Storage en R2:**
```
email-cache/{user_id}/{email_external_id}/inline/{filename}
email-cache/{user_id}/{email_external_id}/attachments/{filename}
```

**Backend:**
- Al abrir email: verificar si archivos existen en caché → servir desde R2 o descargar desde proveedor.
- Actualizar `last_accessed_at` en cada acceso.
- Sync incremental: al recibir correo nuevo, descargar imágenes/adjuntos a R2 proactivamente.

**Cron (`cron.py`):**
- Nuevo job diario: `cleanup-email-cache` — eliminar de R2 + DB los registros con `last_accessed_at` < now() - 30 días.

---

## 6. Workspace JUMO

### Decisiones
- No requiere cambios de código.
- Operativo: crear workspace "JUMO" desde la UI una vez que el sistema de invitaciones esté listo.
- El selector de workspaces (sidebar + chat) lo mostrará automáticamente.

---

## Orden de implementación recomendado

1. **Registro por invitación** — Base de seguridad, bloquea acceso no autorizado.
2. **Conexiones compartidas** — Arquitectura core, afecta a email y WhatsApp.
3. **Fix imágenes + adjuntos** — Funcionalidad rota actual que bloquea uso diario.
4. **Caché de archivos** — Depende del fix de imágenes/adjuntos.
5. **UI múltiples cuentas email** — Mejora incremental sobre lo anterior.
6. **Crear workspace JUMO** — Paso operativo final, sin código.
