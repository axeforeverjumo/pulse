"""
CRM Import/Export service - CSV import and export for contacts, companies, opportunities.

Uses async Supabase client for non-blocking I/O.
"""
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import csv
import io
import logging

from lib.supabase_client import get_authenticated_async_client

logger = logging.getLogger(__name__)

# Column mappings for CSV import
CONTACT_COLUMNS = {
    "first_name": ["first_name", "nombre", "first name", "name"],
    "last_name": ["last_name", "apellido", "last name", "surname"],
    "email": ["email", "correo", "e-mail", "email_address"],
    "phone": ["phone", "telefono", "teléfono", "tel", "mobile"],
    "job_title": ["job_title", "cargo", "position", "puesto", "title"],
    "city": ["city", "ciudad", "location"],
}

COMPANY_COLUMNS = {
    "name": ["name", "nombre", "company", "empresa", "company_name"],
    "domain": ["domain", "dominio", "website", "web", "url"],
    "industry": ["industry", "industria", "sector"],
}


def _normalize_header(header: str) -> str:
    return header.strip().lower().replace(" ", "_")


def _map_columns(headers: List[str], mapping: Dict[str, List[str]]) -> Dict[int, str]:
    """Map CSV column indices to field names using the column mapping."""
    result = {}
    normalized = [_normalize_header(h) for h in headers]
    for field, aliases in mapping.items():
        for alias in aliases:
            if alias in normalized:
                result[normalized.index(alias)] = field
                break
    return result


async def import_contacts_from_csv(
    workspace_id: str,
    user_id: str,
    user_jwt: str,
    csv_content: str,
) -> Dict[str, Any]:
    """
    Import contacts from CSV content. Returns created/skipped/error counts.
    """
    supabase = await get_authenticated_async_client(user_jwt)
    reader = csv.reader(io.StringIO(csv_content))
    headers = next(reader, None)

    if not headers:
        return {"error": "CSV vacío o sin encabezados", "created": 0, "skipped": 0, "errors": 0}

    col_map = _map_columns(headers, CONTACT_COLUMNS)
    if not col_map:
        return {
            "error": "No se pudieron mapear las columnas. Columnas esperadas: first_name, last_name, email, phone",
            "created": 0,
            "skipped": 0,
            "errors": 0,
            "detected_headers": headers,
        }

    now = datetime.now(timezone.utc).isoformat()
    created = 0
    skipped = 0
    errors = 0
    error_details = []

    for row_idx, row in enumerate(reader, start=2):
        try:
            record = {}
            for col_idx, field in col_map.items():
                if col_idx < len(row):
                    val = row[col_idx].strip()
                    if val:
                        record[field] = val

            if not record.get("first_name") and not record.get("email"):
                skipped += 1
                continue

            record["workspace_id"] = workspace_id
            record["source"] = "import"
            record["created_by"] = user_id
            record["created_at"] = now
            record["updated_at"] = now

            await (
                supabase.table("crm_contacts")
                .insert(record)
                .execute()
            )
            created += 1
        except Exception as e:
            errors += 1
            error_details.append({"row": row_idx, "error": str(e)[:100]})

    return {
        "created": created,
        "skipped": skipped,
        "errors": errors,
        "error_details": error_details[:20],
        "column_mapping": {v: headers[k] for k, v in col_map.items()},
    }


async def import_companies_from_csv(
    workspace_id: str,
    user_id: str,
    user_jwt: str,
    csv_content: str,
) -> Dict[str, Any]:
    """Import companies from CSV content."""
    supabase = await get_authenticated_async_client(user_jwt)
    reader = csv.reader(io.StringIO(csv_content))
    headers = next(reader, None)

    if not headers:
        return {"error": "CSV vacío o sin encabezados", "created": 0, "skipped": 0, "errors": 0}

    col_map = _map_columns(headers, COMPANY_COLUMNS)
    if not col_map:
        return {
            "error": "No se pudieron mapear las columnas. Columnas esperadas: name, domain, industry",
            "created": 0,
            "skipped": 0,
            "errors": 0,
            "detected_headers": headers,
        }

    now = datetime.now(timezone.utc).isoformat()
    created = 0
    skipped = 0
    errors = 0
    error_details = []

    for row_idx, row in enumerate(reader, start=2):
        try:
            record = {}
            for col_idx, field in col_map.items():
                if col_idx < len(row):
                    val = row[col_idx].strip()
                    if val:
                        record[field] = val

            if not record.get("name"):
                skipped += 1
                continue

            record["workspace_id"] = workspace_id
            record["created_by"] = user_id
            record["created_at"] = now
            record["updated_at"] = now

            await (
                supabase.table("crm_companies")
                .insert(record)
                .execute()
            )
            created += 1
        except Exception as e:
            errors += 1
            error_details.append({"row": row_idx, "error": str(e)[:100]})

    return {
        "created": created,
        "skipped": skipped,
        "errors": errors,
        "error_details": error_details[:20],
        "column_mapping": {v: headers[k] for k, v in col_map.items()},
    }


async def export_contacts_csv(
    workspace_id: str,
    user_jwt: str,
) -> str:
    """Export all contacts as CSV string."""
    supabase = await get_authenticated_async_client(user_jwt)
    result = await (
        supabase.table("crm_contacts")
        .select("first_name, last_name, email, phone, job_title, city, source, created_at")
        .eq("workspace_id", workspace_id)
        .is_("deleted_at", "null")
        .order("created_at", desc=True)
        .execute()
    )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["first_name", "last_name", "email", "phone", "job_title", "city", "source", "created_at"])
    for row in (result.data or []):
        writer.writerow([
            row.get("first_name", ""),
            row.get("last_name", ""),
            row.get("email", ""),
            row.get("phone", ""),
            row.get("job_title", ""),
            row.get("city", ""),
            row.get("source", ""),
            row.get("created_at", ""),
        ])

    return output.getvalue()


async def export_opportunities_csv(
    workspace_id: str,
    user_jwt: str,
) -> str:
    """Export all opportunities as CSV string."""
    supabase = await get_authenticated_async_client(user_jwt)
    result = await (
        supabase.table("crm_opportunities")
        .select("name, stage, amount, currency_code, close_date, description, created_at")
        .eq("workspace_id", workspace_id)
        .is_("deleted_at", "null")
        .order("created_at", desc=True)
        .execute()
    )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["name", "stage", "amount", "currency", "close_date", "description", "created_at"])
    for row in (result.data or []):
        writer.writerow([
            row.get("name", ""),
            row.get("stage", ""),
            row.get("amount", ""),
            row.get("currency_code", ""),
            row.get("close_date", ""),
            row.get("description", ""),
            row.get("created_at", ""),
        ])

    return output.getvalue()
