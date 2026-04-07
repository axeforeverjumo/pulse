import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../../api/client';
import { registerAllWidgets } from '../widgets';
import { registry } from '../engine/registry';
import { createDefaultContext } from '../engine/evaluator';
import type { ComponentNode } from '../engine/types';
import CanvasNode from '../canvas/CanvasNode';

registerAllWidgets();

interface PublishedApp {
  app: {
    id: string;
    name: string;
    slug: string;
    icon: string;
    color: string;
  };
  pages: {
    id: string;
    name: string;
    slug: string;
    route: string;
    is_home: boolean;
    component_tree: ComponentNode;
  }[];
}

export default function StudioRuntime() {
  const { appSlug, pageSlug } = useParams<{ appSlug: string; pageSlug?: string }>();
  const [appData, setAppData] = useState<PublishedApp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!appSlug) return;
    setLoading(true);
    api<PublishedApp>(`/studio/runtime/${appSlug}`)
      .then(setAppData)
      .catch((e) => setError(e.message || 'App no encontrada'))
      .finally(() => setLoading(false));
  }, [appSlug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-[13px] text-gray-400">Cargando app...</div>
      </div>
    );
  }

  if (error || !appData) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-[16px] font-medium text-gray-600">App no encontrada</p>
          <p className="text-[13px] text-gray-400 mt-1">{error || 'La app no existe o no esta publicada'}</p>
        </div>
      </div>
    );
  }

  // Find current page
  const currentPage = pageSlug
    ? appData.pages.find((p) => p.slug === pageSlug)
    : appData.pages.find((p) => p.is_home) || appData.pages[0];

  if (!currentPage) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-[13px] text-gray-400">Pagina no encontrada</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation for multi-page apps */}
      {appData.pages.length > 1 && (
        <nav className="flex items-center gap-4 px-6 py-3 border-b border-gray-100">
          <span className="text-[14px] font-semibold text-gray-900">{appData.app.name}</span>
          <div className="flex gap-1">
            {appData.pages.map((page) => (
              <a
                key={page.id}
                href={`/app/${appSlug}/${page.slug}`}
                className={`px-3 py-1.5 text-[12px] rounded-md transition-colors ${
                  page.id === currentPage.id
                    ? 'bg-gray-100 text-gray-900 font-medium'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {page.name}
              </a>
            ))}
          </div>
        </nav>
      )}

      {/* Render page */}
      <div className="max-w-[1200px] mx-auto">
        <RenderRuntimeTree node={currentPage.component_tree} />
      </div>
    </div>
  );
}

function RenderRuntimeTree({ node }: { node: ComponentNode }) {
  const def = registry.get(node._component);
  if (!def) return null;

  const childNodes = node._children?.map((child) => (
    <RenderRuntimeTree key={child._id} node={child} />
  ));

  // Build resolved props (no evaluation context for now — pass raw)
  const resolvedProps: Record<string, unknown> = {};
  for (const prop of def.properties) {
    resolvedProps[prop.key] = node[prop.key] ?? prop.defaultValue;
  }

  const Component = def.component;
  return (
    <Component
      node={node}
      isEditing={false}
      isSelected={false}
      isHovered={false}
      resolvedProps={resolvedProps}
    >
      {childNodes}
    </Component>
  );
}
