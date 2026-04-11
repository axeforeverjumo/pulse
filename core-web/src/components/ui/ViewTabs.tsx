/**
 * ViewTabs - Dynamic tab bar for agent-generated views.
 * Supports temporary (closeable), pinned, and draft states.
 * Renders above the main content area.
 */

import { useViewTabsStore, type ViewTab } from '../../stores/viewTabsStore';
import { Pin, X, FileText } from 'lucide-react';
import { Icon } from './Icon';

const stateIcons: Record<string, typeof Pin> = {
  draft: FileText,
};

export default function ViewTabs() {
  const tabs = useViewTabsStore((s) => s.tabs);
  const activeTabId = useViewTabsStore((s) => s.activeTabId);
  const setActiveTab = useViewTabsStore((s) => s.setActiveTab);
  const removeTab = useViewTabsStore((s) => s.removeTab);
  const pinTab = useViewTabsStore((s) => s.pinTab);
  const unpinTab = useViewTabsStore((s) => s.unpinTab);

  if (tabs.length === 0) return null;

  return (
    <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-border-light bg-bg-gray/30 overflow-x-auto shrink-0">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const StateIcon = stateIcons[tab.state];

        return (
          <div
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer transition-all border ${
              isActive
                ? 'bg-bg-white border-border-gray text-text-dark shadow-sm'
                : 'border-transparent text-text-tertiary hover:text-text-secondary hover:bg-bg-gray/50'
            }`}
          >
            {StateIcon && <Icon icon={StateIcon} size={12} />}
            {tab.state === 'pinned' && <Icon icon={Pin} size={10} className="text-brand-primary" />}
            <span className="truncate max-w-[120px]">{tab.title}</span>

            {/* Pin/close actions */}
            <div className="flex items-center gap-0.5 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {tab.state === 'temporary' && (
                <button
                  onClick={(e) => { e.stopPropagation(); pinTab(tab.id); }}
                  className="p-0.5 rounded hover:bg-bg-gray text-text-tertiary hover:text-brand-primary"
                  title="Anclar"
                >
                  <Icon icon={Pin} size={10} />
                </button>
              )}
              {tab.state === 'pinned' && (
                <button
                  onClick={(e) => { e.stopPropagation(); unpinTab(tab.id); }}
                  className="p-0.5 rounded hover:bg-bg-gray text-brand-primary"
                  title="Desanclar"
                >
                  <Icon icon={Pin} size={10} />
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); removeTab(tab.id); }}
                className="p-0.5 rounded hover:bg-bg-gray text-text-tertiary hover:text-red-500"
                title="Cerrar"
              >
                <Icon icon={X} size={10} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Renders the active tab's content using templates */
export function ViewTabContent() {
  const tabs = useViewTabsStore((s) => s.tabs);
  const activeTabId = useViewTabsStore((s) => s.activeTabId);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  if (!activeTab) return null;

  return (
    <div className="flex-1 overflow-auto p-4 animate-in fade-in duration-200">
      <TabTemplate tab={activeTab} />
    </div>
  );
}

function TabTemplate({ tab }: { tab: ViewTab }) {
  switch (tab.template) {
    case 'list':
      return <ListTemplate data={tab.data} />;
    case 'detail':
      return <DetailTemplate data={tab.data} />;
    case 'document':
      return <DocumentTemplate data={tab.data} />;
    default:
      return (
        <div className="text-center text-text-tertiary py-8">
          <p className="text-sm">Template "{tab.template}" pendiente de implementar</p>
        </div>
      );
  }
}

function ListTemplate({ data }: { data: Record<string, unknown> }) {
  const items = (data.items || []) as Array<{ title: string; subtitle?: string; status?: string; value?: string }>;
  const title = data.title as string || 'Lista';

  return (
    <div>
      <h3 className="text-sm font-bold text-text-dark mb-3">{title}</h3>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-center justify-between p-3 rounded-lg border border-border-light hover:border-border-gray transition-colors bg-bg-white">
            <div>
              <p className="text-[12px] font-medium text-text-dark">{item.title}</p>
              {item.subtitle && <p className="text-[10px] text-text-tertiary">{item.subtitle}</p>}
            </div>
            <div className="flex items-center gap-2">
              {item.status && (
                <span className="text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-bg-gray text-text-secondary">
                  {item.status}
                </span>
              )}
              {item.value && <span className="text-[12px] font-bold text-text-dark">{item.value}</span>}
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-text-tertiary text-center py-4">Sin datos</p>}
      </div>
    </div>
  );
}

function DetailTemplate({ data }: { data: Record<string, unknown> }) {
  const fields = (data.fields || []) as Array<{ label: string; value: string }>;
  const title = data.title as string || 'Detalle';

  return (
    <div>
      <h3 className="text-sm font-bold text-text-dark mb-3">{title}</h3>
      <div className="grid grid-cols-2 gap-2">
        {fields.map((f, i) => (
          <div key={i} className="p-3 rounded-lg border border-border-light bg-bg-white">
            <p className="text-[8px] font-bold uppercase tracking-[0.12em] text-text-tertiary mb-1">{f.label}</p>
            <p className="text-[12px] text-text-dark">{f.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DocumentTemplate({ data }: { data: Record<string, unknown> }) {
  const title = data.title as string || 'Documento';
  const content = data.content as string || '';

  return (
    <div className="max-w-2xl">
      <h3 className="text-lg font-bold text-text-dark mb-4">{title}</h3>
      <div className="prose prose-sm text-text-body" dangerouslySetInnerHTML={{ __html: content }} />
    </div>
  );
}
