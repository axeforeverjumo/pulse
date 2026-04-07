import { useState } from 'react';
import { Plus, FileText, ChevronRight, Layers, LayoutGrid } from 'lucide-react';
import { useStudioStore } from '../../stores/studioStore';
import { useStudioPages, useCreateStudioPage } from '../../hooks/queries/useStudio';
import ComponentPalette from './panels/ComponentPalette';
import ComponentTree from './panels/ComponentTree';

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60) || 'page';
}

export default function StudioSidebar() {
  const { activeAppId, activePageId, setActivePage, leftPanelTab, setLeftPanelTab } = useStudioStore();
  const { data: pages } = useStudioPages(activeAppId);
  const createPage = useCreateStudioPage();

  const [newPageName, setNewPageName] = useState('');
  const [showNewPage, setShowNewPage] = useState(false);

  const handleCreatePage = async () => {
    if (!newPageName.trim() || !activeAppId) return;
    const slug = slugify(newPageName);
    try {
      const page = await createPage.mutateAsync({
        appId: activeAppId,
        data: { name: newPageName.trim(), slug, route: `/${slug}` },
      });
      setActivePage(page.id);
      setShowNewPage(false);
      setNewPageName('');
    } catch { /* handled by RQ */ }
  };

  return (
    <div className="w-[240px] shrink-0 bg-[#fafbfd] border-r border-gray-200 flex flex-col overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {[
          { key: 'components' as const, icon: LayoutGrid, label: 'Widgets' },
          { key: 'pages' as const, icon: FileText, label: 'Paginas' },
          { key: 'tree' as const, icon: Layers, label: 'Arbol' },
        ].map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setLeftPanelTab(key)}
            className={`flex-1 flex items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
              leftPanelTab === key
                ? 'text-indigo-600 border-b-2 border-indigo-600'
                : 'text-gray-400 hover:text-gray-600'
            }`}
            title={label}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {leftPanelTab === 'components' && (
          <ComponentPalette />
        )}

        {leftPanelTab === 'pages' && (
          <div className="space-y-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Paginas</span>
              <button
                onClick={() => setShowNewPage(!showNewPage)}
                className="p-1 rounded-md hover:bg-gray-200 text-gray-400"
              >
                <Plus size={13} />
              </button>
            </div>

            {showNewPage && (
              <div className="flex gap-1 mb-2">
                <input
                  type="text"
                  value={newPageName}
                  onChange={(e) => setNewPageName(e.target.value)}
                  placeholder="Nombre..."
                  className="flex-1 px-2 py-1 text-[12px] border border-gray-200 rounded-md focus:ring-1 focus:ring-indigo-500 outline-none"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleCreatePage()}
                />
                <button
                  onClick={handleCreatePage}
                  disabled={!newPageName.trim()}
                  className="px-2 py-1 text-[11px] bg-indigo-600 text-white rounded-md disabled:opacity-40"
                >
                  OK
                </button>
              </div>
            )}

            {pages?.map((page) => (
              <button
                key={page.id}
                onClick={() => setActivePage(page.id)}
                className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-[12px] transition-colors ${
                  activePageId === page.id
                    ? 'bg-indigo-50 text-indigo-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <FileText size={13} className="shrink-0" />
                <span className="truncate">{page.name}</span>
                {page.is_home && (
                  <span className="ml-auto text-[9px] bg-gray-200 text-gray-500 px-1 rounded">Home</span>
                )}
                <ChevronRight size={12} className="shrink-0 text-gray-300 ml-auto" />
              </button>
            ))}

            {(!pages || pages.length === 0) && !showNewPage && (
              <p className="text-[11px] text-gray-400 text-center py-4">Sin paginas</p>
            )}
          </div>
        )}

        {leftPanelTab === 'tree' && (
          <ComponentTree />
        )}
      </div>
    </div>
  );
}
