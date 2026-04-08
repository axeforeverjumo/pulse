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
            className="h-16 bg-slate-100 rounded-xl animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (sites.length === 0) {
    return (
      <div className="p-4 text-center text-slate-400 text-sm">
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
          className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors ${
            selectedId === site.id
              ? "bg-blue-50 border border-blue-200"
              : "hover:bg-slate-50 border border-transparent"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                selectedId === site.id ? "bg-blue-100" : "bg-slate-100"
              }`}
            >
              <GlobeAltIcon className="w-4 h-4 text-slate-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">
                {site.name}
              </p>
              <p className="text-xs text-slate-400 truncate">{site.domain}</p>
            </div>
            {site.last_audit_score != null && (
              <div
                className={`text-xs font-bold px-2 py-0.5 rounded ${
                  site.last_audit_score >= 80
                    ? "bg-green-50 text-green-600"
                    : site.last_audit_score >= 50
                    ? "bg-yellow-50 text-yellow-600"
                    : "bg-red-50 text-red-600"
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
