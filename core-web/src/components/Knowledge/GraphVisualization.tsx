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
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [hoveredNode, setHoveredNode] = useState<any>(null);
  const nodesRef = useRef<any[]>([]);
  const linksRef = useRef<any[]>([]);
  const animRef = useRef<number>(0);

  useEffect(() => {
    fetchGraph(workspaceId);
  }, [workspaceId]);

  // Responsive resize
  useEffect(() => {
    const container = canvasRef.current?.parentElement;
    if (!container) return;

    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    obs.observe(container);
    return () => obs.disconnect();
  }, []);

  // Initialize force simulation with simple physics
  useEffect(() => {
    if (!graphData.nodes.length) return;

    const { width, height } = dimensions;
    const cx = width / 2;
    const cy = height / 2;

    // Initialize node positions
    nodesRef.current = graphData.nodes.map((n, i) => ({
      ...n,
      x: cx + (Math.random() - 0.5) * width * 0.6,
      y: cy + (Math.random() - 0.5) * height * 0.6,
      vx: 0,
      vy: 0,
      radius: Math.max(6, Math.min(20, 4 + Math.sqrt(n.val || 1) * 3)),
    }));

    linksRef.current = graphData.links.map((l) => ({
      ...l,
      sourceNode: nodesRef.current.find((n) => n.id === l.source),
      targetNode: nodesRef.current.find((n) => n.id === l.target),
    })).filter((l) => l.sourceNode && l.targetNode);

    // Simple force simulation
    let iter = 0;
    const maxIter = 300;

    const simulate = () => {
      if (iter > maxIter) {
        draw();
        return;
      }
      iter++;
      const alpha = 1 - iter / maxIter;
      const nodes = nodesRef.current;
      const links = linksRef.current;

      // Repulsion between all nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x;
          const dy = nodes[j].y - nodes[i].y;
          const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
          const force = (200 * alpha) / dist;
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
        const force = (dist - 100) * 0.01 * alpha;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        s.vx += fx;
        s.vy += fy;
        t.vx -= fx;
        t.vy -= fy;
      }

      // Centering force
      for (const node of nodes) {
        node.vx += (cx - node.x) * 0.001 * alpha;
        node.vy += (cy - node.y) * 0.001 * alpha;
      }

      // Apply velocity with damping
      for (const node of nodes) {
        node.vx *= 0.6;
        node.vy *= 0.6;
        node.x += node.vx;
        node.y += node.vy;
        // Keep within bounds
        node.x = Math.max(node.radius, Math.min(width - node.radius, node.x));
        node.y = Math.max(node.radius, Math.min(height - node.radius, node.y));
      }

      draw();
      animRef.current = requestAnimationFrame(simulate);
    };

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

    // Clear
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    const nodes = nodesRef.current;
    const links = linksRef.current;

    // Draw links
    for (const link of links) {
      const s = link.sourceNode;
      const t = link.targetNode;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      ctx.strokeStyle = 'rgba(0,0,0,0.06)';
      ctx.lineWidth = Math.max(0.5, (link.strength || 0.5) * 2);
      ctx.stroke();
    }

    // Draw nodes
    for (const node of nodes) {
      const color = typeColors[node.type] || '#6b7280';
      const isHovered = hoveredNode?.id === node.id;

      // Glow for hovered
      if (isHovered) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + 4, 0, Math.PI * 2);
        ctx.fillStyle = color + '30';
        ctx.fill();
      }

      // Node circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      // Label
      ctx.fillStyle = '#334155';
      ctx.font = `${isHovered ? 'bold ' : ''}${isHovered ? 11 : 9}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      const label = node.name.length > 15 ? node.name.slice(0, 14) + '...' : node.name;
      ctx.fillText(label, node.x, node.y + node.radius + 12);
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
      if (dx * dx + dy * dy < node.radius * node.radius * 4) {
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
      if (dx * dx + dy * dy < node.radius * node.radius * 4) {
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
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mx-auto mb-3" />
          <p className="text-sm text-zinc-500">Cargando grafo...</p>
        </div>
      </div>
    );
  }

  if (!graphData.nodes.length) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-sm text-zinc-500 mb-2">El Knowledge Graph esta vacio.</p>
          <p className="text-xs text-zinc-400">Ejecuta un Build para extraer entidades de tus emails y calendario.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        style={{ width: dimensions.width, height: dimensions.height }}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
      />
      {/* Legend */}
      <div className="absolute bottom-4 left-4 flex gap-3 bg-white/80 backdrop-blur-sm rounded-lg px-3 py-2 border border-zinc-200 dark:border-zinc-800">
        {Object.entries(typeColors).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-[10px] text-zinc-600 dark:text-zinc-400 capitalize">{type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
