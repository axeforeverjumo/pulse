import { useState, useEffect, useRef } from "react";
import { Zap, Maximize2, Minimize2 } from "lucide-react";
import { useAuthStore } from "../../stores/authStore";
import { API_BASE } from "../../lib/apiBase";

const AUTOMATIONS_BASE_URL = import.meta.env.VITE_AUTOMATIONS_URL || "https://automations.pulse.factoriaia.com";

type EmbedMode = "sso" | "pulse-token";

export default function AutomationsView() {
  const [loading, setLoading] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [embedMode, setEmbedMode] = useState<EmbedMode | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const session = useAuthStore((s) => s.session);

  useEffect(() => {
    const pulseToken = session?.access_token?.trim();

    setLoading(true);
    setError(null);
    setEmbedUrl(null);
    setEmbedMode(null);

    if (!pulseToken) {
      setError("Sesión no disponible para automatizaciones");
      setLoading(false);
      return;
    }

    let cancelled = false;

    const init = async () => {
      try {
        const resp = await fetch(`${API_BASE}/automations/token`, {
          headers: { Authorization: `Bearer ${pulseToken}` },
        });

        if (!resp.ok) {
          throw new Error(`Token fetch failed (${resp.status})`);
        }

        const data = await resp.json();
        const token = typeof data?.token === "string" ? data.token.trim() : "";
        const projectId = typeof data?.projectId === "string" ? data.projectId.trim() : "";

        if (!token || !projectId) {
          throw new Error("Token or projectId missing");
        }

        const url = `${AUTOMATIONS_BASE_URL}/embed-login.html?token=${encodeURIComponent(token)}&projectId=${encodeURIComponent(projectId)}&redirect=${encodeURIComponent("/flows")}`;

        if (cancelled) return;
        setEmbedMode("sso");
        setEmbedUrl(url);
        return;
      } catch (err) {
        console.warn("[Automations] SSO init failed, falling back to pulseToken mode", err);

        if (cancelled) return;

        const fallbackUrl = `${AUTOMATIONS_BASE_URL}/flows?pulseToken=${encodeURIComponent(pulseToken)}`;
        setEmbedMode("pulse-token");
        setEmbedUrl(fallbackUrl);
        setError("Automatizaciones cargadas en modo compatibilidad");
      }
    };

    void init();

    return () => {
      cancelled = true;
    };
  }, [session?.access_token]);

  const loadingMessage = (() => {
    if (error && !embedUrl) return error;
    if (embedMode === "pulse-token") return "Cargando automatizaciones (compatibilidad)...";
    return "Cargando automatizaciones...";
  })();

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
              <p className="text-sm text-text-secondary">{loadingMessage}</p>
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
