"""
Head Hunter service — AI-powered employee hiring.
Analyzes what the company needs and creates the perfect AI employee.
"""
from typing import Dict, Any, Optional
import json
import logging
from lib.openai_client import get_openai_client

logger = logging.getLogger(__name__)


async def hire_employee(
    workspace_id: str,
    user_jwt: str,
    description: str,
    department: Optional[str] = None,
) -> Dict[str, Any]:
    """
    The Head Hunter analyzes the request and creates a complete AI employee profile.
    Returns the employee spec ready to be created as an OpenClaw agent.
    """
    from lib.supabase_client import get_authenticated_async_client

    client = get_openai_client()

    # Get existing employees for context
    supabase = await get_authenticated_async_client(user_jwt)
    existing = await (
        supabase.table("openclaw_agents")
        .select("name, description, category")
        .eq("workspace_id", workspace_id)
        .execute()
    )
    existing_employees = existing.data or []
    existing_context = "\n".join(
        f"- {e['name']} ({e.get('category', 'general')}): {e.get('description', '')[:60]}"
        for e in existing_employees
    ) or "No hay empleados aun."

    system_prompt = f"""Eres el Head Hunter de una empresa. Tu trabajo es encontrar al candidato perfecto para el puesto que describe el usuario.

EMPLEADOS ACTUALES:
{existing_context}

INSTRUCCIONES:
- Analiza que necesita la empresa basandote en la descripcion del usuario
- Crea un perfil COMPLETO del empleado ideal
- NO repitas perfiles que ya existen
- El empleado sera un agente de IA, asi que dale personalidad y habilidades claras
- Responde SOLO con JSON valido, sin markdown

FORMATO DE RESPUESTA (JSON):
{{
  "found": true,
  "candidate": {{
    "name": "Nombre completo del candidato (nombre realista español)",
    "role": "Titulo del puesto (ej: Director de Marketing Digital)",
    "department": "departamento (comercial|marketing|desarrollo|soporte|finanzas|legal|operaciones|direccion)",
    "description": "Descripcion corta del rol y personalidad (1-2 frases)",
    "personality": "Rasgos de personalidad clave",
    "skills": ["skill1", "skill2", "skill3"],
    "soul_md": "Prompt de sistema completo para el agente. Define quien es, como habla, que sabe hacer, como interactua. Minimo 200 palabras.",
    "interview_note": "Nota del headhunter explicando por que este candidato es ideal (2-3 frases para mostrar al usuario)"
  }}
}}"""

    user_msg = description
    if department:
        user_msg += f"\n\nDepartamento preferido: {department}"

    response = await client.chat.completions.create(
        model="gpt-5.4-mini",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_msg},
        ],
        temperature=0.8,
        max_tokens=1500,
    )

    content = response.choices[0].message.content.strip()

    # Parse JSON response
    try:
        # Clean markdown fences if present
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
        result = json.loads(content)
    except json.JSONDecodeError:
        logger.error(f"Head Hunter returned invalid JSON: {content[:200]}")
        return {
            "found": False,
            "error": "El Head Hunter no pudo generar un candidato. Intenta de nuevo con mas detalle.",
        }

    return result


async def confirm_hire(
    workspace_id: str,
    user_jwt: str,
    user_id: str,
    candidate: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Confirm the hire — creates the OpenClaw agent from the candidate profile.
    """
    from lib.supabase_client import get_authenticated_async_client

    supabase = await get_authenticated_async_client(user_jwt)

    agent_data = {
        "workspace_id": workspace_id,
        "name": candidate["name"],
        "description": candidate.get("description", candidate.get("role", "")),
        "category": candidate.get("department", "general"),
        "tier": "openclaw",
        "model": "gpt-5.4-mini",
        "tools": [],
        "soul_md": candidate.get("soul_md", ""),
        "identity_md": f"# {candidate['name']}\n\n**Puesto:** {candidate.get('role', '')}\n**Departamento:** {candidate.get('department', '')}\n**Personalidad:** {candidate.get('personality', '')}\n\n**Skills:** {', '.join(candidate.get('skills', []))}",
        "created_by": user_id,
    }

    result = await supabase.table("openclaw_agents").insert(agent_data).execute()

    if not result.data:
        raise ValueError("No se pudo crear el empleado")

    agent = result.data[0]
    logger.info(f"Head Hunter hired {candidate['name']} for workspace {workspace_id}")

    return {
        "hired": True,
        "employee": agent,
        "message": f"🎉 {candidate['name']} ha sido contratado como {candidate.get('role', 'empleado')} en el departamento de {candidate.get('department', 'general')}.",
    }
