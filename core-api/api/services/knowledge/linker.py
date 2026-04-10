"""
Knowledge Linker — links knowledge entities to existing CRM records.

Matches persons to crm_contacts and organizations to crm_companies
by email and name similarity.
"""
import logging
from typing import Dict, Any, List

from lib.supabase_client import get_authenticated_async_client

logger = logging.getLogger(__name__)


async def link_entities_to_crm(
    workspace_id: str,
    user_jwt: str,
) -> Dict[str, int]:
    """
    Match knowledge entities with CRM records:
    - person entities -> crm_contacts (by email, then name)
    - organization entities -> crm_companies (by name, then domain)

    Returns stats on how many links were created.
    """
    supabase = await get_authenticated_async_client(user_jwt)
    linked_contacts = 0
    linked_companies = 0

    # --- Link persons to crm_contacts ---
    unlinked_persons = await (
        supabase.table("knowledge_entities")
        .select("id, name, metadata")
        .eq("workspace_id", workspace_id)
        .eq("entity_type", "person")
        .is_("linked_crm_contact_id", "null")
        .is_("deleted_at", "null")
        .limit(200)
        .execute()
    )

    for person in (unlinked_persons.data or []):
        meta = person.get("metadata") or {}
        email = meta.get("email", "")

        contact = None

        # Try email match
        if email:
            contact_result = await (
                supabase.table("crm_contacts")
                .select("id")
                .eq("workspace_id", workspace_id)
                .ilike("email", email)
                .is_("deleted_at", "null")
                .limit(1)
                .execute()
            )
            if contact_result.data:
                contact = contact_result.data[0]

        # Try name match if no email match
        if not contact and person.get("name"):
            name_result = await (
                supabase.table("crm_contacts")
                .select("id")
                .eq("workspace_id", workspace_id)
                .ilike("name", f"%{person['name']}%")
                .is_("deleted_at", "null")
                .limit(1)
                .execute()
            )
            if name_result.data:
                contact = name_result.data[0]

        if contact:
            await (
                supabase.table("knowledge_entities")
                .update({"linked_crm_contact_id": contact["id"]})
                .eq("id", person["id"])
                .execute()
            )
            linked_contacts += 1

    # --- Link organizations to crm_companies ---
    unlinked_orgs = await (
        supabase.table("knowledge_entities")
        .select("id, name, metadata")
        .eq("workspace_id", workspace_id)
        .eq("entity_type", "organization")
        .is_("linked_crm_company_id", "null")
        .is_("deleted_at", "null")
        .limit(200)
        .execute()
    )

    for org in (unlinked_orgs.data or []):
        meta = org.get("metadata") or {}
        domain = meta.get("domain", "")

        company = None

        # Try domain match
        if domain:
            domain_result = await (
                supabase.table("crm_companies")
                .select("id")
                .eq("workspace_id", workspace_id)
                .ilike("domain", f"%{domain}%")
                .is_("deleted_at", "null")
                .limit(1)
                .execute()
            )
            if domain_result.data:
                company = domain_result.data[0]

        # Try name match
        if not company and org.get("name"):
            name_result = await (
                supabase.table("crm_companies")
                .select("id")
                .eq("workspace_id", workspace_id)
                .ilike("name", f"%{org['name']}%")
                .is_("deleted_at", "null")
                .limit(1)
                .execute()
            )
            if name_result.data:
                company = name_result.data[0]

        if company:
            await (
                supabase.table("knowledge_entities")
                .update({"linked_crm_company_id": company["id"]})
                .eq("id", org["id"])
                .execute()
            )
            linked_companies += 1

    logger.info(
        f"[KNOWLEDGE] CRM linking: {linked_contacts} contacts, "
        f"{linked_companies} companies linked"
    )
    return {"linked_contacts": linked_contacts, "linked_companies": linked_companies}
