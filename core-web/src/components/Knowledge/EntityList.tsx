import { useEffect, useState } from 'react';
import { useKnowledgeStore } from '../../stores/knowledgeStore';
import {
  UserIcon,
  BuildingOfficeIcon,
  FolderIcon,
  LightBulbIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';

const typeIcons: Record<string, any> = {
  person: UserIcon,
  organization: BuildingOfficeIcon,
  project: FolderIcon,
  topic: LightBulbIcon,
};

const typeColors: Record<string, string> = {
  person: 'bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400',
  organization: 'bg-purple-100 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400',
  project: 'bg-green-100 text-green-600 dark:bg-green-500/10 dark:text-green-400',
  topic: 'bg-amber-100 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
};

interface Props {
  workspaceId: string;
  entityType: string;
  onSelectEntity: (entity: any) => void;
}

export default function EntityList({ workspaceId, entityType, onSelectEntity }: Props) {
  const { entities, isLoading, fetchEntities, totalCount } = useKnowledgeStore();
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchEntities(workspaceId, entityType, search || undefined);
  }, [workspaceId, entityType, search]);

  const Icon = typeIcons[entityType] || LightBulbIcon;
  const colorClass = typeColors[entityType] || typeColors.topic;

  return (
    <div className="p-6">
      {/* Search */}
      <div className="relative mb-4">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
        <input
          type="text"
          placeholder={`Buscar ${entityType}s...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
        />
      </div>

      <p className="text-xs text-zinc-500 mb-3">{totalCount} resultados</p>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500" />
        </div>
      ) : entities.length === 0 ? (
        <div className="text-center py-12 text-zinc-500 text-sm">
          No hay {entityType}s en el Knowledge Graph.
          <br />
          <span className="text-xs">Ejecuta un Build para extraer entidades de tus emails y calendario.</span>
        </div>
      ) : (
        <div className="space-y-2">
          {entities.map((entity: any) => {
            const meta = entity.metadata || {};
            return (
              <button
                key={entity.id}
                onClick={() => onSelectEntity(entity)}
                className="w-full text-left p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-indigo-300 dark:hover:border-indigo-500/30 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className={`p-1.5 rounded-lg ${colorClass}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                      {entity.name}
                    </h4>
                    {meta.email && (
                      <p className="text-xs text-zinc-500 truncate">{meta.email}</p>
                    )}
                    {meta.role && meta.organization && (
                      <p className="text-xs text-zinc-500 truncate">{meta.role} @ {meta.organization}</p>
                    )}
                    {meta.domain && (
                      <p className="text-xs text-zinc-500 truncate">{meta.domain}</p>
                    )}
                    {entity.content && (
                      <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{entity.content}</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="text-xs text-zinc-400">{entity.mentions_count || 0} menciones</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
