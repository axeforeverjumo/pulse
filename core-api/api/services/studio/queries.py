"""
Studio Queries service - CRUD + execution for studio_queries table.
"""
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import time
import logging

from lib.supabase_client import get_authenticated_async_client

logger = logging.getLogger(__name__)


async def get_queries(user_jwt: str, app_id: str) -> List[Dict[str, Any]]:
    """List queries for an app."""
    supabase = await get_authenticated_async_client(user_jwt)
    result = await (
        supabase.table("studio_queries")
        .select("*")
        .eq("app_id", app_id)
        .order("created_at", desc=False)
        .execute()
    )
    return result.data or []


async def create_query(
    user_jwt: str,
    app_id: str,
    name: str,
    query_type: str,
    datasource_id: Optional[str] = None,
    config: Optional[Dict[str, Any]] = None,
    transform: str = "",
    run_on_page_load: bool = True,
    cache_ttl_seconds: int = 0,
) -> Dict[str, Any]:
    """Create a new query."""
    supabase = await get_authenticated_async_client(user_jwt)
    payload = {
        "app_id": app_id,
        "name": name,
        "type": query_type,
        "datasource_id": datasource_id,
        "config": config or {},
        "transform": transform,
        "run_on_page_load": run_on_page_load,
        "cache_ttl_seconds": cache_ttl_seconds,
    }
    result = await (
        supabase.table("studio_queries")
        .insert(payload)
        .execute()
    )
    return result.data[0] if result.data else {}


async def update_query(
    user_jwt: str, query_id: str, updates: Dict[str, Any]
) -> Dict[str, Any]:
    """Update a query."""
    supabase = await get_authenticated_async_client(user_jwt)
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await (
        supabase.table("studio_queries")
        .update(updates)
        .eq("id", query_id)
        .execute()
    )
    return result.data[0] if result.data else {}


async def delete_query(user_jwt: str, query_id: str) -> None:
    """Delete a query."""
    supabase = await get_authenticated_async_client(user_jwt)
    await (
        supabase.table("studio_queries")
        .delete()
        .eq("id", query_id)
        .execute()
    )


async def run_query(user_jwt: str, query_id: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Execute a query against supabase and return results with timing."""
    supabase = await get_authenticated_async_client(user_jwt)

    # Fetch the query definition
    q_result = await (
        supabase.table("studio_queries")
        .select("*")
        .eq("id", query_id)
        .single()
        .execute()
    )
    query_def = q_result.data
    if not query_def:
        raise ValueError("Query not found")

    config = query_def.get("config", {})
    query_type = query_def.get("type", "select")
    merged_params = {**(config.get("params", {})), **(params or {})}

    start = time.time()
    data = []
    count = 0

    if query_type == "select":
        table = config.get("table", "")
        columns = config.get("columns", "*")
        filters = config.get("filters", [])
        order = config.get("order", None)
        limit = config.get("limit", None)

        builder = supabase.table(table).select(columns, count="exact")
        for f in filters:
            col = f.get("column", "")
            op = f.get("op", "eq")
            val = merged_params.get(f.get("param", ""), f.get("value"))
            if op == "eq":
                builder = builder.eq(col, val)
            elif op == "neq":
                builder = builder.neq(col, val)
            elif op == "gt":
                builder = builder.gt(col, val)
            elif op == "gte":
                builder = builder.gte(col, val)
            elif op == "lt":
                builder = builder.lt(col, val)
            elif op == "lte":
                builder = builder.lte(col, val)
            elif op == "like":
                builder = builder.like(col, val)
            elif op == "ilike":
                builder = builder.ilike(col, val)
            elif op == "in":
                builder = builder.in_(col, val)
            elif op == "is":
                builder = builder.is_(col, val)

        if order:
            desc = order.get("desc", False)
            builder = builder.order(order.get("column", "id"), desc=desc)
        if limit:
            builder = builder.limit(limit)

        result = await builder.execute()
        data = result.data or []
        count = result.count if result.count is not None else len(data)

    elif query_type == "insert":
        table = config.get("table", "")
        row = merged_params.get("row", config.get("row", {}))
        result = await supabase.table(table).insert(row).execute()
        data = result.data or []
        count = len(data)

    elif query_type == "update":
        table = config.get("table", "")
        row = merged_params.get("row", config.get("row", {}))
        match_column = config.get("match_column", "id")
        match_value = merged_params.get("match_value", config.get("match_value"))
        result = await supabase.table(table).update(row).eq(match_column, match_value).execute()
        data = result.data or []
        count = len(data)

    elif query_type == "delete":
        table = config.get("table", "")
        match_column = config.get("match_column", "id")
        match_value = merged_params.get("match_value", config.get("match_value"))
        result = await supabase.table(table).delete().eq(match_column, match_value).execute()
        data = result.data or []
        count = len(data)

    elif query_type == "rpc":
        fn_name = config.get("function", "")
        rpc_params = merged_params.get("rpc_params", config.get("rpc_params", {}))
        result = await supabase.rpc(fn_name, rpc_params).execute()
        data = result.data if isinstance(result.data, list) else [result.data] if result.data else []
        count = len(data)

    timing_ms = round((time.time() - start) * 1000, 2)
    return {"data": data, "count": count, "timing_ms": timing_ms}


async def run_query_by_name_public(app_id: str, query_name: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Execute a query by name using service role (for public runtime)."""
    from lib.supabase_client import get_service_role_client

    sb = get_service_role_client()

    # Fetch the query definition
    q_result = sb.table("studio_queries").select("*").eq("app_id", app_id).eq("name", query_name).single().execute()
    query_def = q_result.data
    if not query_def:
        raise ValueError("Query not found")

    config = query_def.get("config", {})
    query_type = query_def.get("type", "select")
    merged_params = {**(config.get("params", {})), **(params or {})}

    start = time.time()
    data = []
    count = 0

    if query_type == "select":
        table = config.get("table", "")
        columns = config.get("columns", "*")
        filters = config.get("filters", [])
        order = config.get("order", None)
        limit = config.get("limit", None)

        builder = sb.table(table).select(columns, count="exact")
        for f in filters:
            col = f.get("column", "")
            op = f.get("op", "eq")
            val = merged_params.get(f.get("param", ""), f.get("value"))
            if op == "eq":
                builder = builder.eq(col, val)
            elif op == "neq":
                builder = builder.neq(col, val)
            elif op == "gt":
                builder = builder.gt(col, val)
            elif op == "gte":
                builder = builder.gte(col, val)
            elif op == "lt":
                builder = builder.lt(col, val)
            elif op == "lte":
                builder = builder.lte(col, val)
            elif op == "like":
                builder = builder.like(col, val)
            elif op == "ilike":
                builder = builder.ilike(col, val)
            elif op == "in":
                builder = builder.in_(col, val)
            elif op == "is":
                builder = builder.is_(col, val)

        if order:
            desc = order.get("desc", False)
            builder = builder.order(order.get("column", "id"), desc=desc)
        if limit:
            builder = builder.limit(limit)

        result = builder.execute()
        data = result.data or []
        count = result.count if result.count is not None else len(data)

    timing_ms = round((time.time() - start) * 1000, 2)
    return {"data": data, "count": count, "timing_ms": timing_ms}
