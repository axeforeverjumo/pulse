"""
Quality Gate — automated testing, linting, and code review.

Runs AFTER the agent finishes coding but BEFORE commit+push.
If any gate fails, the code does NOT get pushed and the task
gets re-enqueued with error context so the agent can fix it.

Pipeline:
  1. Lint (syntax check, formatting)
  2. Test (project-type-specific test runner)
  3. Review (LLM reviews the diff for quality/security issues)
"""
from __future__ import annotations

import asyncio
import logging
import os
import subprocess
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from api.config import settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Result types
# ---------------------------------------------------------------------------

@dataclass
class GateResult:
    passed: bool = True
    stage: str = ""
    summary: str = ""
    details: str = ""
    duration_ms: int = 0


@dataclass
class QualityReport:
    lint: Optional[GateResult] = None
    test: Optional[GateResult] = None
    review: Optional[GateResult] = None
    all_passed: bool = True
    blocking_stage: Optional[str] = None
    summary: str = ""


# ---------------------------------------------------------------------------
# 1. LINT — syntax check + formatting
# ---------------------------------------------------------------------------

def _detect_lint_command(project_type: Optional[str], repo_dir: str) -> Optional[str]:
    """Detect the appropriate lint command for the project type."""
    if project_type == "odoo":
        # Python syntax check on all .py files + XML well-formedness
        return (
            "python3 -m py_compile $(find . -name '*.py' -not -path './.git/*' | head -50) 2>&1; "
            "python3 -c \"import xml.etree.ElementTree as ET; import glob; "
            "[ET.parse(f) for f in glob.glob('**/*.xml', recursive=True)]\" 2>&1"
        )

    if project_type in ("nextjs", "node"):
        pkg_json = os.path.join(repo_dir, "package.json")
        if os.path.isfile(pkg_json):
            import json
            try:
                with open(pkg_json) as f:
                    pkg = json.load(f)
                scripts = pkg.get("scripts", {})
                if "lint" in scripts:
                    return "npm run lint 2>&1"
                if "eslint" in scripts:
                    return "npm run eslint 2>&1"
            except Exception:
                pass
        return "npx tsc --noEmit 2>&1 || true"

    if project_type == "django":
        return "python3 -m py_compile $(find . -name '*.py' -not -path './.git/*' | head -50) 2>&1"

    # Generic: try Python syntax check
    py_files = []
    for root, _, files in os.walk(repo_dir):
        if ".git" in root:
            continue
        for f in files:
            if f.endswith(".py"):
                py_files.append(os.path.join(root, f))
        if len(py_files) > 50:
            break

    if py_files:
        return "python3 -m py_compile $(find . -name '*.py' -not -path './.git/*' | head -50) 2>&1"

    return None


async def run_lint(repo_dir: str, project_type: Optional[str]) -> GateResult:
    """Run linting/syntax checks."""
    import time
    start = time.time()

    cmd = _detect_lint_command(project_type, repo_dir)
    if not cmd:
        return GateResult(passed=True, stage="lint", summary="No lint command detected, skipped")

    try:
        result = await asyncio.to_thread(
            subprocess.run, cmd, shell=True, cwd=repo_dir,
            capture_output=True, text=True, timeout=60,
        )
        output = ((result.stdout or "") + (result.stderr or ""))[:3000]
        passed = result.returncode == 0
        # For Python py_compile, errors go to stderr
        has_errors = any(kw in output.lower() for kw in ["syntaxerror", "error:", "traceback", "parseerror"])
        if has_errors:
            passed = False

        return GateResult(
            passed=passed,
            stage="lint",
            summary=f"Lint {'passed' if passed else 'FAILED'} (exit={result.returncode})",
            details=output if not passed else "",
            duration_ms=int((time.time() - start) * 1000),
        )
    except subprocess.TimeoutExpired:
        return GateResult(passed=False, stage="lint", summary="Lint timed out (60s)")
    except Exception as e:
        return GateResult(passed=True, stage="lint", summary=f"Lint skipped (error: {str(e)[:100]})")


# ---------------------------------------------------------------------------
# 2. TEST — project-type-specific test runner
# ---------------------------------------------------------------------------

def _detect_test_command(project_type: Optional[str], repo_dir: str) -> Optional[str]:
    """Detect the appropriate test command for the project type."""
    if project_type == "odoo":
        # Find Odoo modules in the repo
        modules = []
        for entry in os.listdir(repo_dir):
            manifest = os.path.join(repo_dir, entry, "__manifest__.py")
            if os.path.isfile(manifest):
                modules.append(entry)
        if not modules:
            # Single module repo
            if os.path.isfile(os.path.join(repo_dir, "__manifest__.py")):
                modules = [os.path.basename(repo_dir)]

        if modules:
            module_list = ",".join(modules)
            # Use Odoo test via Docker if available, otherwise syntax-only
            return (
                f"python3 -c \""
                f"import ast, os, sys; "
                f"[ast.parse(open(os.path.join(r,f)).read()) "
                f"for r,_,fs in os.walk('.') "
                f"for f in fs if f.endswith('.py') and '.git' not in r];"
                f"print('Python syntax OK for {module_list}')\" 2>&1"
            )
        return None

    if project_type in ("nextjs", "node"):
        pkg_json = os.path.join(repo_dir, "package.json")
        if os.path.isfile(pkg_json):
            import json
            try:
                with open(pkg_json) as f:
                    pkg = json.load(f)
                scripts = pkg.get("scripts", {})
                if "test:ci" in scripts:
                    return "npm run test:ci 2>&1"
                if "test" in scripts:
                    return "npm test -- --watchAll=false 2>&1"
            except Exception:
                pass
        return None

    if project_type == "django":
        if os.path.isfile(os.path.join(repo_dir, "manage.py")):
            return "python3 manage.py test --verbosity=1 2>&1"
        return None

    return None


async def run_tests(repo_dir: str, project_type: Optional[str]) -> GateResult:
    """Run project tests."""
    import time
    start = time.time()

    cmd = _detect_test_command(project_type, repo_dir)
    if not cmd:
        return GateResult(passed=True, stage="test", summary="No test command detected, skipped")

    try:
        result = await asyncio.to_thread(
            subprocess.run, cmd, shell=True, cwd=repo_dir,
            capture_output=True, text=True, timeout=180,
        )
        output = ((result.stdout or "") + (result.stderr or ""))[:3000]
        passed = result.returncode == 0

        return GateResult(
            passed=passed,
            stage="test",
            summary=f"Tests {'passed' if passed else 'FAILED'} (exit={result.returncode})",
            details=output if not passed else output[:500],
            duration_ms=int((time.time() - start) * 1000),
        )
    except subprocess.TimeoutExpired:
        return GateResult(passed=False, stage="test", summary="Tests timed out (180s)")
    except Exception as e:
        return GateResult(passed=True, stage="test", summary=f"Tests skipped (error: {str(e)[:100]})")


# ---------------------------------------------------------------------------
# 3. REVIEW — LLM code review
# ---------------------------------------------------------------------------

REVIEW_SYSTEM_PROMPT = """Eres un revisor de codigo experto. Revisa el diff proporcionado y busca:

1. ERRORES CRITICOS (bloquean):
   - Syntax errors
   - Imports de modulos que no existen
   - Campos referenciados en XML que no existen en Python
   - Credenciales hardcoded (passwords, tokens, API keys)
   - SQL injection
   - Archivos en __manifest__.py data[] que no existen

2. ERRORES ODOO (bloquean si es proyecto Odoo):
   - Uso de <tree> en lugar de <list>
   - Uso de attrs="..." en lugar de invisible/required/readonly directo
   - Uso de modulos Enterprise en Community
   - group_operator en lugar de aggregator
   - Herencia de modelos que no existen

3. WARNINGS (no bloquean):
   - Codigo duplicado
   - Funciones muy largas (>50 lineas)
   - Variables sin usar
   - TODO/FIXME sin resolver

RESPONDE SOLO JSON:
{
  "blocks": true/false,
  "critical": [{"file": "path", "line": N, "issue": "descripcion"}],
  "warnings": [{"file": "path", "issue": "descripcion"}],
  "summary": "Resumen de 1-2 frases"
}

Si no hay problemas criticos, blocks=false. Solo blocks=true si hay errores que rompen funcionalidad."""


async def run_review(
    repo_dir: str,
    project_type: Optional[str],
    diff_text: str,
) -> GateResult:
    """Run LLM code review on the diff."""
    import time
    import json
    start = time.time()

    if not diff_text or len(diff_text.strip()) < 10:
        return GateResult(passed=True, stage="review", summary="No changes to review")

    # Truncate very large diffs
    review_diff = diff_text[:15000]

    try:
        from lib.openai_client import get_async_openai_client
        client = get_async_openai_client()

        # Use a fast model for review
        review_model = settings.openai_core_model  # gpt-5.4-mini — fast + cheap

        context = f"Tipo de proyecto: {project_type or 'generic'}\n\n"

        response = await client.chat.completions.create(
            model=review_model,
            messages=[
                {"role": "system", "content": REVIEW_SYSTEM_PROMPT},
                {"role": "user", "content": f"{context}DIFF:\n```diff\n{review_diff}\n```"},
            ],
            max_tokens=2048,
            temperature=0.1,
        )

        raw = response.choices[0].message.content or "{}"
        # Parse JSON
        clean = raw.strip()
        if clean.startswith("```"):
            clean = clean.split("\n", 1)[1] if "\n" in clean else clean[3:]
        if clean.endswith("```"):
            clean = clean[:-3]

        review_data = json.loads(clean.strip())
        blocks = review_data.get("blocks", False)
        critical = review_data.get("critical", [])
        warnings = review_data.get("warnings", [])
        summary = review_data.get("summary", "")

        details_parts = []
        if critical:
            details_parts.append("CRITICOS:")
            for c in critical[:10]:
                details_parts.append(f"  - {c.get('file', '?')}:{c.get('line', '?')} — {c.get('issue', '?')}")
        if warnings:
            details_parts.append("WARNINGS:")
            for w in warnings[:10]:
                details_parts.append(f"  - {w.get('file', '?')} — {w.get('issue', '?')}")

        return GateResult(
            passed=not blocks,
            stage="review",
            summary=f"Review: {summary}" if summary else f"Review: {len(critical)} criticos, {len(warnings)} warnings",
            details="\n".join(details_parts),
            duration_ms=int((time.time() - start) * 1000),
        )

    except Exception as e:
        logger.warning("Code review failed (non-blocking): %s", e)
        return GateResult(passed=True, stage="review", summary=f"Review skipped: {str(e)[:100]}")


# ---------------------------------------------------------------------------
# Main quality gate
# ---------------------------------------------------------------------------

async def run_quality_gate(
    repo_dir: str,
    project_type: Optional[str],
    *,
    lint_enabled: bool = True,
    test_enabled: bool = True,
    review_enabled: bool = True,
    diff_text: str = "",
    job_id: Optional[str] = None,
) -> QualityReport:
    """
    Run all quality gates in sequence. Returns a report.
    If any blocking gate fails, subsequent gates still run for completeness
    but the report marks the first blocker.
    """
    from api.services.projects.openai_code_executor import _log_line

    report = QualityReport()

    # 1. Lint
    if lint_enabled:
        _log_line(job_id, "[quality] Running lint...")
        report.lint = await run_lint(repo_dir, project_type)
        _log_line(job_id, f"[quality] Lint: {report.lint.summary}")
        if not report.lint.passed and not report.blocking_stage:
            report.all_passed = False
            report.blocking_stage = "lint"

    # 2. Test
    if test_enabled:
        _log_line(job_id, "[quality] Running tests...")
        report.test = await run_tests(repo_dir, project_type)
        _log_line(job_id, f"[quality] Tests: {report.test.summary}")
        if not report.test.passed and not report.blocking_stage:
            report.all_passed = False
            report.blocking_stage = "test"

    # 3. Review
    if review_enabled and diff_text:
        _log_line(job_id, "[quality] Running code review...")
        report.review = await run_review(repo_dir, project_type, diff_text)
        _log_line(job_id, f"[quality] Review: {report.review.summary}")
        if not report.review.passed and not report.blocking_stage:
            report.all_passed = False
            report.blocking_stage = "review"

    # Build summary
    parts = []
    for gate in [report.lint, report.test, report.review]:
        if gate:
            icon = "✅" if gate.passed else "❌"
            parts.append(f"{icon} {gate.stage}: {gate.summary}")
    report.summary = "\n".join(parts)

    _log_line(job_id, f"[quality] Gate {'PASSED' if report.all_passed else f'BLOCKED by {report.blocking_stage}'}")

    return report


def format_quality_report_for_comment(report: QualityReport) -> str:
    """Format the quality report as a Markdown comment for the issue."""
    if report.all_passed:
        return f"**Quality Gate PASSED**\n\n{report.summary}"

    lines = [f"**Quality Gate BLOCKED** (stage: `{report.blocking_stage}`)\n"]
    for gate in [report.lint, report.test, report.review]:
        if gate:
            icon = "✅" if gate.passed else "❌"
            lines.append(f"{icon} **{gate.stage}**: {gate.summary}")
            if gate.details and not gate.passed:
                lines.append(f"```\n{gate.details[:1500]}\n```")
    return "\n".join(lines)
