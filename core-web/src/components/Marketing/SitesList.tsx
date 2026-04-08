import { GlobeAltIcon } from "@heroicons/react/24/outline";

interface Props {
  sites: any[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function SitesList({
  sites,
  loading,
  selectedId,
  onSelect,
}: Props) {
  if (loading) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-16 bg-white/5 rounded-lg animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (sites.length === 0) {
    return (
      <div className="p-4 text-center text-white/40 text-sm">
        No hay sitios configurados
      </div>
    );
  }

  return (
    <div className="p-2 space-y-1">
      {sites.map((site) => (
        <button
          key={site.id}
          onClick={() => onSelect(site.id)}
          className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors ${
            selectedId === site.id
              ? "bg-blue-600/20 border border-blue-500/30"
              : "hover:bg-white/5 border border-transparent"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                selectedId === site.id ? "bg-blue-600/30" : "bg-white/10"
              }`}
            >
              <GlobeAltIcon className="w-4 h-4 text-white/70" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {site.name}
              </p>
              <p className="text-xs text-white/40 truncate">{site.domain}</p>
            </div>
            {site.last_audit_score != null && (
              <div
                className={`text-xs font-bold px-2 py-0.5 rounded ${
                  site.last_audit_score >= 80
                    ? "bg-green-500/20 text-green-400"
                    : site.last_audit_score >= 50
                    ? "bg-yellow-500/20 text-yellow-400"
                    : "bg-red-500/20 text-red-400"
                }`}
              >
                {site.last_audit_score}
              </div>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}
