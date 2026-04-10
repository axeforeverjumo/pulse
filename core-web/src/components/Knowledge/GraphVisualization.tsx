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
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [hoveredNode, setHoveredNode] = useState<any>(null);
  const nodesRef = useRef<any[]>([]);
  const linksRef = useRef<any[]>([]);
  const animRef = useRef<number>(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetchGraph(workspaceId);
  }, [workspaceId]);

  // Responsive resize — measure after mount + layout settle
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measure = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width > 10 && rect.height > 10) {
        setDimensions({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
      }
    };

    // Measure after a frame to ensure layout has settled
    requestAnimationFrame(() => {
      measure();
      // And again after a short delay for lazy-loaded containers
      setTimeout(measure, 100);
    });

    const obs = new ResizeObserver(measure);
    obs.observe(container);
    return () => obs.disconnect();
  }, []);

  // Force simulation
  useEffect(() => {
    if (!graphData.nodes.length || dimensions.width < 100) return;

    const PADDING = 80;
    const { width, height } = dimensions;
    const cx = width / 2;
    const cy = height / 2;
    const usableW = width - PADDING * 2;
    const usableH = height - PADDING * 2;

    // Limit visible nodes for performance (top by mentions)
    const maxNodes = Math.min(graphData.nodes.length, 200);
    const topNodes = [...graphData.nodes]
      .sort((a, b) => (b.val || 1) - (a.val || 1))
      .slice(0, maxNodes);
    const topIds = new Set(topNodes.map(n => n.id));

    // Initialize positions in a circle with jitter
    nodesRef.current = topNodes.map((n, i) => {
      const angle = (i / topNodes.length) * Math.PI * 2;
      const r = Math.min(usableW, usableH) * 0.35;
      return {
        ...n,
        x: cx + Math.cos(angle) * r + (Math.random() - 0.5) * 60,
        y: cy + Math.sin(angle) * r + (Math.random() - 0.5) * 60,
        vx: 0,
        vy: 0,
        radius: Math.max(5, Math.min(24, 3 + Math.sqrt(n.val || 1) * 2.5)),
      };
    });

    const nodeMap = new Map(nodesRef.current.map(n => [n.id, n]));

    linksRef.current = graphData.links
      .filter(l => topIds.has(l.source) && topIds.has(l.target))
      .map(l => ({
        ...l,
        sourceNode: nodeMap.get(l.source),
        targetNode: nodeMap.get(l.target),
      }))
      .filter(l => l.sourceNode && l.targetNode);

    let iter = 0;
    const maxIter = 200;
    const nodeCount = nodesRef.current.length;

    const simulate = () => {
      if (iter > maxIter) {
        setReady(true);
        draw();
        return;
      }
      iter++;
      const alpha = Math.pow(1 - iter / maxIter, 1.5);
      const nodes = nodesRef.current;
      const links = linksRef.current;

      // Repulsion (use grid-based approximation for large graphs)
      const repStrength = nodeCount > 100 ? 120 : 200;
      const step = nodeCount > 150 ? 3 : 1; // Skip nodes for perf

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + step; j < nodes.length; j += step) {
          const dx = nodes[j].x - nodes[i].x;
          const dy = nodes[j].y - nodes[i].y;
          const distSq = dx * dx + dy * dy;
          if (distSq > 90000) continue; // Skip distant pairs (>300px)
          const dist = Math.max(1, Math.sqrt(distSq));
          const force = (repStrength * alpha) / dist;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          nodes[i].vx -= fx;
          nodes[i].vy -= fy;
          nodes[j].vx += fx;
          nodes[j].vy += fy;
        }
      }

      // Attraction along links
      for (const link of links) {
        const s = link.sourceNode;
        const t = link.targetNode;
        const dx = t.x - s.x;
        const dy = t.y - s.y;
        const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const idealDist = 80 + (s.radius + t.radius);
        const force = (dist - idealDist) * 0.008 * alpha;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        s.vx += fx;
        s.vy += fy;
        t.vx -= fx;
        t.vy -= fy;
      }

      // Strong centering force to prevent edge clustering
      for (const node of nodes) {
        node.vx += (cx - node.x) * 0.003 * alpha;
        node.vy += (cy - node.y) * 0.003 * alpha;
      }

      // Apply velocity with damping + keep within padded bounds
      for (const node of nodes) {
        node.vx *= 0.55;
        node.vy *= 0.55;
        node.x += node.vx;
        node.y += node.vy;
        node.x = Math.max(PADDING + node.radius, Math.min(width - PADDING - node.radius, node.x));
        node.y = Math.max(PADDING + node.radius, Math.min(height - PADDING - node.radius, node.y));
      }

      if (iter % 2 === 0 || iter > maxIter - 5) draw();
      animRef.current = requestAnimationFrame(simulate);
    };

    setReady(false);
    simulate();

    return () => cancelAnimationFrame(animRef.current);
  }, [graphData, dimensions]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = dimensions;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Clear with subtle gradient
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, '#fafbff');
    grad.addColorStop(1, '#f5f7fb');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    const nodes = nodesRef.current;
    const links = linksRef.current;

    // Draw links
    ctx.globalAlpha = 0.15;
    for (const link of links) {
      const s = link.sourceNode;
      const t = link.targetNode;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = Math.max(0.5, (link.strength || 0.5) * 1.5);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Draw nodes
    for (const node of nodes) {
      const color = typeColors[node.type] || '#6b7280';
      const isHovered = hoveredNode?.id === node.id;

      // Shadow for larger nodes
      if (node.radius > 8) {
        ctx.beginPath();
        ctx.arc(node.x, node.y + 2, node.radius + 1, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.06)';
        ctx.fill();
      }

      // Hover glow
      if (isHovered) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + 6, 0, Math.PI * 2);
        ctx.fillStyle = color + '20';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + 2, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Node circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      // White border for polish
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Draw labels (only for visible/larger nodes or hovered)
    ctx.textAlign = 'center';
    for (const node of nodes) {
      const isHovered = hoveredNode?.id === node.id;
      const showLabel = node.radius > 6 || isHovered;
      if (!showLabel) continue;

      const fontSize = isHovered ? 11 : node.radius > 12 ? 10 : 9;
      ctx.font = `${isHovered ? '600' : '500'} ${fontSize}px Inter, system-ui, sans-serif`;

      const label = node.name.length > 18 ? node.name.slice(0, 17) + '...' : node.name;

      // Text background pill
      const metrics = ctx.measureText(label);
      const textW = metrics.width + 8;
      const textH = fontSize + 4;
      const textY = node.y + node.radius + 10;

      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.roundRect(node.x - textW / 2, textY - textH / 2, textW, textH, 3);
      ctx.fill();

      ctx.fillStyle = '#334155';
      ctx.fillText(label, node.x, textY + fontSize * 0.35 - 1);
    }
  }, [dimensions, hoveredNode]);

  // Mouse events
  const handleClick = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    for (const node of nodesRef.current) {
      const dx = x - node.x;
      const dy = y - node.y;
      if (dx * dx + dy * dy < (node.radius + 4) ** 2) {
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
      const dx = x - node.x;
      const dy = y - node.y;
      if (dx * dx + dy * dy < (node.radius + 6) ** 2) {
        found = node;
        break;
      }
    }
    if (found !== hoveredNode) {
      setHoveredNode(found);
      if (canvasRef.current) {
        canvasRef.current.style.cursor = found ? 'pointer' : 'default';
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-10 h-10 rounded-full border-2 border-slate-200 border-t-slate-600 animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-500">Cargando grafo...</p>
        </div>
      </div>
    );
  }

  if (!graphData.nodes.length) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-sm">
          <p className="text-sm text-slate-500 mb-2">El Knowledge Graph esta vacio.</p>
          <p className="text-xs text-slate-400">Ejecuta un Build para extraer entidades de tus emails y calendario.</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full h-full min-h-[400px]">
      {/* Loading overlay during simulation */}
      {!ready && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 backdrop-blur-sm">
          <div className="text-center">
            <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-indigo-500 animate-spin mx-auto mb-2" />
            <p className="text-xs text-slate-500">Calculando layout ({graphData.nodes.length} entidades)...</p>
          </div>
        </div>
      )}
      <canvas
        ref={canvasRef}
        style={{ width: dimensions.width, height: dimensions.height }}
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
          {nodesRef.current.length}/{graphData.nodes.length} mostrados
        </span>
      </div>
    </div>
  );
}
