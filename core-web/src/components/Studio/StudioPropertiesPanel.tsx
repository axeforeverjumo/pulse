import { useStudioStore } from '../../stores/studioStore';
import { Settings, Paintbrush, Zap, Trash2, Copy } from 'lucide-react';
import { registry } from './engine/registry';
import { findNode, updateNodeProps, removeNode, cloneTree, insertNode, findParent } from './engine/nodeFactory';
import type { ComponentNode, PropertyDefinition } from './engine/types';

export default function StudioPropertiesPanel() {
  const {
    selectedComponentId,
    componentTree,
    rightPanelTab,
    setRightPanelTab,
    updateTree,
    selectComponent,
  } = useStudioStore();

  const selectedNode = selectedComponentId && componentTree
    ? findNode(componentTree, selectedComponentId)
    : null;

  const def = selectedNode ? registry.get(selectedNode._component) : null;

  const handlePropChange = (key: string, value: unknown) => {
    if (!componentTree || !selectedComponentId) return;
    const newTree = updateNodeProps(componentTree, selectedComponentId, { [key]: value });
    updateTree(newTree);
  };

  const handleStyleChange = (key: string, value: string) => {
    if (!componentTree || !selectedNode) return;
    const currentStyles = (selectedNode._styles || {}) as Record<string, unknown>;
    const newTree = updateNodeProps(componentTree, selectedNode._id, {
      _styles: { ...currentStyles, [key]: value || undefined },
    });
    updateTree(newTree);
  };

  const handleDelete = () => {
    if (!componentTree || !selectedComponentId || selectedComponentId === componentTree._id) return;
    const newTree = removeNode(componentTree, selectedComponentId);
    updateTree(newTree);
    selectComponent(null);
  };

  const handleDuplicate = () => {
    if (!componentTree || !selectedNode || selectedNode._id === componentTree._id) return;
    const parentInfo = findParent(componentTree, selectedNode._id);
    if (!parentInfo) return;
    const clone = cloneTree(selectedNode);
    const newTree = insertNode(componentTree, clone, parentInfo.parent._id, parentInfo.index + 1);
    updateTree(newTree);
    selectComponent(clone._id);
  };

  return (
    <div className="w-[300px] shrink-0 bg-white border-l border-gray-200 flex flex-col overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {[
          { key: 'properties' as const, icon: Settings, label: 'Props' },
          { key: 'styles' as const, icon: Paintbrush, label: 'Estilos' },
          { key: 'events' as const, icon: Zap, label: 'Eventos' },
        ].map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setRightPanelTab(key)}
            className={`flex-1 flex items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
              rightPanelTab === key
                ? 'text-indigo-600 border-b-2 border-indigo-600'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {!selectedNode ? (
          <div className="text-center py-12">
            <Settings size={24} className="mx-auto text-gray-300 mb-2" />
            <p className="text-[12px] text-gray-400">Selecciona un componente</p>
            <p className="text-[10px] text-gray-300 mt-1">Haz click en el canvas para editar</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
              <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                {def?.name || selectedNode._component}
              </span>
              <div className="ml-auto flex gap-1">
                <button onClick={handleDuplicate} className="p-1 rounded hover:bg-gray-100 text-gray-400" title="Duplicar">
                  <Copy size={12} />
                </button>
                {selectedNode._id !== componentTree?._id && (
                  <button onClick={handleDelete} className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500" title="Eliminar">
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            </div>

            {rightPanelTab === 'properties' && def && (
              <PropertiesSection
                properties={def.properties.filter((p) => p.type !== 'event')}
                node={selectedNode}
                onChange={handlePropChange}
              />
            )}

            {rightPanelTab === 'styles' && (
              <StylesSection
                styles={(selectedNode._styles || {}) as Record<string, string>}
                onChange={handleStyleChange}
              />
            )}

            {rightPanelTab === 'events' && def && (
              <PropertiesSection
                properties={def.properties.filter((p) => p.type === 'event')}
                node={selectedNode}
                onChange={handlePropChange}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PropertiesSection({
  properties,
  node,
  onChange,
}: {
  properties: PropertyDefinition[];
  node: ComponentNode;
  onChange: (key: string, value: unknown) => void;
}) {
  if (properties.length === 0) {
    return <p className="text-[11px] text-gray-400 text-center py-4">Sin propiedades</p>;
  }

  // Group by section
  const sections = new Map<string, PropertyDefinition[]>();
  for (const prop of properties) {
    const sec = prop.section || 'General';
    if (!sections.has(sec)) sections.set(sec, []);
    sections.get(sec)!.push(prop);
  }

  return (
    <div className="space-y-4">
      {Array.from(sections.entries()).map(([section, props]) => (
        <div key={section}>
          {sections.size > 1 && (
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{section}</span>
          )}
          <div className="space-y-3 mt-1">
            {props.map((prop) => (
              <PropertyControl
                key={prop.key}
                definition={prop}
                value={node[prop.key]}
                onChange={(val) => onChange(prop.key, val)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PropertyControl({
  definition,
  value,
  onChange,
}: {
  definition: PropertyDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const { type, label, placeholder, options, defaultValue } = definition;
  const current = value ?? defaultValue ?? '';

  return (
    <div>
      <label className="block text-[10px] font-medium text-gray-500 mb-1">{label}</label>
      {(type === 'text' || type === 'expression' || type === 'size' || type === 'image' || type === 'icon') && (
        <input
          type="text"
          value={String(current)}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || ''}
          className={`w-full px-2 py-1.5 text-[12px] border border-gray-200 rounded-md focus:ring-1 focus:ring-indigo-500 outline-none ${
            type === 'expression' ? 'font-mono bg-gray-50' : ''
          }`}
        />
      )}
      {type === 'number' && (
        <input
          type="number"
          value={Number(current) || 0}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full px-2 py-1.5 text-[12px] border border-gray-200 rounded-md focus:ring-1 focus:ring-indigo-500 outline-none"
        />
      )}
      {type === 'boolean' && (
        <button
          onClick={() => onChange(!current)}
          className={`w-10 h-5 rounded-full transition-colors ${
            current ? 'bg-indigo-500' : 'bg-gray-300'
          }`}
        >
          <div
            className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${
              current ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      )}
      {type === 'select' && options && (
        <select
          value={String(current)}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-2 py-1.5 text-[12px] border border-gray-200 rounded-md focus:ring-1 focus:ring-indigo-500 outline-none bg-white"
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      )}
      {type === 'color' && (
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={String(current) || '#000000'}
            onChange={(e) => onChange(e.target.value)}
            className="w-7 h-7 rounded border border-gray-200 cursor-pointer"
          />
          <input
            type="text"
            value={String(current)}
            onChange={(e) => onChange(e.target.value)}
            placeholder="#000000"
            className="flex-1 px-2 py-1.5 text-[12px] border border-gray-200 rounded-md focus:ring-1 focus:ring-indigo-500 outline-none font-mono"
          />
        </div>
      )}
      {type === 'json' && (
        <textarea
          value={typeof current === 'string' ? current : JSON.stringify(current, null, 2)}
          onChange={(e) => {
            try { onChange(JSON.parse(e.target.value)); } catch { onChange(e.target.value); }
          }}
          rows={3}
          className="w-full px-2 py-1.5 text-[11px] font-mono border border-gray-200 rounded-md focus:ring-1 focus:ring-indigo-500 outline-none resize-y"
        />
      )}
      {type === 'event' && (
        <input
          type="text"
          value={String(current)}
          onChange={(e) => onChange(e.target.value)}
          placeholder="{{ accion }}"
          className="w-full px-2 py-1.5 text-[12px] font-mono bg-amber-50 border border-amber-200 rounded-md focus:ring-1 focus:ring-amber-500 outline-none"
        />
      )}
    </div>
  );
}

function StylesSection({
  styles,
  onChange,
}: {
  styles: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  const fields = [
    { key: 'width', label: 'Ancho', placeholder: 'auto' },
    { key: 'height', label: 'Alto', placeholder: 'auto' },
    { key: 'minHeight', label: 'Alto min.', placeholder: 'auto' },
    { key: 'padding', label: 'Padding', placeholder: '0px' },
    { key: 'margin', label: 'Margin', placeholder: '0px' },
    { key: 'backgroundColor', label: 'Fondo', placeholder: 'transparent' },
    { key: 'borderRadius', label: 'Borde radius', placeholder: '0px' },
    { key: 'border', label: 'Borde', placeholder: 'none' },
    { key: 'opacity', label: 'Opacidad', placeholder: '1' },
    { key: 'overflow', label: 'Overflow', placeholder: 'visible' },
  ];

  return (
    <div className="space-y-3">
      {fields.map(({ key, label, placeholder }) => (
        <div key={key}>
          <label className="block text-[10px] font-medium text-gray-500 mb-1">{label}</label>
          <input
            type="text"
            value={styles[key] || ''}
            onChange={(e) => onChange(key, e.target.value)}
            placeholder={placeholder}
            className="w-full px-2 py-1.5 text-[12px] border border-gray-200 rounded-md focus:ring-1 focus:ring-indigo-500 outline-none font-mono"
          />
        </div>
      ))}
    </div>
  );
}
