import { useState, useEffect, lazy, Suspense } from 'react';
import { useParams } from 'react-router-dom';
import {
  MagnifyingGlassIcon,
  UserGroupIcon,
  BuildingOfficeIcon,
  LightBulbIcon,
  FolderIcon,
  ShareIcon,
  ArrowPathIcon,
  PlusIcon,
  XMarkIcon,
  ClockIcon,
  CalendarDaysIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useKnowledgeStore } from '../../stores/knowledgeStore';
import GraphVisualization from './GraphVisualization';
import EntityCard from './EntityCard';
import KnowledgeSearch from './KnowledgeSearch';
import EntityList from './EntityList';
import LiveNotesView from '../LiveNotes/LiveNotesView';
import MeetingPrepView from './MeetingPrepView';
import { HeaderButtons } from '../MiniAppHeader';
import { toast } from 'sonner';

const tabs = [
  { id: 'graph' as const, label: 'Grafo', icon: ShareIcon },
  { id: 'people' as const, label: 'Personas', icon: UserGroupIcon },
  { id: 'organizations' as const, label: 'Organizaciones', icon: BuildingOfficeIcon },
  { id: 'projects' as const, label: 'Proyectos', icon: FolderIcon },
  { id: 'topics' as const, label: 'Temas', icon: LightBulbIcon },
  { id: 'search' as const, label: 'Buscar', icon: MagnifyingGlassIcon },
  { id: 'live-notes' as const, label: 'Live Notes', icon: ClockIcon },
  { id: 'meeting-prep' as const, label: 'Meeting Prep', icon: CalendarDaysIcon },
];

export default function KnowledgeView() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const {
    activeView,
    setActiveView,
    selectedEntity,
    setSelectedEntity,
    isBuilding,
    triggerBuild,
    fetchBuildStatus,
    buildStates,
    fetchGraph,
    fetchEntities,
  } = useKnowledgeStore();

  useEffect(() => {
    if (!workspaceId) return;
    fetchBuildStatus(workspaceId);
    if (activeView === 'graph') {
      fetchGraph(workspaceId);
    } else if (!['search', 'live-notes', 'meeting-prep'].includes(activeView)) {
      const typeMap: Record<string, string> = {
        people: 'person',
        organizations: 'organization',
        projects: 'project',
        topics: 'topic',
      };
      fetchEntities(workspaceId, typeMap[activeView]);
    }
  }, [workspaceId, activeView]);

  const handleBuild = async () => {
    if (!workspaceId) return;
    toast.info('Construyendo Knowledge Graph...');
    await triggerBuild(workspaceId);
    toast.success('Build iniciado en segundo plano');
  };

  const totalEntities = buildStates.reduce((sum: number, s: any) => sum + (s.entities_created || 0), 0);
  const lastBuild = buildStates.length > 0
    ? new Date(Math.max(...buildStates.map((s: any) => new Date(s.updated_at || 0).getTime()))).toLocaleString()
    : 'Nunca';

  return (
    <div className="flex flex-col h-full bg-white dark:bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <ShareIcon className="w-5 h-5 text-indigo-500" />
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Knowledge Graph</h1>
          <span className="text-xs text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
            {totalEntities} entidades
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400">Ultimo build: {lastBuild}</span>
          <button
            onClick={handleBuild}
            disabled={isBuilding}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-400 dark:hover:bg-indigo-500/20 disabled:opacity-50 transition-colors"
          >
            <ArrowPathIcon className={`w-3.5 h-3.5 ${isBuilding ? 'animate-spin' : ''}`} />
            {isBuilding ? 'Construyendo...' : 'Build'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-6 py-2 border-b border-zinc-200 dark:border-zinc-800 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveView(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              activeView === tab.id
                ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400'
                : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 dark:hover:text-zinc-300'
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Main content */}
        <div className="flex-1 overflow-auto">
          {activeView === 'graph' && workspaceId && (
            <GraphVisualization
              workspaceId={workspaceId}
              onSelectEntity={(entity) => setSelectedEntity(entity)}
            />
          )}
          {activeView === 'search' && workspaceId && (
            <KnowledgeSearch
              workspaceId={workspaceId}
              onSelectEntity={(entity) => setSelectedEntity(entity)}
            />
          )}
          {['people', 'organizations', 'projects', 'topics'].includes(activeView) && workspaceId && (
            <EntityList
              workspaceId={workspaceId}
              entityType={activeView === 'people' ? 'person' : activeView === 'organizations' ? 'organization' : activeView === 'projects' ? 'project' : 'topic'}
              onSelectEntity={(entity) => setSelectedEntity(entity)}
            />
          )}
          {activeView === 'live-notes' && workspaceId && (
            <LiveNotesView />
          )}
          {activeView === 'meeting-prep' && workspaceId && (
            <MeetingPrepView workspaceId={workspaceId} />
          )}
        </div>

        {/* Detail panel */}
        {selectedEntity && (
          <div className="w-96 border-l border-zinc-200 dark:border-zinc-800 overflow-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                {selectedEntity.name}
              </h3>
              <button
                onClick={() => setSelectedEntity(null)}
                className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <XMarkIcon className="w-4 h-4 text-zinc-500" />
              </button>
            </div>
            <EntityCard entity={selectedEntity} workspaceId={workspaceId!} />
          </div>
        )}
      </div>
    </div>
  );
}
