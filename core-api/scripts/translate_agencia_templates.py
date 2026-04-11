"""
Translate all Agencia agent templates to Spanish using Haiku via OpenAI proxy.
Uses Supabase REST API directly.
Run on server: python3 scripts/translate_agencia_templates.py
"""
import os
import sys
import json
import time
import httpx

OPENAI_BASE = "http://127.0.0.1:10531/v1"
MODEL = "gpt-5.4-mini"

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://supabase.factoriaia.com")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc3NDg5NjMyMCwiZXhwIjoxOTMyNTc2MzIwLCJyb2xlIjoic2VydmljZV9yb2xlIn0.v9BhORakIUO7KLoYHcSAyBvKbWZ16CM25RYtmJD5B_8")

SUPA_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}


def get_templates():
    """Get all agencia templates from Supabase REST."""
    url = f"{SUPABASE_URL}/rest/v1/agent_templates?slug=like.agencia-*&select=id,slug,name,description,default_system_prompt&order=slug"
    r = httpx.get(url, headers={**SUPA_HEADERS, "Prefer": ""}, timeout=30)
    r.raise_for_status()
    return r.json()


def translate_with_haiku(name, description, system_prompt):
    """Translate agent fields to Spanish using Haiku."""
    # Truncate prompt if too long for context
    sp_truncated = system_prompt[:5000]

    prompt = f"""Traduce al espanol profesional los siguientes campos de un agente de IA.
Mantén el tono técnico y profesional. NO traduzcas nombres de tecnologías, frameworks, o herramientas (React, Python, TypeScript, etc.).
El system_prompt debe mantener su estructura markdown exacta (headers ##, bullets -, emojis, etc.) pero todo el texto debe estar en espanol.

Devuelve SOLO un JSON valido con estos 3 campos:
{{"name": "nombre en espanol", "description": "descripcion en espanol", "system_prompt": "prompt completo traducido al espanol"}}

---
name: {name}
description: {description}
system_prompt:
{sp_truncated}
"""

    try:
        r = httpx.post(
            f"{OPENAI_BASE}/chat/completions",
            json={
                "model": MODEL,
                "messages": [
                    {"role": "system", "content": "Eres un traductor profesional ingles-espanol especializado en tecnologia e IA. Traduces manteniendo la calidad y el tono tecnico. Siempre devuelves JSON valido sin markdown code blocks."},
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.3,
                "max_tokens": 8000,
            },
            headers={"Authorization": "Bearer dummy", "Content-Type": "application/json"},
            timeout=120.0,
        )
        r.raise_for_status()
        content = r.json()["choices"][0]["message"]["content"].strip()

        # Extract JSON from response
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        elif "```" in content:
            content = content.split("```")[1].split("```")[0]

        return json.loads(content.strip())
    except Exception as e:
        print(f"  ERROR translating: {e}", flush=True)
        return None


def update_template(template_id, name, description, system_prompt):
    """Update template via Supabase REST."""
    url = f"{SUPABASE_URL}/rest/v1/agent_templates?id=eq.{template_id}"
    data = {
        "name": name,
        "description": description,
        "default_system_prompt": system_prompt,
    }
    r = httpx.patch(url, json=data, headers=SUPA_HEADERS, timeout=30)
    return r.status_code in (200, 204)


def main():
    print("=" * 60, flush=True)
    print("Translating Agencia templates to Spanish via Haiku", flush=True)
    print("=" * 60, flush=True)

    templates = get_templates()
    print(f"Found {len(templates)} templates to translate\n", flush=True)

    success = 0
    failed = 0

    for i, t in enumerate(templates, 1):
        print(f"[{i}/{len(templates)}] {t['slug']}...", flush=True)

        translated = translate_with_haiku(t["name"], t["description"] or "", t["default_system_prompt"] or "")

        if translated and "name" in translated and "system_prompt" in translated:
            sp = translated["system_prompt"]
            if "espanol" not in sp.lower()[:300] and "español" not in sp.lower()[:300]:
                sp = "IMPORTANTE: Siempre responde en espanol.\n\n" + sp

            ok = update_template(
                t["id"],
                translated["name"],
                translated.get("description", t["description"]),
                sp,
            )
            if ok:
                print(f"  OK: {t['name']} -> {translated['name']}", flush=True)
                success += 1
            else:
                print(f"  DB UPDATE FAILED", flush=True)
                failed += 1
        else:
            print(f"  SKIP: translation failed", flush=True)
            failed += 1

        time.sleep(1.5)

    print(f"\n{'=' * 60}", flush=True)
    print(f"Done! Success: {success}, Failed: {failed}", flush=True)
    print(f"{'=' * 60}", flush=True)


if __name__ == "__main__":
    main()
