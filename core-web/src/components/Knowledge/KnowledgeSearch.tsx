import { useState, useCallback } from 'react';
import { useKnowledgeStore } from '../../stores/knowledgeStore';
import {
  MagnifyingGlassIcon,
  UserIcon,
  BuildingOfficeIcon,
  FolderIcon,
  LightBulbIcon,
} from '@heroicons/react/24/outline';

const typeIcons: Record<string, any> = {
  person: UserIcon,
  organization: BuildingOfficeIcon,
  project: FolderIcon,
  topic: LightBulbIcon,
};

interface Props {
  workspaceId: string;
  onSelectEntity: (entity: any) => void;
}

export default function KnowledgeSearch({ workspaceId, onSelectEntity }: Props) {
  const { searchResults, isLoading, search } = useKnowledgeStore();
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');

  const handleSearch = useCallback(() => {
    if (!query.trim()) return;
    search(workspaceId, query.trim(), typeFilter || undefined);
  }, [workspaceId, query, typeFilter]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  return (
    <div className="p-6">
      {/* Search bar */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Buscar personas, empresas, proyectos, decisiones..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full pl-10 pr-4 py-2.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300"
        >
          <option value="">Todos</option>
          <option value="person">Personas</option>
          <option value="organization">Organizaciones</option>
          <option value="project">Proyectos</option>
          <option value="topic">Temas</option>
        </select>
        <button
          onClick={handleSearch}
          disabled={isLoading || !query.trim()}
          className="px-4 py-2 text-xs font-medium rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-50 transition-colors"
        >
          Buscar
        </button>
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500" />
        </div>
      ) : searchResults.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-zinc-500 mb-3">{searchResults.length} resultados</p>
          {searchResults.map((entity: any) => {
            const Icon = typeIcons[entity.entity_type] || LightBulbIcon;
            const meta = entity.metadata || {};
            return (
              <button
                key={entity.id}
                onClick={() => onSelectEntity(entity)}
                className="w-full text-left p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-indigo-300 dark:hover:border-indigo-500/30 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <Icon className="w-4 h-4 text-zinc-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{entity.name}</h4>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                        {entity.entity_type}
                      </span>
                    </div>
                    {meta.email && <p className="text-xs text-zinc-500">{meta.email}</p>}
                    {meta.role && meta.organization && (
                      <p className="text-xs text-zinc-500">{meta.role} @ {meta.organization}</p>
                    )}
                    {entity.content && (
                      <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{entity.content}</p>
                    )}
                    {/* Inline facts */}
                    {entity.knowledge_facts && entity.knowledge_facts.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {entity.knowledge_facts.slice(0, 3).map((f: any) => (
                          <p key={f.id} className="text-[10px] text-zinc-400">
                            <span className="font-medium text-zinc-500">{f.fact_type}:</span> {f.content}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ) : query ? (
        <div className="text-center py-12 text-zinc-500 text-sm">
          No se encontraron resultados para "{query}"
        </div>
      ) : (
        <div className="text-center py-12 text-zinc-500 text-sm">
          Busca en el Knowledge Graph: personas, empresas, decisiones, compromisos...
          <br />
          <span className="text-xs text-zinc-400">Ejemplo: "que decidimos con Juan sobre el proyecto?"</span>
        </div>
      )}
    </div>
  );
}
