import { useState, useMemo, Children } from 'react';
import type { ComponentDefinition, RendererProps } from '../../engine/types';

interface TabDef {
  label: string;
  key: string;
}

function TabsRenderer({ node, resolvedProps, children, isEditing }: RendererProps) {
  const tabsRaw = resolvedProps.tabs;
  const defaultTab = (resolvedProps.defaultTab as string) || 'tab1';
  const variant = (resolvedProps.variant as string) || 'default';

  const tabs: TabDef[] = useMemo(() => {
    if (Array.isArray(tabsRaw)) return tabsRaw;
    if (typeof tabsRaw === 'string') {
      try { return JSON.parse(tabsRaw); } catch { return []; }
    }
    return [];
  }, [tabsRaw]);

  const [activeTab, setActiveTab] = useState(defaultTab);
  const childArray = Children.toArray(children);

  const getTabStyle = (isActive: boolean): React.CSSProperties => {
    const base: React.CSSProperties = {
      padding: '6px 14px',
      fontSize: '13px',
      fontWeight: isActive ? 600 : 400,
      cursor: 'pointer',
      border: 'none',
      background: 'none',
      transition: 'all 0.15s',
    };
    if (variant === 'underline') {
      return {
        ...base,
        borderBottom: isActive ? '2px solid #3B82F6' : '2px solid transparent',
        color: isActive ? '#3B82F6' : '#6B7280',
      };
    }
    if (variant === 'pills') {
      return {
        ...base,
        borderRadius: '9999px',
        background: isActive ? '#3B82F6' : 'transparent',
        color: isActive ? 'white' : '#6B7280',
      };
    }
    // default
    return {
      ...base,
      borderRadius: '8px 8px 0 0',
      background: isActive ? 'white' : '#F3F4F6',
      color: isActive ? '#111827' : '#6B7280',
      border: isActive ? '1px solid #E5E7EB' : '1px solid transparent',
      borderBottom: isActive ? '1px solid white' : '1px solid transparent',
      marginBottom: '-1px',
    };
  };

  return (
    <div style={{ width: '100%', ...node._styles }}>
      <div
        style={{
          display: 'flex',
          gap: '2px',
          ...(variant === 'underline' ? { borderBottom: '1px solid #E5E7EB' } : {}),
          ...(variant === 'default' ? { borderBottom: '1px solid #E5E7EB' } : {}),
          marginBottom: '8px',
        }}
      >
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={getTabStyle(activeTab === tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div>
        {isEditing ? (
          childArray.map((child, i) => (
            <div key={i} style={{ border: '1px dashed #E5E7EB', borderRadius: '8px', padding: '8px', marginBottom: '8px', position: 'relative' }}>
              <span style={{ position: 'absolute', top: '2px', left: '6px', fontSize: '10px', color: '#9CA3AF', fontWeight: 500 }}>
                {tabs[i]?.label || `Tab ${i + 1}`}
              </span>
              <div style={{ marginTop: '16px' }}>{child}</div>
            </div>
          ))
        ) : (
          childArray.map((child, i) => {
            const tab = tabs[i];
            if (!tab || tab.key !== activeTab) return null;
            return <div key={i}>{child}</div>;
          })
        )}
      </div>
    </div>
  );
}

const definition: ComponentDefinition = {
  type: 'Tabs',
  name: 'Pestanas',
  icon: 'PanelTop',
  category: 'advanced',
  hasChildren: true,
  properties: [
    {
      key: 'tabs',
      label: 'Pestanas',
      type: 'json',
      defaultValue: [{ label: 'Tab 1', key: 'tab1' }, { label: 'Tab 2', key: 'tab2' }],
    },
    { key: 'defaultTab', label: 'Tab por defecto', type: 'text', defaultValue: 'tab1' },
    {
      key: 'variant',
      label: 'Estilo',
      type: 'select',
      defaultValue: 'default',
      options: [
        { label: 'Default', value: 'default' },
        { label: 'Subrayado', value: 'underline' },
        { label: 'Pastillas', value: 'pills' },
      ],
    },
  ],
  component: TabsRenderer,
};

export default definition;
