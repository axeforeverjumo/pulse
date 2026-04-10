# Plan de Verificacion — Integracion Rowboat en Pulse

## Resumen de lo implementado

### Archivos creados: Backend (28 archivos)
```
core-api/supabase/migrations/20260411000003_knowledge_graph.sql
core-api/supabase/migrations/20260411000004_live_notes.sql
core-api/supabase/migrations/20260411000005_mcp_servers.sql
core-api/api/services/knowledge/__init__.py
core-api/api/services/knowledge/builder.py
core-api/api/services/knowledge/extractors.py
core-api/api/services/knowledge/index_builder.py
core-api/api/services/knowledge/search.py
core-api/api/services/knowledge/linker.py
core-api/api/services/knowledge/meeting_prep.py
core-api/api/services/knowledge/email_context.py
core-api/api/services/live_notes/__init__.py
core-api/api/services/live_notes/processor.py
core-api/api/services/documents/presentation.py
core-api/api/services/mcp/__init__.py
core-api/api/services/mcp/client.py
core-api/api/services/mcp/bridge.py
core-api/api/routers/knowledge.py
core-api/api/routers/live_notes.py
core-api/api/routers/mcp.py
core-api/lib/tools/definitions/knowledge.py
core-api/lib/tools/definitions/meeting_prep.py
core-api/lib/tools/definitions/doc_generator.py
```

### Archivos creados: Frontend (10 archivos)
```
core-web/src/stores/knowledgeStore.ts
core-web/src/stores/liveNotesStore.ts
core-web/src/components/Knowledge/KnowledgeView.tsx
core-web/src/components/Knowledge/GraphVisualization.tsx
core-web/src/components/Knowledge/EntityList.tsx
core-web/src/components/Knowledge/EntityCard.tsx
core-web/src/components/Knowledge/KnowledgeSearch.tsx
core-web/src/components/LiveNotes/LiveNotesView.tsx
core-web/src/components/Settings/MCPSettings.tsx
```

### Archivos modificados (5 archivos)
```
core-api/index.py                              — +3 routers (knowledge, live_notes, mcp)
core-api/lib/tools/definitions/__init__.py      — +3 tools (knowledge, meeting_prep, doc_generator)
core-web/src/App.tsx                            — +2 rutas + 2 lazy imports
core-web/src/api/client.ts                      — +15 API functions
core-web/src/components/Sidebar/Sidebar.tsx     — +1 app type (knowledge) + import Share2
```

---

## Pasos de Verificacion

### Paso 0: Pre-requisitos
```bash
# Verificar que el servidor esta corriendo
cd core-api
# Verificar importaciones
python -c "from api.routers import knowledge, live_notes, mcp; print('Routers OK')"
python -c "from lib.tools.definitions import knowledge, meeting_prep, doc_generator; print('Tools OK')"
python -c "from api.services.knowledge.builder import process_all_sources; print('Builder OK')"
python -c "from api.services.live_notes.processor import process_due_notes; print('LiveNotes OK')"
python -c "from api.services.mcp.client import connect_server; print('MCP OK')"
```

### Paso 1: Ejecutar Migrations
```bash
cd core-api
# Conectar a Supabase y ejecutar migrations
supabase db push

# Verificar tablas creadas
# En Supabase Dashboard o via SQL:
# SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'knowledge_%';
# SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'live_note%';
# SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename = 'mcp_servers';

# Esperado: knowledge_entities, knowledge_relationships, knowledge_facts, knowledge_build_state,
#           live_notes, live_note_updates, mcp_servers
```

### Paso 2: Verificar API (Backend)
```bash
# Reiniciar el servidor
make start  # o uvicorn index:app --reload

# Verificar que los endpoints estan registrados
curl http://localhost:8000/docs | grep -E "knowledge|live-notes|mcp"

# Test basico con auth token (reemplazar $TOKEN con JWT valido):
TOKEN="tu_jwt_aqui"
WORKSPACE="tu_workspace_id"

# Knowledge Graph
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/knowledge/entities?workspace_id=$WORKSPACE" | python -m json.tool

# Build status
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/knowledge/build/status?workspace_id=$WORKSPACE" | python -m json.tool

# Live Notes
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/live-notes?workspace_id=$WORKSPACE" | python -m json.tool

# MCP Servers
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/mcp/servers?workspace_id=$WORKSPACE" | python -m json.tool
```

### Paso 3: Knowledge Graph — Build Manual
```bash
# Trigger un build del knowledge graph
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"workspace_id": "'$WORKSPACE'"}' \
  "http://localhost:8000/api/knowledge/build" | python -m json.tool

# Esperar 30-60 segundos, luego verificar:
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/knowledge/build/status?workspace_id=$WORKSPACE" | python -m json.tool

# Verificar entidades extraidas:
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/knowledge/entities?workspace_id=$WORKSPACE" | python -m json.tool

# Verificar grafo:
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/knowledge/graph?workspace_id=$WORKSPACE" | python -m json.tool
```

### Paso 4: Knowledge Graph — Crear Entidad Manual
```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "workspace_id": "'$WORKSPACE'",
    "name": "Test Entity",
    "entity_type": "person",
    "metadata": {"email": "test@example.com", "role": "Developer"},
    "content": "Test person for verification"
  }' \
  "http://localhost:8000/api/knowledge/entities" | python -m json.tool
```

### Paso 5: Knowledge Graph — Busqueda
```bash
# Busqueda por texto
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/knowledge/search?workspace_id=$WORKSPACE&q=test" | python -m json.tool
```

### Paso 6: Meeting Prep
```bash
# Necesita un evento de calendario con attendees
# Si hay eventos:
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"workspace_id": "'$WORKSPACE'", "event_id": "EVENT_ID_AQUI"}' \
  "http://localhost:8000/api/knowledge/meeting-prep" | python -m json.tool
```

### Paso 7: Email Context
```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "workspace_id": "'$WORKSPACE'",
    "to_addresses": ["alguien@example.com"],
    "subject": "Test"
  }' \
  "http://localhost:8000/api/knowledge/email-context" | python -m json.tool
```

### Paso 8: Live Notes — Crear y Refrescar
```bash
# Crear una live note
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "workspace_id": "'$WORKSPACE'",
    "title": "Monitorizar Competencia",
    "description": "Seguimiento de competidores",
    "note_type": "competitor",
    "monitor_config": {
      "keywords": ["competencia", "alternativa"],
      "sources": ["email", "knowledge", "crm"],
      "frequency": "daily"
    }
  }' \
  "http://localhost:8000/api/live-notes" | python -m json.tool

# Refrescar manualmente (reemplazar NOTE_ID):
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/live-notes/NOTE_ID/refresh?workspace_id=$WORKSPACE" | python -m json.tool
```

### Paso 9: MCP Server — Registrar y Conectar
```bash
# Registrar un MCP server HTTP
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "workspace_id": "'$WORKSPACE'",
    "name": "test-server",
    "description": "Test MCP server",
    "server_type": "http",
    "config": {"url": "http://localhost:3001"}
  }' \
  "http://localhost:8000/api/mcp/servers" | python -m json.tool

# Listar servers:
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/mcp/servers?workspace_id=$WORKSPACE" | python -m json.tool
```

### Paso 10: Frontend — Verificacion Visual
```bash
cd core-web
npm run dev
# Abrir http://localhost:5173
```

**Verificar en el browser:**
1. [ ] Sidebar muestra icono "Knowledge" (Share2)
2. [ ] Click en Knowledge -> KnowledgeView carga con tabs (Grafo, Personas, Organizaciones, etc.)
3. [ ] Tab "Grafo" muestra canvas con leyenda (si hay entidades)
4. [ ] Tab "Personas" muestra lista filtrable
5. [ ] Tab "Buscar" permite busqueda con resultados
6. [ ] Boton "Build" en header ejecuta build y muestra spinner
7. [ ] Click en entidad abre panel lateral con EntityCard (metadata, facts, relationships)
8. [ ] Ruta /workspace/:id/live-notes carga LiveNotesView
9. [ ] Crear Live Note -> modal con campos (titulo, keywords, frecuencia)
10. [ ] Boton refresh en Live Note actualiza contenido

### Paso 11: Chat Tools — Verificacion
```
En el chat de Pulse, probar estos prompts:
1. "Busca en el knowledge graph sobre [persona/tema]"
   -> Debe usar tool search_knowledge

2. "Dame contexto sobre [persona]"
   -> Debe usar tool get_person_context

3. "Recuerda que decidimos [algo] sobre [proyecto]"
   -> Debe usar tool save_knowledge_fact

4. "Prepara un briefing para mi reunion de las [hora]"
   -> Debe usar tool prepare_meeting

5. "Genera una presentacion sobre [tema]"
   -> Debe usar tool generate_presentation

6. "Genera una propuesta para la oportunidad [nombre]"
   -> Debe usar tool generate_proposal
```

### Paso 12: Cron — Configurar
```bash
# Agregar a pulse-cron.sh:

# Knowledge Graph Builder (cada 5 min)
*/5 * * * * curl -s -X POST -H "Authorization: Bearer $SERVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"workspace_id": "'$WORKSPACE'"}' \
  http://localhost:8000/api/knowledge/build

# Live Notes processor (cada 15 min)
*/15 * * * * curl -s -X POST -H "Authorization: Bearer $SERVICE_TOKEN" \
  http://localhost:8000/api/live-notes/process

# Meeting prep auto (7am diario)
0 7 * * * curl -s -X POST -H "Authorization: Bearer $SERVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"workspace_id": "'$WORKSPACE'"}' \
  http://localhost:8000/api/knowledge/meeting-prep/auto
```

---

## Flujo E2E de Verificacion

1. **Ejecutar migrations** -> tablas creadas
2. **Build knowledge graph** -> entidades extraidas de emails existentes
3. **Verificar UI** -> grafo visible con nodos y relaciones
4. **Crear live note** -> monitorizar un tema
5. **Refrescar live note** -> contenido generado automaticamente
6. **Preparar meeting** -> briefing con contexto de attendees
7. **Usar chat** -> tools de knowledge funcionan correctamente
8. **Registrar MCP server** -> tools cacheados y visibles

## Notas

- El Knowledge Graph Builder necesita emails en la tabla `emails` para extraer entidades
- Meeting Prep necesita eventos en `calendar_events` con attendees
- Las embeddings usan `text-embedding-3-large` via el proxy OAuth en :10531
- Live Notes usan `gpt-4.1-mini` para generar contenido actualizado
- MCP requiere un servidor MCP externo corriendo para testing real
