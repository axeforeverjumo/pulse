"""
CRM Lead Capture Forms service - public forms that create contacts and opportunities.
"""
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import logging
import re

from lib.supabase_client import get_authenticated_async_client, get_async_service_role_client

logger = logging.getLogger(__name__)


async def list_forms(
    workspace_id: str,
    user_jwt: str,
) -> Dict[str, Any]:
    """List all forms for a workspace."""
    supabase = await get_authenticated_async_client(user_jwt)
    result = await (
        supabase.table("crm_forms")
        .select("*")
        .eq("workspace_id", workspace_id)
        .order("created_at", desc=True)
        .execute()
    )
    return {"forms": result.data or []}


async def get_form(
    form_id: str,
    user_jwt: str,
) -> Optional[Dict[str, Any]]:
    """Get a form with submission count."""
    supabase = await get_authenticated_async_client(user_jwt)
    result = await (
        supabase.table("crm_forms")
        .select("*")
        .eq("id", form_id)
        .maybe_single()
        .execute()
    )
    return result.data


async def create_form(
    workspace_id: str,
    user_id: str,
    user_jwt: str,
    data: Dict[str, Any],
) -> Dict[str, Any]:
    """Create a new lead capture form."""
    supabase = await get_authenticated_async_client(user_jwt)
    now = datetime.now(timezone.utc).isoformat()

    # Generate slug from name
    slug = data.get("slug") or _slugify(data["name"])

    result = await (
        supabase.table("crm_forms")
        .insert({
            "workspace_id": workspace_id,
            "name": data["name"],
            "slug": slug,
            "description": data.get("description"),
            "fields": data.get("fields", [
                {"name": "nombre", "type": "text", "label": "Nombre", "required": True},
                {"name": "email", "type": "email", "label": "Email", "required": True},
                {"name": "telefono", "type": "tel", "label": "Teléfono", "required": False},
                {"name": "mensaje", "type": "textarea", "label": "Mensaje", "required": False},
            ]),
            "thank_you_message": data.get("thank_you_message", "Gracias por tu interés. Nos pondremos en contacto contigo pronto."),
            "redirect_url": data.get("redirect_url"),
            "assign_to": data.get("assign_to"),
            "tags": data.get("tags", []),
            "create_opportunity": data.get("create_opportunity", True),
            "default_stage": data.get("default_stage", "lead"),
            "is_published": data.get("is_published", False),
            "created_by": user_id,
            "created_at": now,
            "updated_at": now,
        })
        .execute()
    )
    return result.data[0]


async def update_form(
    form_id: str,
    user_jwt: str,
    data: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Update a form."""
    supabase = await get_authenticated_async_client(user_jwt)
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    for key in ("id", "workspace_id", "created_by", "created_at"):
        data.pop(key, None)

    result = await (
        supabase.table("crm_forms")
        .update(data)
        .eq("id", form_id)
        .execute()
    )
    return result.data[0] if result.data else None


async def delete_form(
    form_id: str,
    user_jwt: str,
) -> bool:
    """Delete a form."""
    supabase = await get_authenticated_async_client(user_jwt)
    result = await (
        supabase.table("crm_forms")
        .delete()
        .eq("id", form_id)
        .execute()
    )
    return bool(result.data)


async def get_form_submissions(
    form_id: str,
    user_jwt: str,
    limit: int = 50,
) -> Dict[str, Any]:
    """Get submissions for a form."""
    supabase = await get_authenticated_async_client(user_jwt)
    result = await (
        supabase.table("crm_form_submissions")
        .select("*", count="exact")
        .eq("form_id", form_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return {"submissions": result.data or [], "count": result.count or 0}


async def submit_form(
    workspace_id: str,
    slug: str,
    data: Dict[str, Any],
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Process a public form submission. Uses service role (no auth needed).
    Creates contact + optionally opportunity + triggers workflows.
    """
    supabase = await get_async_service_role_client()
    now = datetime.now(timezone.utc).isoformat()

    # Get form config
    form_result = await (
        supabase.table("crm_forms")
        .select("*")
        .eq("workspace_id", workspace_id)
        .eq("slug", slug)
        .eq("is_published", True)
        .maybe_single()
        .execute()
    )
    form = form_result.data
    if not form:
        return {"error": "Form not found or not published"}

    # Extract contact fields from submission data
    email = data.get("email")
    nombre = data.get("nombre") or data.get("name") or ""
    telefono = data.get("telefono") or data.get("phone") or ""

    # Split name
    parts = nombre.strip().split(" ", 1)
    first_name = parts[0] if parts else ""
    last_name = parts[1] if len(parts) > 1 else ""

    # Create or find contact
    contact_id = None
    if email:
        existing = await (
            supabase.table("crm_contacts")
            .select("id")
            .eq("workspace_id", workspace_id)
            .eq("email", email)
            .is_("deleted_at", "null")
            .maybe_single()
            .execute()
        )
        if existing.data:
            contact_id = existing.data["id"]
        else:
            contact_record = {
                "workspace_id": workspace_id,
                "first_name": first_name,
                "last_name": last_name,
                "email": email,
                "phone": telefono or None,
                "source": "import",
                "tags": form.get("tags", []),
                "owner_id": form.get("assign_to"),
                "created_at": now,
                "updated_at": now,
            }
            contact_record = {k: v for k, v in contact_record.items() if v is not None}
            contact_result = await (
                supabase.table("crm_contacts")
                .insert(contact_record)
                .execute()
            )
            if contact_result.data:
                contact_id = contact_result.data[0]["id"]

    # Create opportunity if configured
    opportunity_id = None
    if form.get("create_opportunity") and contact_id:
        opp_name = f"Lead: {nombre or email}" if (nombre or email) else f"Form: {form['name']}"
        opp_result = await (
            supabase.table("crm_opportunities")
            .insert({
                "workspace_id": workspace_id,
                "name": opp_name,
                "stage": form.get("default_stage", "lead"),
                "contact_id": contact_id,
                "owner_id": form.get("assign_to"),
                "description": f"Lead capturado desde formulario '{form['name']}'",
                "created_at": now,
                "updated_at": now,
            })
            .execute()
        )
        if opp_result.data:
            opportunity_id = opp_result.data[0]["id"]

    # Save submission
    await (
        supabase.table("crm_form_submissions")
        .insert({
            "form_id": form["id"],
            "workspace_id": workspace_id,
            "data": data,
            "contact_id": contact_id,
            "opportunity_id": opportunity_id,
            "ip_address": ip_address,
            "user_agent": user_agent,
        })
        .execute()
    )

    # Increment submission count
    await (
        supabase.table("crm_forms")
        .update({"submission_count": (form.get("submission_count", 0) or 0) + 1})
        .eq("id", form["id"])
        .execute()
    )

    return {
        "success": True,
        "thank_you_message": form.get("thank_you_message"),
        "redirect_url": form.get("redirect_url"),
    }


def _slugify(text: str) -> str:
    """Generate a URL-safe slug from text."""
    slug = text.lower().strip()
    slug = re.sub(r'[áàäâ]', 'a', slug)
    slug = re.sub(r'[éèëê]', 'e', slug)
    slug = re.sub(r'[íìïî]', 'i', slug)
    slug = re.sub(r'[óòöô]', 'o', slug)
    slug = re.sub(r'[úùüû]', 'u', slug)
    slug = re.sub(r'[ñ]', 'n', slug)
    slug = re.sub(r'[^a-z0-9]+', '-', slug)
    slug = slug.strip('-')
    return slug[:50]
