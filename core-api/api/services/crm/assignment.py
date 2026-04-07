"""
CRM Assignment Rules service - automatic owner assignment for new entities.

Evaluates rules in priority order and assigns the first matching rule's owner.
"""
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import logging

from lib.supabase_client import get_authenticated_async_client

logger = logging.getLogger(__name__)


async def get_assignment_rules(
    workspace_id: str,
    user_jwt: str,
    entity_type: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Get active assignment rules for a workspace."""
    supabase = await get_authenticated_async_client(user_jwt)
    query = (
        supabase.table("crm_assignment_rules")
        .select("*")
        .eq("workspace_id", workspace_id)
        .eq("is_active", True)
        .order("priority", desc=False)
    )
    if entity_type:
        query = query.or_(f"entity_type.eq.{entity_type},entity_type.eq.both")

    result = await query.execute()
    return result.data or []


async def apply_assignment_rules(
    workspace_id: str,
    entity_type: str,
    entity_data: Dict[str, Any],
    user_jwt: str,
) -> Optional[str]:
    """
    Evaluate assignment rules against entity data and return the owner_id to assign.
    Returns None if no rules match.

    Condition format: [{"field": "tags", "op": "contains", "value": "enterprise"}, ...]
    All conditions in a rule must match (AND logic).
    """
    rules = await get_assignment_rules(workspace_id, user_jwt, entity_type)

    for rule in rules:
        conditions = rule.get("conditions", [])
        if not conditions:
            continue

        all_match = True
        for cond in conditions:
            field = cond.get("field", "")
            op = cond.get("op", "")
            expected = cond.get("value", "")
            actual = entity_data.get(field)

            if not _evaluate_condition(actual, op, expected):
                all_match = False
                break

        if all_match:
            logger.info(f"Assignment rule '{rule.get('name')}' matched for {entity_type}")
            return rule["assign_to"]

    return None


async def create_assignment_rule(
    workspace_id: str,
    user_id: str,
    user_jwt: str,
    data: Dict[str, Any],
) -> Dict[str, Any]:
    """Create a new assignment rule."""
    supabase = await get_authenticated_async_client(user_jwt)
    now = datetime.now(timezone.utc).isoformat()

    record = {
        "workspace_id": workspace_id,
        "name": data["name"],
        "description": data.get("description"),
        "conditions": data.get("conditions", []),
        "assign_to": data["assign_to"],
        "entity_type": data.get("entity_type", "opportunity"),
        "is_active": data.get("is_active", True),
        "priority": data.get("priority", 0),
        "created_by": user_id,
        "created_at": now,
        "updated_at": now,
    }

    result = await (
        supabase.table("crm_assignment_rules")
        .insert(record)
        .execute()
    )
    return result.data[0]


async def update_assignment_rule(
    rule_id: str,
    user_jwt: str,
    data: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Update an assignment rule."""
    supabase = await get_authenticated_async_client(user_jwt)
    data["updated_at"] = datetime.now(timezone.utc).isoformat()

    for key in ("id", "workspace_id", "created_by", "created_at"):
        data.pop(key, None)

    result = await (
        supabase.table("crm_assignment_rules")
        .update(data)
        .eq("id", rule_id)
        .execute()
    )
    return result.data[0] if result.data else None


async def delete_assignment_rule(
    rule_id: str,
    user_jwt: str,
) -> bool:
    """Delete an assignment rule."""
    supabase = await get_authenticated_async_client(user_jwt)
    result = await (
        supabase.table("crm_assignment_rules")
        .delete()
        .eq("id", rule_id)
        .execute()
    )
    return bool(result.data)


def _evaluate_condition(actual: Any, op: str, expected: Any) -> bool:
    """Evaluate a single condition."""
    if actual is None:
        return op == "is_empty"

    if op == "eq":
        return str(actual).lower() == str(expected).lower()
    elif op == "neq":
        return str(actual).lower() != str(expected).lower()
    elif op == "contains":
        if isinstance(actual, list):
            return expected in actual
        return str(expected).lower() in str(actual).lower()
    elif op == "not_contains":
        if isinstance(actual, list):
            return expected not in actual
        return str(expected).lower() not in str(actual).lower()
    elif op == "starts_with":
        return str(actual).lower().startswith(str(expected).lower())
    elif op == "is_empty":
        return not actual or (isinstance(actual, list) and len(actual) == 0)
    elif op == "is_not_empty":
        return bool(actual) and (not isinstance(actual, list) or len(actual) > 0)
    elif op == "gt":
        try:
            return float(actual) > float(expected)
        except (ValueError, TypeError):
            return False
    elif op == "lt":
        try:
            return float(actual) < float(expected)
        except (ValueError, TypeError):
            return False

    return False
