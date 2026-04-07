import { useState, useEffect, useRef } from "react";
import { Zap, Maximize2, Minimize2 } from "lucide-react";

const AUTOMATIONS_BASE_URL = import.meta.env.VITE_AUTOMATIONS_URL || "https://automations.pulse.factoriaia.com";

export default function AutomationsView() {
  const [loading, setLoading] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const embedUrl = `${AUTOMATIONS_BASE_URL}/flows`;

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.origin !== new URL(AUTOMATIONS_BASE_URL).origin) return;
      if (event.data?.type === "AP_FLOW_PUBLISHED") {
        console.log("[Automations] Flow published:", event.data);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

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
          title={fullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
        >
          {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </div>

      <div className="flex-1 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-bg-light">
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-primary/10 flex items-center justify-center">
                <Zap size={20} className="text-brand-primary animate-pulse" />
              </div>
              <p className="text-sm text-text-secondary">Cargando automatizaciones...</p>
            </div>
          </div>
        )}
        <iframe
          ref={iframeRef}
          src={embedUrl}
          className="w-full h-full border-0"
          onLoad={() => setLoading(false)}
          allow="clipboard-read; clipboard-write"
          title="Pulse Automations"
        />
      </div>
    </div>
  );
}
