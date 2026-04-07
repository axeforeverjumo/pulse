import { useState, useEffect, useRef } from "react";
import { Zap, Maximize2, Minimize2 } from "lucide-react";
import { useAuthStore } from "../../stores/authStore";
import { API_BASE } from "../../lib/apiBase";

const AUTOMATIONS_BASE_URL = import.meta.env.VITE_AUTOMATIONS_URL || "https://automations.pulse.factoriaia.com";

export default function AutomationsView() {
  const [loading, setLoading] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const session = useAuthStore((s) => s.session);

  useEffect(() => {
    if (!session?.access_token) return;

    const init = async () => {
      try {
        const resp = await fetch(`${API_BASE}/automations/token`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!resp.ok) throw new Error("Token fetch failed");
        const data = await resp.json();
        // Use embed-login.html to inject token into Activepieces localStorage
        const url = `${AUTOMATIONS_BASE_URL}/embed-login.html?token=${encodeURIComponent(data.token)}&projectId=${encodeURIComponent(data.projectId)}&redirect=/flows`;
        setEmbedUrl(url);
      } catch (e) {
        console.error("[Automations] Init failed:", e);
        setError("No se pudo conectar con automatizaciones");
      }
    };
    init();
  }, [session?.access_token]);

  return (
    <div className={`flex flex-col h-full ${fullscreen ? "fixed inset-0 z-50 bg-white" : ""}`}>
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#d7e4f2]">
        <div className="flex items-center gap-2">
          <Zap size={18} className="text-brand-primary" />
          <span className="text-sm font-semibold text-text-dark">Automatizaciones</span>
        </div>
        <button
          onClick={() => setFullscreen(!fullscreen)}
          className="p-1.5 rounded-md hover:bg-bg-gray text-text-secondary transition-colors"
          title={fullscreen ? "Salir" : "Pantalla completa"}
        >
          {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </div>

      <div className="flex-1 relative">
        {(loading || !embedUrl) && (
          <div className="absolute inset-0 flex items-center justify-center bg-bg-light z-10">
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-primary/10 flex items-center justify-center">
                <Zap size={20} className="text-brand-primary animate-pulse" />
              </div>
              <p className="text-sm text-text-secondary">
                {error || "Cargando automatizaciones..."}
              </p>
            </div>
          </div>
        )}
        {embedUrl && (
          <iframe
            ref={iframeRef}
            src={embedUrl}
            className="w-full h-full border-0"
            onLoad={() => setLoading(false)}
            allow="clipboard-read; clipboard-write"
            title="Pulse Automations"
          />
        )}
      </div>
    </div>
  );
}
