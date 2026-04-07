import { useStudioStore } from '../../stores/studioStore';
import { MousePointer2 } from 'lucide-react';

export default function StudioCanvas() {
  const { componentTree, isPreviewMode, selectComponent } = useStudioStore();

  return (
    <div
      className="flex-1 overflow-auto bg-[#f0f2f5]"
      onClick={() => selectComponent(null)}
    >
      <div className="min-h-full p-8 flex justify-center">
        <div
          className={`bg-white shadow-sm rounded-lg w-full max-w-[1200px] min-h-[600px] ${
            isPreviewMode ? '' : 'border-2 border-dashed border-gray-200'
          }`}
        >
          {componentTree ? (
            <div className="p-4">
              <RenderTree node={componentTree} />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full min-h-[600px] text-center">
              <MousePointer2 size={32} className="text-gray-300 mb-3" />
              <p className="text-[14px] font-medium text-gray-400">Canvas vacio</p>
              <p className="text-[12px] text-gray-300 mt-1">
                Arrastra componentes desde el panel izquierdo
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RenderTree({ node }: { node: Record<string, unknown> }) {
  const { selectComponent, selectedComponentId, hoverComponent, hoveredComponentId } = useStudioStore();

  const id = node._id as string;
  const component = node._component as string;
  const children = (node._children || []) as Record<string, unknown>[];
  const styles = (node._styles || {}) as React.CSSProperties;
  const isSelected = selectedComponentId === id;
  const isHovered = hoveredComponentId === id;

  return (
    <div
      style={styles}
      onClick={(e) => {
        e.stopPropagation();
        selectComponent(id);
      }}
      onMouseEnter={() => hoverComponent(id)}
      onMouseLeave={() => hoverComponent(null)}
      className={`relative transition-all ${
        isSelected
          ? 'ring-2 ring-indigo-500 ring-offset-1'
          : isHovered
            ? 'ring-1 ring-indigo-300 ring-offset-1'
            : ''
      }`}
    >
      {/* Component type badge */}
      {(isSelected || isHovered) && (
        <span className={`absolute -top-5 left-0 text-[9px] px-1.5 py-0.5 rounded font-medium z-10 ${
          isSelected ? 'bg-indigo-500 text-white' : 'bg-indigo-100 text-indigo-600'
        }`}>
          {component}
        </span>
      )}

      {/* Render component placeholder based on type */}
      {component === 'Container' && (
        <div style={{ display: 'flex', flexDirection: (node.direction as string) === 'row' ? 'row' : 'column', gap: (node.gap as string) || '8px', padding: (node.padding as string) || '16px', minHeight: '40px' }}>
          {children.length > 0
            ? children.map((child) => <RenderTree key={child._id as string} node={child} />)
            : !selectedComponentId && (
                <div className="border border-dashed border-gray-200 rounded-md p-4 text-[11px] text-gray-300 text-center">
                  Drop components here
                </div>
              )
          }
        </div>
      )}

      {component === 'Text' && (
        <p className="text-[14px] text-gray-800">
          {(node.content as string) || 'Texto'}
        </p>
      )}

      {component === 'Button' && (
        <button className="px-4 py-2 text-[13px] font-medium text-white bg-indigo-600 rounded-lg">
          {(node.label as string) || 'Boton'}
        </button>
      )}

      {component === 'Input' && (
        <div>
          {node.label && <label className="block text-[12px] font-medium text-gray-600 mb-1">{node.label as string}</label>}
          <input
            type="text"
            placeholder={(node.placeholder as string) || 'Escribe aqui...'}
            className="w-full px-3 py-2 text-[13px] border border-gray-200 rounded-lg"
            readOnly
          />
        </div>
      )}

      {component === 'Image' && (
        <div className="bg-gray-100 rounded-lg flex items-center justify-center" style={{ width: '200px', height: '150px' }}>
          <span className="text-[11px] text-gray-400">Imagen</span>
        </div>
      )}

      {component === 'Divider' && (
        <hr className="border-gray-200 my-2" />
      )}

      {/* Generic fallback */}
      {!['Container', 'Text', 'Button', 'Input', 'Image', 'Divider'].includes(component) && (
        <div className="bg-gray-50 border border-gray-200 rounded-md p-3 text-[11px] text-gray-500">
          [{component}]
        </div>
      )}
    </div>
  );
}
