"""
Project Onboard Chat — conversational project setup.

Instead of filling a form, the user chats with an AI that asks the right
questions and auto-configures the board when it has enough info.

The AI extracts: name, description, is_development, repo_url, server config,
deploy_mode, project_type, etc. from the conversation.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

from api.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# System prompt for the onboarding agent
# ---------------------------------------------------------------------------

ONBOARD_SYSTEM_PROMPT = """Eres el asistente de configuracion de proyectos de Pulse.

Tu trabajo es hacer las preguntas necesarias para configurar un nuevo proyecto de desarrollo. Debes ser conciso, amable y directo.

INFORMACION QUE NECESITAS RECOPILAR:
1. **Nombre del proyecto** (obligatorio)
2. **Descripcion breve** del proyecto (1-2 frases)
3. **Es un proyecto de desarrollo?** (con codigo, repositorio, servidor)
4. Si es desarrollo:
   a. **URL del repositorio** GitHub (o si necesita uno nuevo)
   b. **Modo de despliegue**: local (mismo servidor), externo (SSH a otro), o dedicado
   c. **Datos del servidor** si es externo/dedicado: IP, usuario, puerto
   d. **URL del proyecto** en produccion (si existe)
   e. **Tipo de proyecto**: Odoo, Next.js, Django, Docker, otro

REGLAS:
- Haz UNA o DOS preguntas a la vez, no todas de golpe.
- Si el usuario da informacion parcial, infiere lo que puedas y confirma.
- Si el usuario pega una URL de GitHub, extrae automaticamente owner/repo.
- Si el usuario menciona Odoo, asume que es proyecto de desarrollo con Docker.
- Cuando tengas toda la informacion necesaria (al menos nombre + tipo), genera la configuracion.

FORMATO DE RESPUESTA:
- Responde siempre en espanol.
- Cuando tengas toda la info, incluye al FINAL de tu mensaje un bloque JSON asi:

```json:project_config
{
  "ready": true,
  "name": "Nombre del proyecto",
  "description": "Descripcion",
  "is_development": true,
  "repository_url": "https://github.com/owner/repo",
  "repository_full_name": "owner/repo",
  "deploy_mode": "local",
  "server_ip": "",
  "server_user": "root",
  "server_port": 22,
  "project_url": "",
  "project_type": "odoo"
}
```

- Si aun NO tienes toda la info, NO incluyas el bloque JSON.
- El bloque debe estar en un code fence con el tag `json:project_config` para que el frontend lo detecte.
"""


# ---------------------------------------------------------------------------
# Chat logic
# ---------------------------------------------------------------------------

def _build_messages(
    history: List[Dict[str, str]],
    user_message: str,
    workspace_context: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, str]]:
    """Build the messages array for the LLM."""
    system = ONBOARD_SYSTEM_PROMPT

    if workspace_context:
        servers = workspace_context.get("servers", [])
        if servers:
            server_list = "\n".join(
                f"  - {s.get('name', '?')} ({s.get('host', '?')}:{s.get('port', 22)}) — {s.get('status', '?')}"
                for s in servers
            )
            system += f"\n\nSERVIDORES DISPONIBLES en el workspace:\n{server_list}\nSi el usuario menciona un servidor, sugiere el que mejor coincida."

        existing_boards = workspace_context.get("boards", [])
        if existing_boards:
            board_list = ", ".join(b.get("name", "?") for b in existing_boards[:10])
            system += f"\n\nPROYECTOS EXISTENTES: {board_list}"

    messages: List[Dict[str, str]] = [{"role": "system", "content": system}]

    for msg in history:
        messages.append({"role": msg["role"], "content": msg["content"]})

    messages.append({"role": "user", "content": user_message})
    return messages


async def chat_onboard_project(
    user_message: str,
    history: List[Dict[str, str]],
    workspace_context: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Process one turn of the onboarding chat.

    Returns:
        {
            "reply": "AI response text",
            "project_config": {...} or None,  # extracted config if ready
        }
    """
    from lib.openai_client import get_async_openai_client

    messages = _build_messages(history, user_message, workspace_context)

    client = get_async_openai_client()
    model = settings.openai_core_model  # Fast model for chat

    try:
        response = await client.chat.completions.create(
            model=model,
            messages=messages,
            max_tokens=2048,
            temperature=0.4,
        )
        reply = response.choices[0].message.content or "No pude generar una respuesta."
    except Exception as e:
        logger.error("Onboard chat error: %s", e)
        return {"reply": f"Error al procesar: {str(e)[:200]}", "project_config": None}

    # Extract project config if present
    project_config = _extract_project_config(reply)

    return {
        "reply": reply,
        "project_config": project_config,
    }


def _extract_project_config(text: str) -> Optional[Dict[str, Any]]:
    """Extract the JSON project config from the AI response if present."""
    import re

    # Look for ```json:project_config ... ```
    pattern = r'```json:project_config\s*\n(.*?)```'
    match = re.search(pattern, text, re.DOTALL)
    if not match:
        # Also try plain ```json with "ready": true
        pattern2 = r'```json\s*\n(\{[^`]*"ready"\s*:\s*true[^`]*\})```'
        match = re.search(pattern2, text, re.DOTALL)

    if not match:
        return None

    try:
        config = json.loads(match.group(1).strip())
        if config.get("ready") and config.get("name"):
            return config
    except json.JSONDecodeError:
        logger.warning("Failed to parse project config JSON from AI response")

    return None


def strip_config_block(text: str) -> str:
    """Remove the JSON config block from the display text."""
    import re
    text = re.sub(r'```json:project_config\s*\n.*?```', '', text, flags=re.DOTALL)
    text = re.sub(r'```json\s*\n\{[^`]*"ready"\s*:\s*true[^`]*\}```', '', text, flags=re.DOTALL)
    return text.strip()
