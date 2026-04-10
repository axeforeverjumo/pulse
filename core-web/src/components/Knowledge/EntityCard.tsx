import { useEffect, useState } from 'react';
import { getKnowledgeEntity } from '../../api/client';
import {
  UserIcon,
  BuildingOfficeIcon,
  FolderIcon,
  LightBulbIcon,
  LinkIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';

const factTypeIcons: Record<string, any> = {
  decision: CheckCircleIcon,
  action_item: ExclamationTriangleIcon,
  commitment: ClockIcon,
  preference: LightBulbIcon,
  context: LinkIcon,
  meeting_note: FolderIcon,
};

const factTypeColors: Record<string, string> = {
  decision: 'text-green-500',
  action_item: 'text-amber-500',
  commitment: 'text-blue-500',
  preference: 'text-purple-500',
  context: 'text-zinc-500',
  meeting_note: 'text-indigo-500',
};

interface Props {
  entity: any;
  workspaceId: string;
}

export default function EntityCard({ entity, workspaceId }: Props) {
  const [fullEntity, setFullEntity] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!entity?.id) return;
    setLoading(true);
    getKnowledgeEntity(entity.id, workspaceId)
      .then(setFullEntity)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [entity?.id, workspaceId]);

  const data = fullEntity || entity;
  const meta = data.metadata || {};
  const facts = data.facts || [];
  const relationships = data.relationships || [];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-500" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Type badge */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
          {data.entity_type}
        </span>
        {data.mentions_count > 0 && (
          <span className="text-xs text-zinc-400">{data.mentions_count} menciones</span>
        )}
      </div>

      {/* Metadata */}
      <div className="space-y-1.5">
        {meta.email && (
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            <span className="font-medium text-zinc-500">Email:</span> {meta.email}
          </p>
        )}
        {meta.role && (
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            <span className="font-medium text-zinc-500">Rol:</span> {meta.role}
          </p>
        )}
        {meta.organization && (
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            <span className="font-medium text-zinc-500">Organizacion:</span> {meta.organization}
          </p>
        )}
        {meta.domain && (
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            <span className="font-medium text-zinc-500">Dominio:</span> {meta.domain}
          </p>
        )}
        {meta.industry && (
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            <span className="font-medium text-zinc-500">Industria:</span> {meta.industry}
          </p>
        )}
        {meta.status && (
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            <span className="font-medium text-zinc-500">Estado:</span> {meta.status}
          </p>
        )}
        {meta.keywords && meta.keywords.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {meta.keywords.map((kw: string, i: number) => (
              <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                {kw}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      {data.content && (
        <div className="border-t border-zinc-200 dark:border-zinc-800 pt-3">
          <h4 className="text-xs font-semibold text-zinc-500 uppercase mb-1">Resumen</h4>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap">{data.content}</p>
        </div>
      )}

      {/* Facts */}
      {facts.length > 0 && (
        <div className="border-t border-zinc-200 dark:border-zinc-800 pt-3">
          <h4 className="text-xs font-semibold text-zinc-500 uppercase mb-2">
            Hechos ({facts.length})
          </h4>
          <div className="space-y-2">
            {facts.map((fact: any) => {
              const FactIcon = factTypeIcons[fact.fact_type] || LinkIcon;
              const colorClass = factTypeColors[fact.fact_type] || 'text-zinc-500';
              return (
                <div key={fact.id} className="flex items-start gap-2">
                  <FactIcon className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${colorClass}`} />
                  <div>
                    <span className="text-[10px] font-medium text-zinc-400 uppercase">{fact.fact_type.replace('_', ' ')}</span>
                    <p className="text-xs text-zinc-700 dark:text-zinc-300">{fact.content}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Relationships */}
      {relationships.length > 0 && (
        <div className="border-t border-zinc-200 dark:border-zinc-800 pt-3">
          <h4 className="text-xs font-semibold text-zinc-500 uppercase mb-2">
            Relaciones ({relationships.length})
          </h4>
          <div className="space-y-1.5">
            {relationships.map((rel: any, i: number) => {
              const related = rel.related_entity || {};
              return (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="text-zinc-400">{rel.relationship_type.replace('_', ' ')}</span>
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">{related.name || '?'}</span>
                  <span className="text-[10px] text-zinc-400">({related.entity_type})</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Source refs */}
      {data.source_refs && data.source_refs.length > 0 && (
        <div className="border-t border-zinc-200 dark:border-zinc-800 pt-3">
          <h4 className="text-xs font-semibold text-zinc-500 uppercase mb-1">
            Fuentes ({data.source_refs.length})
          </h4>
          <div className="flex flex-wrap gap-1">
            {[...new Set(data.source_refs.map((r: any) => r.source_type))].map((type: any) => (
              <span key={type} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                {type}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Last seen */}
      {data.last_seen_at && (
        <p className="text-[10px] text-zinc-400 pt-2 border-t border-zinc-200 dark:border-zinc-800">
          Ultima vez visto: {new Date(data.last_seen_at).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}
