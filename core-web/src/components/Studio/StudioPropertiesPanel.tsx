import { useStudioStore, type ComponentNode } from '../../stores/studioStore';
import { Settings, Paintbrush, Zap } from 'lucide-react';

export default function StudioPropertiesPanel() {
  const { selectedComponentId, componentTree, rightPanelTab, setRightPanelTab, updateTree } = useStudioStore();

  const selectedNode = selectedComponentId && componentTree
    ? findNode(componentTree, selectedComponentId)
    : null;

  return (
    <div className="w-[300px] shrink-0 bg-white border-l border-gray-200 flex flex-col overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {[
          { key: 'properties' as const, icon: Settings, label: 'Propiedades' },
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
            <p className="text-[10px] text-gray-300 mt-1">Haz click en el canvas para editar propiedades</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Component info */}
            <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
              <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                {selectedNode._component}
              </span>
              <span className="text-[10px] text-gray-400 font-mono">{selectedNode._id.slice(0, 8)}</span>
            </div>

            {rightPanelTab === 'properties' && (
              <PropertiesTab node={selectedNode} onUpdate={(props) => {
                if (!componentTree) return;
                const newTree = updateNodeInTree(componentTree, selectedNode._id, props);
                updateTree(newTree);
              }} />
            )}

            {rightPanelTab === 'styles' && (
              <StylesTab node={selectedNode} onUpdate={(styles) => {
                if (!componentTree) return;
                const newTree = updateNodeInTree(componentTree, selectedNode._id, { _styles: { ...(selectedNode._styles || {}), ...styles } });
                updateTree(newTree);
              }} />
            )}

            {rightPanelTab === 'events' && (
              <div className="text-center py-8">
                <Zap size={20} className="mx-auto text-gray-300 mb-2" />
                <p className="text-[11px] text-gray-400">Eventos</p>
                <p className="text-[10px] text-gray-300">Proximamente — onClick, onChange, etc.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PropertiesTab({ node, onUpdate }: { node: ComponentNode; onUpdate: (props: Record<string, unknown>) => void }) {
  const comp = node._component;

  // Build property fields based on component type
  const fields: { key: string; label: string; type: 'text' | 'select'; options?: string[] }[] = [];

  if (comp === 'Container') {
    fields.push(
      { key: 'direction', label: 'Direccion', type: 'select', options: ['column', 'row'] },
      { key: 'gap', label: 'Gap', type: 'text' },
      { key: 'padding', label: 'Padding', type: 'text' },
    );
  } else if (comp === 'Text') {
    fields.push(
      { key: 'content', label: 'Contenido', type: 'text' },
      { key: 'variant', label: 'Variante', type: 'select', options: ['body', 'h1', 'h2', 'h3', 'h4', 'caption'] },
    );
  } else if (comp === 'Button') {
    fields.push(
      { key: 'label', label: 'Texto', type: 'text' },
      { key: 'variant', label: 'Variante', type: 'select', options: ['primary', 'secondary', 'outline', 'ghost'] },
      { key: 'size', label: 'Tamano', type: 'select', options: ['sm', 'md', 'lg'] },
    );
  } else if (comp === 'Input') {
    fields.push(
      { key: 'label', label: 'Etiqueta', type: 'text' },
      { key: 'placeholder', label: 'Placeholder', type: 'text' },
      { key: 'type', label: 'Tipo', type: 'select', options: ['text', 'email', 'password', 'number', 'tel'] },
    );
  } else if (comp === 'Image') {
    fields.push(
      { key: 'src', label: 'URL', type: 'text' },
      { key: 'alt', label: 'Alt', type: 'text' },
      { key: 'objectFit', label: 'Ajuste', type: 'select', options: ['cover', 'contain', 'fill', 'none'] },
    );
  }

  return (
    <div className="space-y-3">
      {fields.map(({ key, label, type, options }) => (
        <div key={key}>
          <label className="block text-[10px] font-medium text-gray-500 mb-1">{label}</label>
          {type === 'text' ? (
            <input
              type="text"
              value={(node[key] as string) || ''}
              onChange={(e) => onUpdate({ [key]: e.target.value })}
              className="w-full px-2 py-1.5 text-[12px] border border-gray-200 rounded-md focus:ring-1 focus:ring-indigo-500 outline-none"
            />
          ) : (
            <select
              value={(node[key] as string) || options?.[0] || ''}
              onChange={(e) => onUpdate({ [key]: e.target.value })}
              className="w-full px-2 py-1.5 text-[12px] border border-gray-200 rounded-md focus:ring-1 focus:ring-indigo-500 outline-none bg-white"
            >
              {options?.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          )}
        </div>
      ))}

      {fields.length === 0 && (
        <p className="text-[11px] text-gray-400">Sin propiedades configurables para este componente</p>
      )}
    </div>
  );
}

function StylesTab({ node, onUpdate }: { node: ComponentNode; onUpdate: (styles: Record<string, unknown>) => void }) {
  const styles = (node._styles || {}) as Record<string, string>;

  const styleFields = [
    { key: 'width', label: 'Ancho' },
    { key: 'height', label: 'Alto' },
    { key: 'padding', label: 'Padding' },
    { key: 'margin', label: 'Margin' },
    { key: 'backgroundColor', label: 'Fondo' },
    { key: 'borderRadius', label: 'Border radius' },
    { key: 'border', label: 'Borde' },
  ];

  return (
    <div className="space-y-3">
      {styleFields.map(({ key, label }) => (
        <div key={key}>
          <label className="block text-[10px] font-medium text-gray-500 mb-1">{label}</label>
          <input
            type="text"
            value={styles[key] || ''}
            onChange={(e) => onUpdate({ [key]: e.target.value })}
            placeholder={key === 'backgroundColor' ? '#ffffff' : 'auto'}
            className="w-full px-2 py-1.5 text-[12px] border border-gray-200 rounded-md focus:ring-1 focus:ring-indigo-500 outline-none font-mono"
          />
        </div>
      ))}
    </div>
  );
}

// Helpers
function findNode(tree: ComponentNode, id: string): ComponentNode | null {
  if (tree._id === id) return tree;
  for (const child of (tree._children || [])) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

function updateNodeInTree(tree: ComponentNode, id: string, updates: Record<string, unknown>): ComponentNode {
  if (tree._id === id) {
    return { ...tree, ...updates };
  }
  if (!tree._children) return tree;
  return {
    ...tree,
    _children: tree._children.map((child) => updateNodeInTree(child, id, updates)),
  };
}
