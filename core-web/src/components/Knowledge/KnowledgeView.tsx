import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  MagnifyingGlassIcon,
  UserGroupIcon,
  BuildingOfficeIcon,
  LightBulbIcon,
  FolderIcon,
  XMarkIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { Share2 } from 'lucide-react';
import { useKnowledgeStore } from '../../stores/knowledgeStore';
import GraphVisualization from './GraphVisualization';
import EntityCard from './EntityCard';
import KnowledgeSearch from './KnowledgeSearch';
import EntityList from './EntityList';
import ViewTopBar from '../ui/ViewTopBar';
import { toast } from 'sonner';

const tabs = [
  { id: 'graph' as const, label: 'Grafo', icon: Share2 },
  { id: 'people' as const, label: 'Personas', icon: UserGroupIcon },
  { id: 'organizations' as const, label: 'Organizaciones', icon: BuildingOfficeIcon },
  { id: 'projects' as const, label: 'Proyectos', icon: FolderIcon },
  { id: 'topics' as const, label: 'Temas', icon: LightBulbIcon },
  { id: 'search' as const, label: 'Buscar', icon: MagnifyingGlassIcon },
];

export default function KnowledgeView() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
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
    } else if (activeView !== 'search') {
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

  return (
    <div className="flex-1 flex h-full min-w-0 overflow-hidden">
      <div className="relative flex-1 flex min-w-0 overflow-hidden rounded-[20px] bg-gradient-to-b from-[#f6fbff] to-[#edf4fb]">
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white/92 md:rounded-[20px]">
          <ViewTopBar
            title="Knowledge Graph"
            pill={{ label: `${totalEntities} entidades`, color: 'accent' }}
            cta={{ label: isBuilding ? 'Construyendo...' : 'Build', icon: <ArrowPathIcon className={`w-3.5 h-3.5 ${isBuilding ? 'animate-spin' : ''}`} />, onClick: handleBuild }}
            settingsButtonRef={settingsButtonRef}
          />

          {/* Tabs */}
          <div className="px-4 pt-3 pb-2 border-b border-[#e4edf8]">
            <div className="flex gap-1 p-0.5 rounded-xl bg-slate-100/80">
              {tabs.map((tab) => {
                const isActive = activeView === tab.id;
                const TabIcon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveView(tab.id)}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <TabIcon className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Content */}
          <div className="flex flex-1 min-h-0 overflow-hidden">
            <div className={`flex-1 ${activeView === 'graph' ? 'overflow-hidden' : 'overflow-auto'}`}>
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
            </div>

            {/* Detail panel */}
            {selectedEntity && (
              <div className="w-[360px] shrink-0 border-l border-[#e4edf8] overflow-auto bg-white hidden lg:block">
                <div className="h-12 flex items-center justify-between px-4 border-b border-[#e4edf8]">
                  <h3 className="text-sm font-semibold text-slate-900 truncate">{selectedEntity.name}</h3>
                  <button onClick={() => setSelectedEntity(null)} className="p-1 rounded hover:bg-slate-100">
                    <XMarkIcon className="w-4 h-4 text-slate-400" />
                  </button>
                </div>
                <EntityCard entity={selectedEntity} workspaceId={workspaceId!} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
