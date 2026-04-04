# Multi-Workspace Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implementar registro por invitación, conexiones compartidas cross-workspace, fix de email (imágenes/adjuntos), caché con limpieza mensual, y UI de múltiples cuentas.

**Architecture:** Pulse usa FastAPI + Supabase (PostgreSQL con RLS) + React/Zustand + Cloudflare R2. Email ya es user-scoped (ext_connections sin workspace_id). WhatsApp usa external_accounts con workspace_id que hay que eliminar. Las imágenes inline del email necesitan proxy backend. Los adjuntos tienen endpoint pero con posibles bugs.

**Tech Stack:** FastAPI 0.115, Supabase, React 19, Zustand, Cloudflare R2, Evolution API, Gmail API, Microsoft Graph

---

## Task 1: Registro solo por invitación — Backend

**Files:**
- Modify: `core-api/api/routers/auth.py` (endpoint de signup)
- Modify: `core-api/api/services/workspaces/invitations.py` (flujo de aceptación)

**Step 1: Desactivar signup libre en Supabase Dashboard**

Ir a Supabase Dashboard → Authentication → Settings → desactivar "Enable email signup".
El OAuth signup sigue funcionando pero solo se permite cuando viene desde un flujo de invitación.

**Step 2: Añadir validación anti-signup libre en el backend**

En `core-api/api/routers/auth.py`, modificar el endpoint `POST /api/auth/users` (línea ~272) para verificar que el usuario tiene una invitación pendiente:

```python
@router.post("/users", response_model=UserCreateResponse)
async def create_user(
    user: UserCreate,
    current_user_id: str = Depends(get_current_user_id),
    user_jwt: str = Depends(get_current_user_jwt),
):
    # Verify user has a pending invitation before allowing account creation
    supabase = await get_authenticated_async_client(user_jwt)
    
    # Check for pending invitations matching this email
    invitations = await supabase.table('workspace_invitations')\
        .select('id')\
        .eq('email', user.email.lower().strip())\
        .eq('status', 'pending')\
        .limit(1)\
        .execute()
    
    if not invitations.data:
        raise HTTPException(
            status_code=403,
            detail="Registration is by invitation only. Please request an invitation."
        )
    
    # ... rest of existing create_user logic
```

**Step 3: Commit**

```bash
git add core-api/api/routers/auth.py
git commit -m "feat(auth): enforce invitation-only registration"
```

---

## Task 2: Registro solo por invitación — Frontend Landing

**Files:**
- Modify: `core-web/src/components/Landing/LandingPage.tsx`
- Modify: `core-web/src/pages/InviteAcceptPage.tsx`

**Step 1: Modificar LandingPage para quitar signup**

En `core-web/src/components/Landing/LandingPage.tsx`:
- Eliminar cualquier botón/link de "Sign Up" o "Register"
- Mantener solo el botón "Iniciar sesión" / "Sign In" que abre el SignInModal
- La landing debe seguir mostrando el producto: features, screenshots, valor

Buscar y eliminar cualquier referencia a signup/register en el componente. El `SignInModal` (línea ~52) se mantiene ya que es para login.

**Step 2: Actualizar InviteAcceptPage para el flujo de nuevo usuario**

En `core-web/src/pages/InviteAcceptPage.tsx` (línea ~175-189), el estado `needs-auth` ya muestra botones de Google/Microsoft OAuth. Este flujo funciona: el usuario sin cuenta hace OAuth, Supabase crea la auth, y luego nuestro backend crea el user record.

Verificar que el texto en el estado `needs-auth` diga algo como:
```tsx
<p>Crea tu cuenta para unirte al espacio de trabajo</p>
```

En vez de solo "Inicia sesión".

**Step 3: Eliminar rutas de registro público**

Buscar en `core-web/src/App.tsx` o router principal cualquier ruta `/signup`, `/register` y eliminarla. Redirigir a `/` (landing).

**Step 4: Commit**

```bash
git add core-web/src/components/Landing/LandingPage.tsx core-web/src/pages/InviteAcceptPage.tsx
git commit -m "feat(frontend): remove public signup, keep invite-only flow"
```

---

## Task 3: WhatsApp compartido entre workspaces

**Files:**
- Modify: `core-api/api/routers/messaging.py`
- Create: `core-api/supabase/migrations/YYYYMMDD_remove_workspace_from_external_accounts.sql`

**Step 1: Migración para hacer workspace_id opcional en external_accounts**

Crear migración SQL:

```sql
-- Make workspace_id optional in external_accounts
-- WhatsApp/Telegram connections are now user-level, visible in all workspaces
ALTER TABLE external_accounts ALTER COLUMN workspace_id DROP NOT NULL;

-- Update existing RLS policies to allow user access regardless of workspace
DROP POLICY IF EXISTS "Users can view own external accounts" ON external_accounts;
CREATE POLICY "Users can view own external accounts" ON external_accounts
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own external accounts" ON external_accounts;
CREATE POLICY "Users can manage own external accounts" ON external_accounts
    FOR ALL USING (auth.uid() = user_id);
```

**Step 2: Modificar LinkWhatsAppRequest para no requerir workspace_id**

En `core-api/api/routers/messaging.py` (línea ~884):

```python
class LinkWhatsAppRequest(BaseModel):
    workspace_id: Optional[str] = None  # No longer required - connections are user-level
```

**Step 3: Modificar upsert de external_accounts**

En `core-api/api/routers/messaging.py` (línea ~1041-1048), quitar workspace_id del upsert:

```python
await supabase.table("external_accounts").upsert({
    "user_id": user_id,
    "provider": "whatsapp",
    "instance_id": instance_name,
    "instance_name": instance_name,
    "status": "qr_pending",
}, on_conflict="user_id,provider").execute()
```

**Step 4: Modificar get_messaging_unread_summary**

En `core-api/api/routers/messaging.py` (línea ~1371-1419), quitar filtro de workspace_id:

```python
accounts_q = (
    supabase.table("external_accounts")
    .select("id")
    .eq("user_id", user_id)
)
# Remove: if workspace_id: accounts_q = accounts_q.eq("workspace_id", workspace_id)
```

**Step 5: Buscar y eliminar TODOS los filtros workspace_id en messaging.py**

Usar grep para encontrar todos los `.eq("workspace_id"` en messaging.py y eliminarlos de las queries de external_accounts y external_chats.

Run: `grep -n 'workspace_id' core-api/api/routers/messaging.py`

Eliminar cada filtro workspace_id en queries de accounts/chats/messages.

**Step 6: Commit**

```bash
git add core-api/api/routers/messaging.py core-api/supabase/migrations/
git commit -m "feat(messaging): make WhatsApp connections user-level, shared across workspaces"
```

---

## Task 4: Email — Fix imágenes inline (proxy backend)

**Files:**
- Modify: `core-api/api/routers/email.py` (nuevo endpoint proxy)
- Modify: `core-api/api/services/email/get_email_details.py` (reescribir URLs)
- Modify: `core-web/src/utils/sanitizeHtml.ts` (permitir proxy URLs)

**Step 1: Crear endpoint de proxy de imágenes de email**

En `core-api/api/routers/email.py`, añadir:

```python
import httpx
from fastapi.responses import Response
from urllib.parse import unquote

@router.get("/image-proxy")
async def email_image_proxy(
    url: str = Query(..., description="URL de la imagen a proxear"),
    user_id: str = Depends(get_current_user_id),
):
    """Proxy images from email providers to avoid CORS issues."""
    decoded_url = unquote(url)
    
    # Validate URL is from known email providers
    allowed_domains = [
        "googleusercontent.com",
        "google.com", 
        "gstatic.com",
        "outlook.office365.com",
        "outlook.live.com",
        "microsoft.com",
        "office.com",
    ]
    
    from urllib.parse import urlparse
    parsed = urlparse(decoded_url)
    if not any(parsed.hostname and parsed.hostname.endswith(d) for d in allowed_domains):
        # Allow any https URL but log non-standard domains
        if not parsed.scheme == "https":
            raise HTTPException(status_code=400, detail="Only HTTPS URLs allowed")
    
    async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
        try:
            resp = await client.get(decoded_url)
            resp.raise_for_status()
        except httpx.HTTPError:
            raise HTTPException(status_code=502, detail="Failed to fetch image")
    
    content_type = resp.headers.get("content-type", "image/png")
    
    return Response(
        content=resp.content,
        media_type=content_type,
        headers={
            "Cache-Control": "public, max-age=86400",
            "Access-Control-Allow-Origin": "*",
        }
    )
```

**Step 2: Reescribir URLs de imágenes en el HTML del email**

En `core-api/api/services/email/get_email_details.py`, crear función y aplicarla al body HTML:

```python
import re
from urllib.parse import quote

def rewrite_email_image_urls(html: str, base_api_url: str = "/api/email") -> str:
    """Rewrite image src URLs in email HTML to go through our proxy."""
    if not html:
        return html
    
    def replace_src(match):
        full_match = match.group(0)
        url = match.group(1)
        # Skip data: URLs, cid: URLs, and already-proxied URLs
        if url.startswith(('data:', 'cid:', '/api/')):
            return full_match
        encoded_url = quote(url, safe='')
        return f'src="{base_api_url}/image-proxy?url={encoded_url}"'
    
    return re.sub(r'src="(https?://[^"]+)"', replace_src, html)
```

Aplicar en `get_email_details()` (línea ~542-543) y `_format_cached_email()` (línea ~116-125) antes de devolver el body_html:

```python
body_content = body.get('html') or body.get('plain', '')
if '<' in body_content and '>' in body_content:
    body_content = rewrite_email_image_urls(body_content)
```

**Step 3: Manejar imágenes CID (Content-ID)**

Las imágenes con `src="cid:xxx"` son adjuntos inline referenciados por Content-ID. Añadir a `rewrite_email_image_urls()`:

```python
def rewrite_cid_urls(html: str, attachments: list, email_id: str, base_api_url: str = "/api/email") -> str:
    """Replace cid: references with attachment download URLs."""
    if not html or not attachments:
        return html
    
    # Build CID to attachment ID map
    cid_map = {}
    for att in attachments:
        headers = att.get('headers', [])
        for h in headers:
            if h.get('name', '').lower() == 'content-id':
                cid = h['value'].strip('<>')
                cid_map[cid] = att.get('attachmentId', '')
    
    def replace_cid(match):
        cid = match.group(1)
        att_id = cid_map.get(cid)
        if att_id:
            return f'src="{base_api_url}/messages/{email_id}/attachments/{att_id}"'
        return match.group(0)
    
    return re.sub(r'src="cid:([^"]+)"', replace_cid, html)
```

**Step 4: Commit**

```bash
git add core-api/api/routers/email.py core-api/api/services/email/get_email_details.py
git commit -m "feat(email): add image proxy and CID handling for inline images"
```

---

## Task 5: Email — Fix descarga de adjuntos

**Files:**
- Modify: `core-api/api/routers/email.py` (mejorar endpoint de descarga)
- Modify: `core-web/src/components/Email/AttachmentList.tsx` (fix UI)

**Step 1: Verificar y mejorar el endpoint de descarga**

El endpoint `GET /api/email/messages/{email_id}/attachments/{attachment_id}` ya existe (línea ~434-459). Verificar que:

1. Devuelve los datos correctamente decodificados
2. Soporta tanto Gmail (base64url) como Outlook (base64)

En `core-api/api/routers/email.py`, crear un endpoint alternativo que devuelva bytes directos en vez de JSON base64:

```python
@router.get("/messages/{email_id}/attachments/{attachment_id}/download")
async def download_attachment_direct(
    email_id: str,
    attachment_id: str,
    user_id: str = Depends(get_current_user_id),
    user_jwt: str = Depends(get_current_user_jwt),
):
    """Download attachment as direct binary response."""
    result = await get_email_attachment(email_id, attachment_id, user_id, user_jwt)
    
    if not result or 'data' not in result:
        raise HTTPException(status_code=404, detail="Attachment not found")
    
    import base64
    # Gmail uses base64url, Outlook uses standard base64
    data = result['data']
    try:
        content = base64.urlsafe_b64decode(data + '==')
    except Exception:
        content = base64.b64decode(data + '==')
    
    filename = result.get('filename', 'attachment')
    mime_type = result.get('mimeType', 'application/octet-stream')
    
    return Response(
        content=content,
        media_type=mime_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(content)),
        }
    )
```

**Step 2: Actualizar frontend AttachmentList**

En `core-web/src/components/Email/AttachmentList.tsx`, simplificar el download usando el nuevo endpoint directo:

```typescript
const handleDownload = async (attachment: EmailAttachment) => {
  try {
    const url = `/api/email/messages/${emailId}/attachments/${attachment.attachmentId}/download`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${getToken()}` }
    });
    if (!response.ok) throw new Error('Download failed');
    
    const blob = await response.blob();
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = attachment.filename || 'attachment';
    a.click();
    URL.revokeObjectURL(downloadUrl);
  } catch (error) {
    console.error('Failed to download attachment:', error);
  }
};
```

**Step 3: Commit**

```bash
git add core-api/api/routers/email.py core-web/src/components/Email/AttachmentList.tsx
git commit -m "fix(email): add direct download endpoint and fix attachment UI"
```

---

## Task 6: Email — Caché de archivos con limpieza mensual (migración)

**Files:**
- Create: `core-api/supabase/migrations/YYYYMMDD_email_cached_files.sql`

**Step 1: Crear migración para tabla email_cached_files**

```sql
-- Email cached files: stores references to cached email images/attachments in R2
-- Files are proactively downloaded for new emails and on-demand for old ones
-- Cleanup: daily cron deletes files not accessed in 30 days

CREATE TABLE IF NOT EXISTS "public"."email_cached_files" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid NOT NULL,
    "email_external_id" text NOT NULL,
    "ext_connection_id" uuid NOT NULL,
    "r2_key" text NOT NULL,
    "file_type" text NOT NULL CHECK (file_type IN ('inline', 'attachment')),
    "original_filename" text,
    "content_id" text,  -- For CID references in inline images
    "attachment_id" text,  -- Provider attachment ID for re-download
    "mime_type" text,
    "size_bytes" bigint,
    "last_accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT email_cached_files_pkey PRIMARY KEY (id)
);

-- Indexes
CREATE INDEX idx_email_cached_files_cleanup 
    ON email_cached_files (last_accessed_at);
CREATE INDEX idx_email_cached_files_lookup 
    ON email_cached_files (user_id, email_external_id);
CREATE UNIQUE INDEX idx_email_cached_files_unique_r2 
    ON email_cached_files (r2_key);

-- RLS
ALTER TABLE email_cached_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own cached files" ON email_cached_files
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own cached files" ON email_cached_files
    FOR ALL USING (auth.uid() = user_id);

-- Service role needs access for cron cleanup
CREATE POLICY "Service role full access" ON email_cached_files
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
```

**Step 2: Commit**

```bash
git add core-api/supabase/migrations/
git commit -m "feat(email): add email_cached_files table for attachment caching"
```

---

## Task 7: Email — Servicio de caché de archivos

**Files:**
- Create: `core-api/api/services/email/file_cache.py`

**Step 1: Crear servicio de caché**

```python
"""Email file caching service.

Downloads and caches email images/attachments in R2.
- New emails: proactive download during sync
- Old emails: on-demand download when opened
- Cleanup: daily cron deletes files not accessed in 30 days
"""

import base64
import logging
from typing import Optional
from datetime import datetime, timezone

from lib.r2_client import R2Client
from api.config import get_settings

logger = logging.getLogger(__name__)

CACHE_PREFIX = "email-cache"
CACHE_MAX_AGE_DAYS = 30


async def get_or_download_attachment(
    user_id: str,
    email_external_id: str,
    attachment_id: str,
    ext_connection_id: str,
    filename: str,
    mime_type: str,
    user_jwt: str,
    supabase_client,
) -> Optional[dict]:
    """Get cached attachment or download from provider and cache it.
    
    Returns dict with r2_key, presigned_url, mime_type, size_bytes.
    """
    # Check cache first
    cached = await supabase_client.table('email_cached_files')\
        .select('id, r2_key, mime_type, size_bytes')\
        .eq('user_id', user_id)\
        .eq('email_external_id', email_external_id)\
        .eq('attachment_id', attachment_id)\
        .eq('file_type', 'attachment')\
        .limit(1)\
        .execute()
    
    if cached.data:
        # Update last_accessed_at
        await supabase_client.table('email_cached_files')\
            .update({'last_accessed_at': datetime.now(timezone.utc).isoformat()})\
            .eq('id', cached.data[0]['id'])\
            .execute()
        
        r2 = R2Client()
        url = r2.get_presigned_url(cached.data[0]['r2_key'])
        return {
            'r2_key': cached.data[0]['r2_key'],
            'url': url,
            'mime_type': cached.data[0]['mime_type'],
            'size_bytes': cached.data[0]['size_bytes'],
        }
    
    # Not cached - download from provider
    from api.services.email.get_email_details import get_email_attachment
    result = await get_email_attachment(
        email_external_id, attachment_id, user_id, user_jwt
    )
    
    if not result or 'data' not in result:
        return None
    
    # Decode base64
    data = result['data']
    try:
        content = base64.urlsafe_b64decode(data + '==')
    except Exception:
        content = base64.b64decode(data + '==')
    
    # Upload to R2
    r2 = R2Client()
    safe_filename = filename or f"{attachment_id}.bin"
    r2_key = f"{CACHE_PREFIX}/{user_id}/{email_external_id}/attachments/{safe_filename}"
    
    import io
    r2.s3_client.upload_fileobj(
        io.BytesIO(content),
        r2.bucket_name,
        r2_key,
        ExtraArgs={'ContentType': mime_type or 'application/octet-stream'}
    )
    
    size_bytes = len(content)
    
    # Save cache record
    await supabase_client.table('email_cached_files').insert({
        'user_id': user_id,
        'email_external_id': email_external_id,
        'ext_connection_id': ext_connection_id,
        'r2_key': r2_key,
        'file_type': 'attachment',
        'original_filename': filename,
        'attachment_id': attachment_id,
        'mime_type': mime_type,
        'size_bytes': size_bytes,
    }).execute()
    
    url = r2.get_presigned_url(r2_key)
    return {
        'r2_key': r2_key,
        'url': url,
        'mime_type': mime_type,
        'size_bytes': size_bytes,
    }


async def cache_inline_image(
    user_id: str,
    email_external_id: str,
    ext_connection_id: str,
    image_url: str,
    content_id: Optional[str],
    supabase_client,
) -> Optional[str]:
    """Download and cache an inline email image. Returns R2 key."""
    import httpx
    import hashlib
    
    url_hash = hashlib.md5(image_url.encode()).hexdigest()[:12]
    r2_key = f"{CACHE_PREFIX}/{user_id}/{email_external_id}/inline/{url_hash}"
    
    # Check if already cached
    cached = await supabase_client.table('email_cached_files')\
        .select('id, r2_key')\
        .eq('r2_key', r2_key)\
        .limit(1)\
        .execute()
    
    if cached.data:
        await supabase_client.table('email_cached_files')\
            .update({'last_accessed_at': datetime.now(timezone.utc).isoformat()})\
            .eq('id', cached.data[0]['id'])\
            .execute()
        return r2_key
    
    # Download image
    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
        try:
            resp = await client.get(image_url)
            resp.raise_for_status()
        except httpx.HTTPError:
            logger.warning(f"Failed to cache inline image: {image_url}")
            return None
    
    mime_type = resp.headers.get('content-type', 'image/png')
    content = resp.content
    
    # Upload to R2
    import io
    r2 = R2Client()
    r2.s3_client.upload_fileobj(
        io.BytesIO(content),
        r2.bucket_name,
        r2_key,
        ExtraArgs={'ContentType': mime_type}
    )
    
    # Save cache record
    await supabase_client.table('email_cached_files').insert({
        'user_id': user_id,
        'email_external_id': email_external_id,
        'ext_connection_id': ext_connection_id,
        'r2_key': r2_key,
        'file_type': 'inline',
        'content_id': content_id,
        'mime_type': mime_type,
        'size_bytes': len(content),
    }).execute()
    
    return r2_key


async def cleanup_expired_cache(supabase_service_client) -> dict:
    """Delete cached files older than CACHE_MAX_AGE_DAYS. Called by daily cron."""
    from datetime import timedelta
    
    cutoff = (datetime.now(timezone.utc) - timedelta(days=CACHE_MAX_AGE_DAYS)).isoformat()
    
    # Get expired records
    expired = await supabase_service_client.table('email_cached_files')\
        .select('id, r2_key')\
        .lt('last_accessed_at', cutoff)\
        .limit(500)\
        .execute()
    
    if not expired.data:
        return {'deleted': 0}
    
    r2 = R2Client()
    deleted = 0
    
    for record in expired.data:
        try:
            r2.delete_file(record['r2_key'])
        except Exception as e:
            logger.warning(f"Failed to delete R2 key {record['r2_key']}: {e}")
        
        await supabase_service_client.table('email_cached_files')\
            .delete()\
            .eq('id', record['id'])\
            .execute()
        deleted += 1
    
    return {'deleted': deleted}
```

**Step 2: Commit**

```bash
git add core-api/api/services/email/file_cache.py
git commit -m "feat(email): add file cache service for email images and attachments"
```

---

## Task 8: Email — Cron de limpieza de caché

**Files:**
- Modify: `core-api/api/routers/cron.py`

**Step 1: Añadir cron job de limpieza**

En `core-api/api/routers/cron.py`, añadir el nuevo endpoint:

```python
@router.get("/cleanup-email-cache")
async def cleanup_email_cache():
    """Daily cleanup of email cached files not accessed in 30 days."""
    try:
        from api.services.email.file_cache import cleanup_expired_cache
        from lib.supabase_client import get_service_role_client
        
        supabase = await get_service_role_client()
        result = await cleanup_expired_cache(supabase)
        
        return {
            "status": "ok",
            "deleted_files": result['deleted'],
        }
    except Exception as e:
        logger.error(f"Email cache cleanup failed: {e}")
        return {"status": "error", "error": str(e)}
```

Añadir este job al schedule del cron (si hay un archivo de configuración de schedule, o documentar que debe ejecutarse daily a las 3am):

```
# Add to cron schedule:
# Daily 3am: /api/cron/cleanup-email-cache
```

**Step 2: Commit**

```bash
git add core-api/api/routers/cron.py
git commit -m "feat(email): add daily cron for email cache cleanup"
```

---

## Task 9: Email — Caché proactivo en sync incremental

**Files:**
- Modify: `core-api/api/services/email/fetch_emails.py` (o el servicio de sync incremental)

**Step 1: Identificar dónde se procesan emails nuevos en sync**

Buscar el endpoint de sync incremental en cron.py (`/api/cron/incremental-sync`). Encontrar la función que procesa emails nuevos entrantes.

**Step 2: Añadir descarga proactiva de imágenes/adjuntos**

Después de insertar un email nuevo en la DB durante el sync, añadir:

```python
# After inserting new email to DB
if email_data.get('has_attachments') or '<img' in (email_data.get('body') or ''):
    try:
        from api.services.email.file_cache import cache_inline_image, get_or_download_attachment
        
        # Cache attachments
        for att in email_data.get('attachments', []):
            await get_or_download_attachment(
                user_id=user_id,
                email_external_id=email_data['external_id'],
                attachment_id=att['attachmentId'],
                ext_connection_id=connection_id,
                filename=att.get('filename', ''),
                mime_type=att.get('mimeType', ''),
                user_jwt=user_jwt,
                supabase_client=supabase,
            )
    except Exception as e:
        logger.warning(f"Proactive cache failed for email {email_data.get('external_id')}: {e}")
        # Non-blocking - email sync continues even if caching fails
```

**Step 3: Commit**

```bash
git add core-api/api/services/email/
git commit -m "feat(email): proactive caching of attachments during incremental sync"
```

---

## Task 10: UI — Hacer más visible el botón de añadir cuenta de email

**Files:**
- Modify: `core-web/src/components/Settings/SettingsView.tsx`
- Modify: `core-web/src/components/Email/` (componente principal de email)

**Step 1: Añadir acceso rápido a "Añadir cuenta" desde la vista de email**

El botón "Add another account" ya existe en Settings (línea ~432-442) pero no es visible desde la vista principal de email. Añadir un shortcut:

En el componente principal de email (buscar en `core-web/src/components/Email/`), añadir un botón o link "Añadir cuenta" junto al selector de cuentas, que lleve a Settings o abra un modal.

```tsx
// In the email account selector area
{emailAccounts.length < 5 && (
  <button
    onClick={() => navigateToSettings('email-accounts')}
    className="text-sm text-blue-500 hover:text-blue-600 flex items-center gap-1"
  >
    <PlusIcon className="w-4 h-4" />
    Añadir cuenta
  </button>
)}
```

**Step 2: Commit**

```bash
git add core-web/src/components/Email/ core-web/src/components/Settings/SettingsView.tsx
git commit -m "feat(email): add shortcut to connect new email account from email view"
```

---

## Resumen de Tasks

| Task | Descripción | Dependencias |
|------|-------------|-------------|
| 1 | Registro por invitación — Backend | Ninguna |
| 2 | Registro por invitación — Frontend Landing | Task 1 |
| 3 | WhatsApp compartido entre workspaces | Ninguna |
| 4 | Fix imágenes inline (proxy backend) | Ninguna |
| 5 | Fix descarga de adjuntos | Ninguna |
| 6 | Migración tabla email_cached_files | Ninguna |
| 7 | Servicio de caché de archivos | Task 6 |
| 8 | Cron de limpieza de caché | Task 7 |
| 9 | Caché proactivo en sync | Task 7 |
| 10 | UI botón añadir cuenta email | Ninguna |

**Tareas paralelas posibles:**
- Wave 1: Tasks 1, 3, 4, 5, 6, 10 (todas independientes)
- Wave 2: Tasks 2, 7 (dependen de wave 1)
- Wave 3: Tasks 8, 9 (dependen de task 7)
