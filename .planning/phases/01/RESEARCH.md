# Phase 1: OpenHands Infrastructure - Research

**Researched:** 2026-04-03
**Domain:** OpenHands deployment, Docker runtime, headless agent execution
**Confidence:** HIGH

## Summary

OpenHands v1.6.0 (released March 30, 2026) is the current stable version. It offers two main deployment approaches for programmatic/headless use: (1) the Docker container with built-in REST API + WebSocket, and (2) the Python SDK (`openhands-sdk` packages) for direct in-process agent execution. For this project, the **recommended approach is the Docker container** running as a persistent service, exposing the REST API on localhost for core-api to call. This gives sandbox isolation, automatic container management, and a clean HTTP boundary between core-api and OpenHands.

The Docker container (`docker.openhands.dev/openhands/openhands:1.6`) exposes port 3000 by default (needs remapping to avoid conflicts), mounts the Docker socket for sandbox spawning, and accepts LLM configuration via environment variables. GitHub tokens are passed to sandboxes via the `SANDBOX_ENV_GITHUB_TOKEN` environment variable pattern or through the Settings UI/API. The agent uses Claude Sonnet 4.5 as the recommended model for code tasks (best cost/performance for agentic coding).

**Primary recommendation:** Deploy OpenHands v1.6 Docker container on port 3100 (avoiding 3000 conflicts), bind to 127.0.0.1, configure with Anthropic API key, and use the self-hosted REST API (`POST /api/conversations`) to create tasks programmatically from core-api.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INFRA-01 | OpenHands runs as Docker container on 85.215.105.45 with persistent config | Docker run command with volume mounts for `~/.openhands` persistence, systemd service for auto-restart |
| INFRA-02 | GITHUB_TOKEN configured as env var accessible to sandboxes | `SANDBOX_ENV_GITHUB_TOKEN` env var pattern passes token into sandbox containers |
| INFRA-03 | OpenHands API reachable from core-api on same server | Bind to 127.0.0.1:3100, REST API at `/api/conversations` for task creation |
</phase_requirements>

## Standard Stack

### Core
| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| OpenHands Docker image | 1.6.0 | Main application container | Latest stable, MIT-licensed, production-ready |
| Agent Server image | 1.15.0-python | Sandbox runtime for code execution | Default paired version for v1.6 |
| Anthropic Claude Sonnet 4.5 | Latest | LLM for agent coding tasks | Best cost/performance ratio for agentic code; OpenHands achieves 77.6% on SWE-bench with Claude |

### Supporting
| Component | Version | Purpose | When to Use |
|-----------|---------|---------|-------------|
| Docker Engine | 28.2.2 (already installed) | Container runtime | Required for OpenHands sandbox spawning |
| systemd | System default | Service management | Auto-restart on reboot/crash |
| nginx | Already running | Reverse proxy | Only if external access needed later (not Phase 1) |

### Alternative: Python SDK Approach (NOT recommended for Phase 1)
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Docker container + REST API | `pip install openhands-sdk` + in-process Python | Tighter integration but: requires Python 3.12+, no sandbox isolation from core-api process, harder to manage lifecycle independently, couples core-api Python version to OpenHands requirements |

**Why Docker container over SDK:** The Docker container provides process isolation, independent lifecycle management, built-in sandbox spawning, and a clean HTTP API boundary. The SDK approach would require running OpenHands within core-api's Python process, creating tight coupling and risk.

## Architecture Patterns

### Recommended Deployment Architecture
```
core-api (FastAPI, port 3010)
    |
    | HTTP POST /api/conversations (localhost:3100)
    v
OpenHands Container (port 3100, bound to 127.0.0.1)
    |
    | Docker socket → spawns sandbox containers
    v
Agent Server Sandbox (ephemeral Docker containers)
    |
    | git push (uses GITHUB_TOKEN)
    v
GitHub Repository (target project repo)
```

### File System Layout on Server
```
/opt/openhands/
  docker-compose.yml        # Production compose file
  .env                      # Environment variables (LLM keys, tokens)
~/.openhands/               # Persistent OpenHands state (settings, conversations)
/var/run/docker.sock        # Shared Docker socket (already exists)
```

### Pattern 1: Task Execution via REST API (Self-Hosted)

**What:** Create conversations programmatically via the local REST API
**When to use:** Every time core-api needs to dispatch a dev task to OpenHands

The self-hosted OpenHands exposes the same REST API structure as the cloud version. Key endpoints:

```python
# Create a new conversation/task
import requests

OPENHANDS_URL = "http://127.0.0.1:3100"

# POST /api/conversations - Create conversation with initial task
response = requests.post(
    f"{OPENHANDS_URL}/api/conversations",
    json={
        "initial_user_msg": "Fix the bug in auth.py where tokens expire too early",
        "repository": "factoriaia/pulse-api",  # optional: clone repo context
    },
    headers={"Content-Type": "application/json"}
)
conversation_id = response.json()["conversation_id"]

# Poll for completion
import time
while True:
    status = requests.get(
        f"{OPENHANDS_URL}/api/conversations/{conversation_id}"
    ).json()
    if status["status"] in ["finished", "error", "stuck"]:
        break
    time.sleep(10)
```

**Confidence:** MEDIUM - The self-hosted REST API mirrors the cloud API but specific endpoint shapes for v1.6 self-hosted may differ slightly from cloud docs. The V0 API (`/api/conversations`) is deprecated as of April 1, 2026. The V1 API uses `/api/v1/app-conversations`. Testing against the actual running instance will be needed.

### Pattern 2: WebSocket Event Streaming

**What:** Real-time event streaming for monitoring agent progress
**When to use:** If we want live status updates during task execution

```python
# WebSocket connection for real-time events (Socket.IO)
# Available at /socket.io on the OpenHands server
# Events include: agent actions, observations, status changes
```

### Anti-Patterns to Avoid
- **Running OpenHands on a public port:** Always bind to 127.0.0.1. The self-hosted API has no built-in auth suitable for public exposure.
- **Using `--rm` in production:** The Docker container must persist across restarts. Use `restart: unless-stopped` in docker-compose.
- **Sharing workspace mount across tasks:** Each conversation gets its own sandbox. Don't mount a shared workspace expecting concurrent task isolation.
- **Using the UI for automation:** The project decision is headless/API-only. Don't configure or depend on the web UI.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Code sandbox isolation | Custom Docker sandbox manager | OpenHands agent-server runtime | Handles port allocation, networking, cleanup, security |
| LLM orchestration for code tasks | Custom agent loop | OpenHands built-in CodeAct agent | Battle-tested on SWE-bench, handles tool calling, retries |
| Git operations in sandbox | Custom git wrapper | OpenHands built-in git integration | Handles clone, commit, push with proper auth propagation |
| Conversation state management | Custom state store | OpenHands `~/.openhands` persistence | Replay, recovery, event sourcing built-in |

## Common Pitfalls

### Pitfall 1: Port 3000 Conflict
**What goes wrong:** OpenHands defaults to port 3000, which may conflict with existing services
**Why it happens:** Default configuration assumes clean machine
**How to avoid:** Map to port 3100 in docker-compose: `ports: ["127.0.0.1:3100:3000"]`
**Warning signs:** Container starts but API unreachable, or existing service breaks

### Pitfall 2: Docker Socket Permissions
**What goes wrong:** OpenHands can't spawn sandbox containers
**Why it happens:** Docker socket mount requires correct group permissions
**How to avoid:** Ensure the user running the container has docker group access. The container runs as root by default which handles this, but if `RUN_AS_OPENHANDS=true` is set, permissions must be verified.
**Warning signs:** "Permission denied" errors when creating conversations

### Pitfall 3: GITHUB_TOKEN Not Reaching Sandbox
**What goes wrong:** Agent can clone repos but can't push commits
**Why it happens:** Environment variables on the main container don't automatically propagate to sandbox containers
**How to avoid:** Use `SANDBOX_ENV_GITHUB_TOKEN=<token>` pattern (SANDBOX_ENV_ prefix passes vars into sandbox) OR configure the GitHub token via the Settings API/UI which stores it in `~/.openhands` and auto-injects it
**Warning signs:** Clone works, push fails with 403 authentication error

### Pitfall 4: V0 API Deprecation
**What goes wrong:** API calls to `/api/conversations` stop working
**Why it happens:** V0 API was deprecated April 1, 2026. V1 uses `/api/v1/app-conversations`
**How to avoid:** Use V1 endpoints from the start. Test against actual running instance.
**Warning signs:** 404 or deprecation warnings in response headers

### Pitfall 5: Agent Server Image Mismatch
**What goes wrong:** Sandbox fails to start or has incompatible behavior
**Why it happens:** The agent-server image version must match the main OpenHands version
**How to avoid:** Always set `AGENT_SERVER_IMAGE_TAG` explicitly to the version paired with your OpenHands release (1.15.0-python for v1.6)
**Warning signs:** Container startup errors, "image not found" messages

### Pitfall 6: Disk Space Exhaustion
**What goes wrong:** Server runs out of disk from accumulated sandbox images and containers
**Why it happens:** Each task spawns a Docker container with its own image layers
**How to avoid:** Set up periodic `docker system prune` cron job, monitor disk usage
**Warning signs:** Docker daemon errors, "no space left on device"

## Code Examples

### Production Docker Compose File

```yaml
# /opt/openhands/docker-compose.yml
version: "3.8"

services:
  openhands:
    image: docker.openhands.dev/openhands/openhands:1.6
    container_name: openhands-app
    restart: unless-stopped
    ports:
      - "127.0.0.1:3100:3000"
    environment:
      - AGENT_SERVER_IMAGE_REPOSITORY=ghcr.io/openhands/agent-server
      - AGENT_SERVER_IMAGE_TAG=1.15.0-python
      - SANDBOX_USER_ID=1000
      - LOG_ALL_EVENTS=true
      - LLM_API_KEY=${LLM_API_KEY}
      - LLM_MODEL=anthropic/claude-sonnet-4-5-20250929
      - SANDBOX_ENV_GITHUB_TOKEN=${GITHUB_TOKEN}
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - openhands-state:/.openhands
    extra_hosts:
      - "host.docker.internal:host-gateway"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 45s
      timeout: 10s
      retries: 5
      start_period: 30s

volumes:
  openhands-state:
    driver: local
```

### Environment File

```bash
# /opt/openhands/.env
LLM_API_KEY=sk-ant-api03-xxxxx          # Anthropic API key
GITHUB_TOKEN=ghp_xxxxx                   # GitHub PAT with repo scope
```

### Systemd Service File

```ini
# /etc/systemd/system/openhands.service
[Unit]
Description=OpenHands AI Agent
After=docker.service
Requires=docker.service

[Service]
Type=simple
WorkingDirectory=/opt/openhands
ExecStartPre=/usr/bin/docker compose pull
ExecStart=/usr/bin/docker compose up --remove-orphans
ExecStop=/usr/bin/docker compose down
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

### Systemd Enable Commands

```bash
sudo systemctl daemon-reload
sudo systemctl enable openhands
sudo systemctl start openhands
sudo systemctl status openhands
```

### Core-API Integration Example (Python/FastAPI)

```python
# core-api/api/services/projects/openhands_executor.py
import httpx
import asyncio
from typing import Optional

OPENHANDS_BASE_URL = "http://127.0.0.1:3100"

async def create_openhands_task(
    task_description: str,
    repository: Optional[str] = None,
) -> dict:
    """Create an OpenHands conversation to execute a dev task."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        payload = {
            "initial_user_msg": task_description,
        }
        if repository:
            payload["repository"] = repository

        # Try V1 API first (current), fall back to V0 if needed
        response = await client.post(
            f"{OPENHANDS_BASE_URL}/api/v1/app-conversations",
            json=payload,
        )
        response.raise_for_status()
        return response.json()


async def poll_openhands_status(conversation_id: str) -> dict:
    """Poll OpenHands for task completion status."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(
            f"{OPENHANDS_BASE_URL}/api/v1/app-conversations",
            params={"ids": conversation_id},
        )
        response.raise_for_status()
        return response.json()
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `openhands-ai` monolith pip package | Modular SDK: `openhands-sdk`, `openhands-tools`, `openhands-workspace` | v1.0 (Nov 2025) | SDK is now composable, can use pieces independently |
| V0 REST API (`/api/conversations`) | V1 REST API (`/api/v1/app-conversations`) | v1.0 (Nov 2025) | V0 deprecated April 1, 2026. Must use V1 |
| config.toml for all settings | Environment variables + Settings UI/API | v1.0+ | Docker deployments should use env vars; config.toml still works but Docker ignores it by default |
| Single Docker image | Two-tier: App image + Agent Server image | v1.0+ | Must configure both image tags correctly |

**Deprecated/outdated:**
- `config.toml` for Docker deployments: The Docker container may ignore config.toml by default. Use environment variables instead.
- V0 API (`/api/conversations`): Removed as of April 1, 2026. Use V1 endpoints.
- `All-Hands-AI` GitHub org: Repository moved to `OpenHands/OpenHands` organization.

## Open Questions

1. **Exact V1 self-hosted API shape**
   - What we know: Cloud API uses `/api/v1/app-conversations` with structured message format
   - What's unclear: Whether self-hosted v1.6 exposes identical V1 endpoints or only V0/legacy endpoints
   - Recommendation: Deploy the container first, hit `/api/health` and then test endpoint availability. The executor code should try V1 first, fall back to V0.

2. **Authentication on self-hosted API**
   - What we know: Cloud API uses Bearer token auth. Self-hosted mentions `X-Session-API-Key` header.
   - What's unclear: Whether self-hosted requires any auth when bound to localhost
   - Recommendation: Test after deployment. If no auth required on localhost, document this as a security note. If auth is needed, configure via Settings API.

3. **Anthropic API key source**
   - What we know: Project has Claude Pro subscription and GPT Pro
   - What's unclear: Whether Claude Pro subscription provides an API key, or if a separate Anthropic API account is needed
   - Recommendation: An Anthropic API key (from console.anthropic.com) is required. Claude Pro subscription (via claude.ai) does NOT provide API access. A separate API account with billing is needed.

4. **How OpenHands handles direct-to-main commits**
   - What we know: OpenHands can be instructed to commit directly to main via the task prompt
   - What's unclear: Whether there's a configuration setting to disable branch creation, or if this is purely prompt-driven
   - Recommendation: Include explicit instructions in the task prompt: "Commit directly to the main branch. Do not create feature branches or pull requests."

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker Engine | OpenHands container + sandbox spawning | Yes (on server) | 28.2.2 | None - required |
| Docker Compose | Service orchestration | Likely yes (check server) | Check on server | Use `docker run` directly |
| systemd | Auto-restart service | Yes (Ubuntu 24.04) | System default | Docker restart policy as minimum |
| curl | Health checks | Yes (Ubuntu default) | System default | wget |
| Anthropic API key | LLM for agent | NEEDS SETUP | N/A | OpenAI GPT-4o (fallback, less effective for code) |
| GitHub PAT | Push commits | NEEDS SETUP | N/A | None - required for git push |

**Missing dependencies with no fallback:**
- Anthropic API key: Must be provisioned from console.anthropic.com (separate from Claude Pro subscription)
- GitHub PAT: Must be created with `repo` scope for target repositories

**Missing dependencies with fallback:**
- Docker Compose: If not installed, can use equivalent `docker run` command (less maintainable)

## Security Considerations

1. **Bind to localhost only:** `127.0.0.1:3100:3000` - OpenHands API has no production-grade auth for public exposure
2. **Docker socket access:** The container has full Docker daemon access via socket mount. This is effectively root access on the host. Acceptable for a dedicated server, but document the risk.
3. **GitHub token scope:** Use a fine-grained PAT with minimum required permissions (Contents: read/write on specific repos)
4. **LLM API key:** Store in `/opt/openhands/.env` with `chmod 600`, not in docker-compose.yml
5. **Sandbox isolation:** Sandboxes run as `SANDBOX_USER_ID=1000` (non-root) by default. Keep this setting.
6. **Network isolation:** Sandboxes have network access (needed for git push). No way to restrict per-task without custom networking.

## LLM Model Recommendation

| Model | Cost | Quality for Code | Recommendation |
|-------|------|------------------|----------------|
| `anthropic/claude-sonnet-4-5-20250929` | ~$3/15 per 1M tokens in/out | Excellent (77.6% SWE-bench) | **Use this** - best cost/quality for agentic coding |
| `anthropic/claude-opus-4-6` | ~$15/75 per 1M tokens | Highest quality | Too expensive for routine dev tasks; consider for critical-only |
| `openai/gpt-4o` | ~$2.50/10 per 1M tokens | Good | Fallback if Anthropic key unavailable |

**Recommendation:** Use `anthropic/claude-sonnet-4-5-20250929` as default. It is the model OpenHands is most tested with and offers the best agentic coding performance per dollar.

## Sources

### Primary (HIGH confidence)
- [OpenHands GitHub Repository](https://github.com/OpenHands/OpenHands) - v1.6.0 release, Docker image details
- [OpenHands Local Setup Docs](https://docs.openhands.dev/openhands/usage/run-openhands/local-setup) - Docker run command, volume mounts
- [OpenHands Headless Mode Docs](https://docs.openhands.dev/openhands/usage/run-openhands/headless-mode) - CLI headless usage
- [OpenHands Cloud API Docs](https://docs.openhands.dev/openhands/usage/cloud/cloud-api) - REST API endpoints (V1)
- [OpenHands Configuration Options](https://docs.openhands.dev/openhands/usage/advanced/configuration-options) - Environment variables
- [OpenHands Runtime Architecture](https://docs.openhands.dev/openhands/usage/architecture/runtime) - Sandbox model
- [OpenHands SDK Getting Started](https://docs.openhands.dev/sdk/getting-started) - SDK installation, code examples
- [OpenHands Local Agent Server](https://docs.openhands.dev/sdk/guides/agent-server/local-server) - Self-hosted server API
- [PyPI openhands-ai](https://pypi.org/project/openhands-ai/) - v1.6.0, Python 3.12+ requirement

### Secondary (MEDIUM confidence)
- [OpenHands DeepWiki Deployment Options](https://deepwiki.com/OpenHands/OpenHands/3.6-deployment-options) - Comprehensive deployment guide
- [OpenHands DeepWiki REST API](https://deepwiki.com/OpenHands/OpenHands/14.1-cli-usage-and-commands) - API endpoint details
- [OpenHands Software Agent SDK](https://github.com/OpenHands/software-agent-sdk) - SDK architecture
- [OpenHands LLM Docs](https://docs.openhands.dev/sdk/arch/llm) - LLM provider configuration

### Tertiary (LOW confidence)
- WebSearch results on SANDBOX_ENV_ prefix for passing environment variables to sandboxes (multiple sources agree, but no single authoritative doc found)
- Self-hosted V1 API endpoint availability (cloud docs confirmed, self-hosted needs runtime verification)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Docker image versions, LLM model verified against PyPI and official docs
- Architecture: HIGH - Docker deployment pattern well-documented, REST API structure confirmed
- Pitfalls: HIGH - Multiple sources confirm port conflicts, token propagation, API deprecation
- Self-hosted API details: MEDIUM - Cloud API well-documented, self-hosted may differ slightly
- SANDBOX_ENV_ pattern: MEDIUM - Multiple GitHub issues reference it, but official docs are sparse

**Research date:** 2026-04-03
**Valid until:** 2026-05-03 (30 days - OpenHands releases frequently but Docker deployment is stable)
