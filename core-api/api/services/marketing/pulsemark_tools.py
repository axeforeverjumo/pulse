"""
PulseMark agent tools — all functions the agent can execute via OpenAI function calling.

Three tiers:
- READ (auto): safe read-only queries
- WRITE (confirm): mutations on tasks, GTM, GSC
- CODE (confirm + staging): repo edits and deploys
"""
import logging
from typing import Dict, Any, List, Optional

from lib.supabase_client import get_service_role_client, get_authenticated_async_client

logger = logging.getLogger(__name__)


# ============================================================================
# OpenAI function definitions
# ============================================================================

PULSEMARK_TOOLS_SCHEMA = [
    # ----- READ -----
    {
        "type": "function",
        "function": {
            "name": "get_site_info",
            "description": "Get current marketing site info: domain, URL, GA4/GSC configured, repo, server, last audit score",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_seo_audit_latest",
            "description": "Get the latest SEO audit with all issues (critical, warning, info) and affected URLs",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_seo_audit",
            "description": "Run a new SEO crawl audit on the site. Analyzes meta tags, headings, canonical, images, schema, sitemap. Takes 10-30 seconds.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_pagespeed",
            "description": "Get PageSpeed Insights scores (performance, SEO, accessibility, best practices) and Core Web Vitals",
            "parameters": {
                "type": "object",
                "properties": {
                    "strategy": {"type": "string", "enum": ["mobile", "desktop"], "default": "mobile"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_keywords",
            "description": "List top organic keywords from Search Console with clicks, impressions, CTR, position",
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {"type": "integer", "default": 20},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_search_performance",
            "description": "Get Search Console performance totals: clicks, impressions, avg CTR, avg position for last 28 days",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_ga4_overview",
            "description": "Get Google Analytics 4 overview: sessions, users, pageviews, bounce rate, avg session duration",
            "parameters": {
                "type": "object",
                "properties": {
                    "date_range": {"type": "string", "enum": ["7daysAgo", "28daysAgo", "90daysAgo"], "default": "28daysAgo"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_gtm_accounts",
            "description": "List Google Tag Manager accounts the user has access to",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_gtm_containers",
            "description": "List GTM containers in an account",
            "parameters": {
                "type": "object",
                "properties": {"account_id": {"type": "string"}},
                "required": ["account_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_gtm_tags",
            "description": "List all tags in a GTM container workspace",
            "parameters": {
                "type": "object",
                "properties": {
                    "account_id": {"type": "string"},
                    "container_id": {"type": "string"},
                },
                "required": ["account_id", "container_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_marketing_tasks",
            "description": "List marketing tasks (routine + concrete) for the current site. Filters by status and type.",
            "parameters": {
                "type": "object",
                "properties": {
                    "task_type": {"type": "string", "enum": ["concrete", "routine"]},
                    "status": {"type": "string", "enum": ["todo", "in_progress", "review", "done"]},
                },
                "required": [],
            },
        },
    },
    # ----- WRITE (require confirmation) -----
    {
        "type": "function",
        "function": {
            "name": "create_marketing_task",
            "description": "Create a new marketing task. Use 'routine' for recurring tasks, 'concrete' for one-off work.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "description": {"type": "string"},
                    "task_type": {"type": "string", "enum": ["concrete", "routine"]},
                    "category": {"type": "string", "enum": ["seo", "analytics", "content", "ads", "social", "technical"]},
                    "priority": {"type": "integer", "minimum": 0, "maximum": 4},
                    "routine_label": {"type": "string", "description": "Diario/Semanal/Mensual — required if task_type=routine"},
                    "assign_to_me": {"type": "boolean", "description": "If true, PulseMark takes ownership of the task"},
                },
                "required": ["title", "task_type"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_marketing_task",
            "description": "Update a task's status, priority, description, or mark it as done",
            "parameters": {
                "type": "object",
                "properties": {
                    "task_id": {"type": "string"},
                    "status": {"type": "string", "enum": ["todo", "in_progress", "review", "done"]},
                    "priority": {"type": "integer", "minimum": 0, "maximum": 4},
                    "description": {"type": "string"},
                },
                "required": ["task_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "add_task_comment",
            "description": "Add a comment to a marketing task (visible to the user in the Tareas tab). Use this to log progress or explain actions.",
            "parameters": {
                "type": "object",
                "properties": {
                    "task_id": {"type": "string"},
                    "content": {"type": "string"},
                },
                "required": ["task_id", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "submit_url_to_google",
            "description": "Request Google to index a URL via Search Console URL Inspection API",
            "parameters": {
                "type": "object",
                "properties": {"url": {"type": "string"}},
                "required": ["url"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "submit_sitemap",
            "description": "Submit a sitemap to Search Console for indexing",
            "parameters": {
                "type": "object",
                "properties": {"sitemap_url": {"type": "string"}},
                "required": ["sitemap_url"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_gtm_tag",
            "description": "Create a new tag in Google Tag Manager workspace. Use for GA4 events, conversion tracking, etc.",
            "parameters": {
                "type": "object",
                "properties": {
                    "account_id": {"type": "string"},
                    "container_id": {"type": "string"},
                    "name": {"type": "string"},
                    "type": {"type": "string", "description": "GTM tag type e.g. 'gaawe' for GA4 event, 'html' for custom HTML"},
                    "parameter": {"type": "array", "items": {"type": "object"}, "description": "GTM tag parameters"},
                    "firing_trigger_id": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["account_id", "container_id", "name", "type"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "publish_gtm_container",
            "description": "Publish a new version of a GTM container (pushes all workspace changes live)",
            "parameters": {
                "type": "object",
                "properties": {
                    "account_id": {"type": "string"},
                    "container_id": {"type": "string"},
                },
                "required": ["account_id", "container_id"],
            },
        },
    },
    # ----- CODE (require confirmation + staging) -----
    {
        "type": "function",
        "function": {
            "name": "read_repo_file",
            "description": "Read a file from the site's Git repository",
            "parameters": {
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_repo_files",
            "description": "List files in the site's Git repository matching a glob pattern",
            "parameters": {
                "type": "object",
                "properties": {"pattern": {"type": "string", "default": "**/*"}},
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "edit_repo_file",
            "description": "Edit a file in the Git repo. Commits to the staging branch. Call deploy_to_staging afterwards.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "old_content": {"type": "string", "description": "Exact text to replace"},
                    "new_content": {"type": "string", "description": "Replacement text"},
                    "commit_message": {"type": "string"},
                },
                "required": ["path", "old_content", "new_content", "commit_message"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "deploy_to_staging",
            "description": "Build the site and deploy to the staging URL. Returns the staging URL for the user to review.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "promote_staging_to_prod",
            "description": "After user validates staging, merge the branch to main and deploy to production",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
]

# ============================================================================
# Tool execution router
# ============================================================================

class ToolContext:
    """Per-request context for tool execution."""
    def __init__(self, user_id: str, user_jwt: str, workspace_id: str, site_id: Optional[str], site: Optional[Dict]):
        self.user_id = user_id
        self.user_jwt = user_jwt
        self.workspace_id = workspace_id
        self.site_id = site_id
        self.site = site or {}


async def execute_tool(tool_name: str, args: Dict[str, Any], ctx: ToolContext) -> Dict[str, Any]:
    """Execute a tool by name with given args and context."""
    try:
        if tool_name == "get_site_info":
            return _get_site_info(ctx)
        if tool_name == "get_seo_audit_latest":
            return await _get_seo_audit_latest(ctx)
        if tool_name == "run_seo_audit":
            return await _run_seo_audit(ctx)
        if tool_name == "get_pagespeed":
            return await _get_pagespeed(ctx, args.get("strategy", "mobile"))
        if tool_name == "list_keywords":
            return await _list_keywords(ctx, args.get("limit", 20))
        if tool_name == "get_search_performance":
            return await _get_search_performance(ctx)
        if tool_name == "get_ga4_overview":
            return await _get_ga4_overview(ctx, args.get("date_range", "28daysAgo"))
        if tool_name == "list_gtm_accounts":
            return await _list_gtm_accounts(ctx)
        if tool_name == "list_gtm_containers":
            return await _list_gtm_containers(ctx, args["account_id"])
        if tool_name == "list_gtm_tags":
            return await _list_gtm_tags(ctx, args["account_id"], args["container_id"])
        if tool_name == "list_marketing_tasks":
            return await _list_marketing_tasks(ctx, args.get("task_type"), args.get("status"))
        if tool_name == "create_marketing_task":
            return await _create_marketing_task(ctx, args)
        if tool_name == "update_marketing_task":
            return await _update_marketing_task(ctx, args)
        if tool_name == "add_task_comment":
            return await _add_task_comment(ctx, args["task_id"], args["content"])
        if tool_name == "submit_url_to_google":
            return await _submit_url_to_google(ctx, args["url"])
        if tool_name == "submit_sitemap":
            return await _submit_sitemap(ctx, args["sitemap_url"])
        if tool_name == "create_gtm_tag":
            return await _create_gtm_tag(ctx, args)
        if tool_name == "publish_gtm_container":
            return await _publish_gtm_container(ctx, args["account_id"], args["container_id"])
        if tool_name in ("read_repo_file", "list_repo_files", "edit_repo_file", "deploy_to_staging", "promote_staging_to_prod"):
            from api.services.marketing.pulsemark_deploy import execute_deploy_tool
            return await execute_deploy_tool(tool_name, args, ctx)
        return {"error": f"Unknown tool: {tool_name}"}
    except Exception as e:
        logger.exception(f"Tool {tool_name} failed: {e}")
        return {"error": str(e)}


# ============================================================================
# READ tool implementations
# ============================================================================

def _get_site_info(ctx: ToolContext) -> Dict[str, Any]:
    s = ctx.site
    return {
        "name": s.get("name"),
        "domain": s.get("domain"),
        "url": s.get("url"),
        "site_type": s.get("site_type"),
        "ga4_configured": bool(s.get("ga4_property_id")),
        "gsc_configured": bool(s.get("gsc_site_url")),
        "ga4_property_id": s.get("ga4_property_id"),
        "gsc_site_url": s.get("gsc_site_url"),
        "repository_url": s.get("repository_url"),
        "repository_full_name": s.get("repository_full_name"),
        "server_host": s.get("server_host"),
        "server_ip": s.get("server_ip"),
        "last_audit_score": s.get("last_audit_score"),
        "last_audit_at": s.get("last_audit_at"),
    }


async def _get_seo_audit_latest(ctx: ToolContext) -> Dict[str, Any]:
    from api.services.marketing.seo_audit import list_audits, get_audit
    audits = await list_audits(ctx.site_id, ctx.user_jwt, limit=1)
    if not audits:
        return {"audit": None, "message": "No audits yet. Use run_seo_audit to execute one."}
    full = await get_audit(audits[0]["id"], ctx.user_jwt)
    return {"audit": full}


async def _run_seo_audit(ctx: ToolContext) -> Dict[str, Any]:
    from api.services.marketing.seo_audit import run_seo_audit
    audit = await run_seo_audit(
        site_id=ctx.site_id,
        workspace_id=ctx.workspace_id,
        url=ctx.site.get("url", ""),
        user_jwt=ctx.user_jwt,
    )
    return {
        "audit_id": audit.get("id"),
        "seo_score": audit.get("seo_score"),
        "issues_summary": audit.get("diagnostics", {}).get("issue_summary"),
        "total_issues": len(audit.get("issues", [])),
    }


async def _get_pagespeed(ctx: ToolContext, strategy: str) -> Dict[str, Any]:
    from api.services.marketing.pagespeed import get_pagespeed
    result = await get_pagespeed(ctx.site.get("url", ""), strategy)
    return {
        "strategy": strategy,
        "scores": result.get("scores"),
        "core_web_vitals": result.get("core_web_vitals"),
        "top_opportunities": result.get("opportunities", [])[:5],
    }


async def _list_keywords(ctx: ToolContext, limit: int) -> Dict[str, Any]:
    if not ctx.site.get("gsc_site_url"):
        return {"error": "Search Console not configured for this site"}
    from api.services.marketing.search_console import gsc_keywords
    keywords = await gsc_keywords(ctx.user_id, ctx.site["gsc_site_url"], limit=limit)
    return {"keywords": keywords}


async def _get_search_performance(ctx: ToolContext) -> Dict[str, Any]:
    if not ctx.site.get("gsc_site_url"):
        return {"error": "Search Console not configured"}
    from api.services.marketing.search_console import gsc_performance
    perf = await gsc_performance(ctx.user_id, ctx.site["gsc_site_url"])
    return perf


async def _get_ga4_overview(ctx: ToolContext, date_range: str) -> Dict[str, Any]:
    if not ctx.site.get("ga4_property_id"):
        return {"error": "Google Analytics not configured"}
    from api.services.marketing.analytics import ga4_overview
    return await ga4_overview(ctx.user_id, ctx.site["ga4_property_id"], start_date=date_range)


async def _list_gtm_accounts(ctx: ToolContext) -> Dict[str, Any]:
    from api.services.marketing.tag_manager import list_accounts
    return {"accounts": await list_accounts(ctx.user_id)}


async def _list_gtm_containers(ctx: ToolContext, account_id: str) -> Dict[str, Any]:
    from api.services.marketing.tag_manager import list_containers
    return {"containers": await list_containers(ctx.user_id, account_id)}


async def _list_gtm_tags(ctx: ToolContext, account_id: str, container_id: str) -> Dict[str, Any]:
    from api.services.marketing.tag_manager import list_tags
    return {"tags": await list_tags(ctx.user_id, account_id, container_id)}


async def _list_marketing_tasks(ctx: ToolContext, task_type: Optional[str], status: Optional[str]) -> Dict[str, Any]:
    from api.services.marketing.tasks import list_tasks
    result = await list_tasks(ctx.site_id, ctx.user_jwt, task_type=task_type, status=status)
    return result


# ============================================================================
# WRITE tool implementations
# ============================================================================

async def _create_marketing_task(ctx: ToolContext, args: Dict[str, Any]) -> Dict[str, Any]:
    from api.services.marketing.tasks import create_task
    data = {
        "title": args["title"],
        "description": args.get("description"),
        "task_type": args["task_type"],
        "category": args.get("category"),
        "priority": args.get("priority", 2),
        "routine_label": args.get("routine_label"),
        "assigned_agent": "pulsemark" if args.get("assign_to_me") else None,
    }
    task = await create_task(ctx.site_id, ctx.workspace_id, ctx.user_id, data, ctx.user_jwt)
    return {"task_id": task["id"], "title": task["title"], "created": True}


async def _update_marketing_task(ctx: ToolContext, args: Dict[str, Any]) -> Dict[str, Any]:
    from api.services.marketing.tasks import update_task
    task_id = args.pop("task_id")
    result = await update_task(task_id, args, ctx.user_jwt)
    return {"updated": bool(result), "task": result}


async def _add_task_comment(ctx: ToolContext, task_id: str, content: str) -> Dict[str, Any]:
    from api.services.marketing.tasks import create_comment
    comment = await create_comment(task_id, ctx.workspace_id, None, "pulsemark", content, ctx.user_jwt)
    return {"comment_id": comment["id"], "added": True}


async def _submit_url_to_google(ctx: ToolContext, url: str) -> Dict[str, Any]:
    if not ctx.site.get("gsc_site_url"):
        return {"error": "Search Console not configured"}
    from api.services.google_auth import get_credentials_for_user
    from googleapiclient.discovery import build
    credentials, _ = get_credentials_for_user(ctx.user_id, provider="google_marketing")
    service = build("searchconsole", "v1", credentials=credentials)
    result = service.urlInspection().index().inspect(body={
        "inspectionUrl": url,
        "siteUrl": ctx.site["gsc_site_url"],
    }).execute()
    return result.get("inspectionResult", {})


async def _submit_sitemap(ctx: ToolContext, sitemap_url: str) -> Dict[str, Any]:
    if not ctx.site.get("gsc_site_url"):
        return {"error": "Search Console not configured"}
    from api.services.google_auth import get_credentials_for_user
    from googleapiclient.discovery import build
    credentials, _ = get_credentials_for_user(ctx.user_id, provider="google_marketing")
    service = build("webmasters", "v3", credentials=credentials)
    service.sitemaps().submit(siteUrl=ctx.site["gsc_site_url"], feedpath=sitemap_url).execute()
    return {"submitted": True, "sitemap_url": sitemap_url}


async def _create_gtm_tag(ctx: ToolContext, args: Dict[str, Any]) -> Dict[str, Any]:
    from api.services.marketing.tag_manager import create_tag
    tag_data = {
        "name": args["name"],
        "type": args["type"],
        "parameter": args.get("parameter", []),
        "firingTriggerId": args.get("firing_trigger_id", []),
    }
    result = await create_tag(ctx.user_id, args["account_id"], args["container_id"], tag_data)
    return {"tag_id": result.get("tagId"), "name": result.get("name"), "created": True}


async def _publish_gtm_container(ctx: ToolContext, account_id: str, container_id: str) -> Dict[str, Any]:
    from api.services.marketing.tag_manager import publish_version
    return await publish_version(ctx.user_id, account_id, container_id)
