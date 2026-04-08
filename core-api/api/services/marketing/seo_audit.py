"""
SEO Audit service — crawls a site and generates an SEO health report.

Uses httpx + BeautifulSoup to analyze HTML structure, meta tags, headings,
images, links, sitemap, robots.txt, and structured data.
"""
import logging
import asyncio
from typing import Dict, Any, List, Optional, Set
from urllib.parse import urlparse, urljoin

import httpx
from bs4 import BeautifulSoup

from lib.supabase_client import get_authenticated_async_client

logger = logging.getLogger(__name__)

MAX_PAGES_PER_AUDIT = 50
REQUEST_TIMEOUT = 15
CONCURRENT_REQUESTS = 5


async def run_seo_audit(
    site_id: str,
    workspace_id: str,
    url: str,
    user_jwt: str,
    max_pages: int = MAX_PAGES_PER_AUDIT,
) -> Dict[str, Any]:
    """Run a full SEO audit on a URL and save results to DB."""
    issues: List[Dict[str, Any]] = []
    opportunities: List[Dict[str, Any]] = []
    diagnostics: Dict[str, Any] = {}

    base_url = url.rstrip("/")
    parsed_base = urlparse(base_url)
    domain = parsed_base.netloc

    async with httpx.AsyncClient(
        timeout=REQUEST_TIMEOUT,
        follow_redirects=True,
        headers={"User-Agent": "PulseSEOBot/1.0"},
    ) as client:
        # 1. Check robots.txt
        robots_data = await _check_robots(client, base_url)
        diagnostics["robots_txt"] = robots_data
        if not robots_data["exists"]:
            issues.append({
                "type": "robots_txt",
                "severity": "warning",
                "message": "robots.txt not found",
            })

        # 2. Check sitemap.xml
        sitemap_data = await _check_sitemap(client, base_url)
        diagnostics["sitemap"] = sitemap_data
        if not sitemap_data["exists"]:
            issues.append({
                "type": "sitemap",
                "severity": "warning",
                "message": "sitemap.xml not found",
            })

        # 3. Crawl pages
        crawled_urls: Set[str] = set()
        pages_to_crawl = [base_url]
        page_results = []

        semaphore = asyncio.Semaphore(CONCURRENT_REQUESTS)

        async def crawl_page(page_url: str) -> Optional[Dict[str, Any]]:
            async with semaphore:
                try:
                    resp = await client.get(page_url)
                    return _analyze_page(page_url, resp.text, resp.status_code, domain)
                except Exception as e:
                    return {"url": page_url, "error": str(e), "status": 0}

        # BFS crawl
        while pages_to_crawl and len(crawled_urls) < max_pages:
            batch = []
            for u in pages_to_crawl:
                if u not in crawled_urls and len(crawled_urls) + len(batch) < max_pages:
                    crawled_urls.add(u)
                    batch.append(u)
            pages_to_crawl.clear()

            if not batch:
                break

            results = await asyncio.gather(*[crawl_page(u) for u in batch])

            for result in results:
                if result and not result.get("error"):
                    page_results.append(result)
                    issues.extend(result.get("issues", []))
                    # Collect internal links for next batch
                    for link in result.get("internal_links", []):
                        if link not in crawled_urls:
                            pages_to_crawl.append(link)

        diagnostics["pages_crawled"] = len(crawled_urls)
        diagnostics["pages_with_issues"] = sum(
            1 for p in page_results if p.get("issues")
        )

    # Calculate scores
    seo_score = _calculate_seo_score(issues, len(page_results))
    performance_score = None  # Filled by PageSpeed separately

    # Count issues by severity
    critical_count = sum(1 for i in issues if i["severity"] == "critical")
    warning_count = sum(1 for i in issues if i["severity"] == "warning")
    info_count = sum(1 for i in issues if i["severity"] == "info")

    diagnostics["issue_summary"] = {
        "critical": critical_count,
        "warning": warning_count,
        "info": info_count,
        "total": len(issues),
    }

    # Save to DB
    supabase = await get_authenticated_async_client(user_jwt)
    audit_data = {
        "site_id": site_id,
        "workspace_id": workspace_id,
        "seo_score": seo_score,
        "performance_score": performance_score,
        "accessibility_score": None,
        "best_practices_score": None,
        "issues": issues,
        "opportunities": opportunities,
        "diagnostics": diagnostics,
        "audited_url": url,
    }
    result = await (
        supabase.table("marketing_seo_audits")
        .insert(audit_data)
        .execute()
    )
    audit = result.data[0] if result.data else audit_data

    # Update site cached score
    await (
        supabase.table("marketing_sites")
        .update({"last_audit_score": seo_score, "last_audit_at": "now()"})
        .eq("id", site_id)
        .execute()
    )

    return audit


async def list_audits(
    site_id: str,
    user_jwt: str,
    limit: int = 20,
) -> List[Dict[str, Any]]:
    supabase = await get_authenticated_async_client(user_jwt)
    result = await (
        supabase.table("marketing_seo_audits")
        .select("id, site_id, seo_score, performance_score, audited_url, created_at, diagnostics->issue_summary")
        .eq("site_id", site_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data or []


async def get_audit(audit_id: str, user_jwt: str) -> Optional[Dict[str, Any]]:
    supabase = await get_authenticated_async_client(user_jwt)
    result = await (
        supabase.table("marketing_seo_audits")
        .select("*")
        .eq("id", audit_id)
        .single()
        .execute()
    )
    return result.data


# ============================================================================
# Internal helpers
# ============================================================================

def _analyze_page(
    url: str, html: str, status_code: int, domain: str
) -> Dict[str, Any]:
    """Analyze a single page's HTML for SEO issues."""
    issues: List[Dict[str, Any]] = []
    soup = BeautifulSoup(html, "html.parser")

    # Meta tags
    title_tag = soup.find("title")
    title = title_tag.get_text(strip=True) if title_tag else None
    if not title:
        issues.append({"type": "meta", "severity": "critical", "message": f"Missing <title> tag", "url": url})
    elif len(title) > 60:
        issues.append({"type": "meta", "severity": "warning", "message": f"Title too long ({len(title)} chars)", "url": url})

    meta_desc = soup.find("meta", attrs={"name": "description"})
    desc = meta_desc.get("content", "") if meta_desc else ""
    if not desc:
        issues.append({"type": "meta", "severity": "critical", "message": "Missing meta description", "url": url})
    elif len(desc) > 160:
        issues.append({"type": "meta", "severity": "warning", "message": f"Meta description too long ({len(desc)} chars)", "url": url})

    # Canonical
    canonical = soup.find("link", attrs={"rel": "canonical"})
    if not canonical:
        issues.append({"type": "meta", "severity": "warning", "message": "Missing canonical tag", "url": url})

    # OG tags
    og_title = soup.find("meta", attrs={"property": "og:title"})
    og_desc = soup.find("meta", attrs={"property": "og:description"})
    og_image = soup.find("meta", attrs={"property": "og:image"})
    if not og_title or not og_desc:
        issues.append({"type": "meta", "severity": "info", "message": "Missing Open Graph meta tags", "url": url})

    # Headings
    h1s = soup.find_all("h1")
    if len(h1s) == 0:
        issues.append({"type": "headings", "severity": "critical", "message": "No H1 tag found", "url": url})
    elif len(h1s) > 1:
        issues.append({"type": "headings", "severity": "warning", "message": f"Multiple H1 tags ({len(h1s)})", "url": url})

    # Images without alt
    images = soup.find_all("img")
    imgs_no_alt = [img for img in images if not img.get("alt")]
    if imgs_no_alt:
        issues.append({
            "type": "images",
            "severity": "warning",
            "message": f"{len(imgs_no_alt)} images missing alt text",
            "url": url,
        })

    # Structured data (JSON-LD)
    json_ld = soup.find_all("script", attrs={"type": "application/ld+json"})
    has_schema = len(json_ld) > 0

    # Internal links
    internal_links = set()
    external_links = set()
    parsed_base = urlparse(url)
    for a in soup.find_all("a", href=True):
        href = a["href"]
        full_url = urljoin(url, href)
        parsed = urlparse(full_url)
        if parsed.netloc == domain and parsed.scheme in ("http", "https"):
            clean = f"{parsed.scheme}://{parsed.netloc}{parsed.path}".rstrip("/")
            internal_links.add(clean)
        elif parsed.scheme in ("http", "https"):
            external_links.add(full_url)

    return {
        "url": url,
        "status": status_code,
        "title": title,
        "meta_description": desc,
        "has_canonical": canonical is not None,
        "has_og_tags": og_title is not None,
        "has_schema": has_schema,
        "h1_count": len(h1s),
        "images_total": len(images),
        "images_no_alt": len(imgs_no_alt),
        "internal_links": list(internal_links),
        "external_links_count": len(external_links),
        "issues": issues,
    }


async def _check_robots(client: httpx.AsyncClient, base_url: str) -> Dict[str, Any]:
    try:
        resp = await client.get(f"{base_url}/robots.txt")
        if resp.status_code == 200:
            content = resp.text
            has_sitemap = "sitemap:" in content.lower()
            return {"exists": True, "has_sitemap_ref": has_sitemap, "content_length": len(content)}
        return {"exists": False}
    except Exception:
        return {"exists": False}


async def _check_sitemap(client: httpx.AsyncClient, base_url: str) -> Dict[str, Any]:
    for path in ["/sitemap.xml", "/sitemap_index.xml"]:
        try:
            resp = await client.get(f"{base_url}{path}")
            if resp.status_code == 200 and "xml" in resp.headers.get("content-type", ""):
                return {"exists": True, "url": f"{base_url}{path}", "size": len(resp.text)}
        except Exception:
            continue
    return {"exists": False}


def _calculate_seo_score(issues: List[Dict], total_pages: int) -> int:
    """Calculate a 0-100 SEO score based on issues found."""
    if total_pages == 0:
        return 0

    score = 100
    for issue in issues:
        severity = issue.get("severity", "info")
        if severity == "critical":
            score -= 5
        elif severity == "warning":
            score -= 2
        elif severity == "info":
            score -= 0.5

    return max(0, min(100, int(score)))
