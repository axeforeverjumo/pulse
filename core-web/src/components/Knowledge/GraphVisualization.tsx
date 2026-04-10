import { useEffect, useRef, useState, useCallback } from 'react';
import { useKnowledgeStore } from '../../stores/knowledgeStore';

const typeColors: Record<string, string> = {
  person: '#3b82f6',
  organization: '#8b5cf6',
  project: '#22c55e',
  topic: '#f59e0b',
  meeting: '#ec4899',
};

interface Props {
  workspaceId: string;
  onSelectEntity: (entity: any) => void;
}

export default function GraphVisualization({ workspaceId, onSelectEntity }: Props) {
  const { graphData, isLoading, fetchGraph } = useKnowledgeStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredNode, setHoveredNode] = useState<any>(null);
  const nodesRef = useRef<any[]>([]);
  const linksRef = useRef<any[]>([]);
  const drawnRef = useRef(false);

  useEffect(() => { fetchGraph(workspaceId); }, [workspaceId]);

  // Single effect: when graphData arrives, wait for container to have size, then compute + draw
  useEffect(() => {
    if (!graphData.nodes.length) return;
    drawnRef.current = false;

    const tryRender = () => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas || drawnRef.current) return;

      const rect = container.getBoundingClientRect();
      const width = Math.floor(rect.width);
      const height = Math.floor(rect.height);
      if (width < 100 || height < 100) {
        // Container not ready, retry
        requestAnimationFrame(tryRender);
        return;
      }

      // --- COMPUTE ---
      const PADDING = 60;
      const cx = width / 2;
      const cy = height / 2;

      const maxNodes = Math.min(graphData.nodes.length, 60);
      const topNodes = [...graphData.nodes]
        .sort((a, b) => (b.val || 1) - (a.val || 1))
        .slice(0, maxNodes);
      const topIds = new Set(topNodes.map(n => n.id));

      // Init positions in circle
      const nodes = topNodes.map((n, i) => {
        const angle = (i / topNodes.length) * Math.PI * 2;
        const r = Math.min(width, height) * 0.3;
        return {
          ...n,
          x: cx + Math.cos(angle) * r + (Math.random() - 0.5) * 40,
          y: cy + Math.sin(angle) * r + (Math.random() - 0.5) * 40,
          vx: 0, vy: 0,
          radius: Math.max(5, Math.min(22, 3 + Math.sqrt(n.val || 1) * 2.5)),
        };
      });

      const nodeMap = new Map(nodes.map(n => [n.id, n]));
      const links = graphData.links
        .filter(l => topIds.has(l.source) && topIds.has(l.target))
        .map(l => ({ ...l, s: nodeMap.get(l.source)!, t: nodeMap.get(l.target)! }))
        .filter(l => l.s && l.t);

      // Force simulation: 30 iterations, synchronous
      for (let iter = 0; iter < 30; iter++) {
        const alpha = Math.pow(1 - iter / 30, 1.5);

        // Repulsion
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const dx = nodes[j].x - nodes[i].x;
            const dy = nodes[j].y - nodes[i].y;
            const distSq = dx * dx + dy * dy;
            if (distSq > 50000) continue;
            const dist = Math.max(1, Math.sqrt(distSq));
            const f = (120 * alpha) / dist;
            const fx = (dx / dist) * f;
            const fy = (dy / dist) * f;
            nodes[i].vx -= fx; nodes[i].vy -= fy;
            nodes[j].vx += fx; nodes[j].vy += fy;
          }
        }

        // Attraction
        for (const { s, t } of links) {
          const dx = t.x - s.x;
          const dy = t.y - s.y;
          const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
          const f = (dist - 80) * 0.006 * alpha;
          const fx = (dx / dist) * f;
          const fy = (dy / dist) * f;
          s.vx += fx; s.vy += fy;
          t.vx -= fx; t.vy -= fy;
        }

        // Center + apply
        for (const n of nodes) {
          n.vx += (cx - n.x) * 0.005 * alpha;
          n.vy += (cy - n.y) * 0.005 * alpha;
          n.vx *= 0.5; n.vy *= 0.5;
          n.x += n.vx; n.y += n.vy;
          n.x = Math.max(PADDING + n.radius, Math.min(width - PADDING - n.radius, n.x));
          n.y = Math.max(PADDING + n.radius, Math.min(height - PADDING - n.radius, n.y));
        }
      }

      nodesRef.current = nodes;
      linksRef.current = links;

      // --- DRAW ---
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      const ctx = canvas.getContext('2d')!;
      ctx.scale(dpr, dpr);

      // Background gradient
      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, '#fafbff');
      grad.addColorStop(1, '#f5f7fb');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Links
      ctx.globalAlpha = 0.12;
      for (const { s, t, strength } of links) {
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(t.x, t.y);
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = Math.max(0.5, (strength || 0.5) * 1.5);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // Nodes
      for (const node of nodes) {
        const color = typeColors[node.type] || '#6b7280';

        // Shadow
        if (node.radius > 7) {
          ctx.beginPath();
          ctx.arc(node.x, node.y + 2, node.radius + 1, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(0,0,0,0.05)';
          ctx.fill();
        }

        // Circle
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Labels (only for nodes radius > 6)
      ctx.textAlign = 'center';
      for (const node of nodes) {
        if (node.radius <= 6) continue;
        const label = node.name.length > 16 ? node.name.slice(0, 15) + '...' : node.name;
        const fontSize = node.radius > 12 ? 10 : 9;
        ctx.font = `500 ${fontSize}px Inter, system-ui, sans-serif`;
        const textY = node.y + node.radius + 11;

        // Background pill
        const tw = ctx.measureText(label).width + 6;
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillRect(node.x - tw / 2, textY - fontSize / 2 - 2, tw, fontSize + 4);

        ctx.fillStyle = '#334155';
        ctx.fillText(label, node.x, textY + 2);
      }

      drawnRef.current = true;
    };

    // Start trying to render after a short delay
    const timer = setTimeout(() => requestAnimationFrame(tryRender), 100);
    return () => clearTimeout(timer);
  }, [graphData]);

  // Mouse events
  const handleClick = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    for (const node of nodesRef.current) {
      const dx = x - node.x, dy = y - node.y;
      if (dx * dx + dy * dy < (node.radius + 5) ** 2) {
        onSelectEntity(node);
        return;
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    let found = null;
    for (const node of nodesRef.current) {
      const dx = x - node.x, dy = y - node.y;
      if (dx * dx + dy * dy < (node.radius + 6) ** 2) { found = node; break; }
    }
    setHoveredNode(found);
    if (canvasRef.current) canvasRef.current.style.cursor = found ? 'pointer' : 'default';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-indigo-500 animate-spin mx-auto mb-2" />
          <p className="text-xs text-slate-500">Cargando grafo...</p>
        </div>
      </div>
    );
  }

  if (!graphData.nodes.length) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-sm">
          <p className="text-sm text-slate-500 mb-2">El Knowledge Graph esta vacio.</p>
          <p className="text-xs text-slate-400">Ejecuta un Build para extraer entidades.</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full h-full min-h-[400px]">
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        onClick={handleClick}
        onMouseMove={handleMouseMove}
      />
      {/* Legend */}
      <div className="absolute bottom-6 left-6 flex gap-4 bg-white/90 backdrop-blur-sm rounded-xl px-4 py-2.5 border border-slate-200 shadow-sm">
        {Object.entries(typeColors).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-[11px] text-slate-600 capitalize font-medium">{type}</span>
          </div>
        ))}
        <span className="text-[10px] text-slate-400 ml-2">
          {nodesRef.current.length}/{graphData.nodes.length}
        </span>
      </div>
    </div>
  );
}
