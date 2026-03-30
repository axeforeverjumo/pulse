import { useState, useCallback, useEffect } from "react";
import { supabase } from "../../lib/supabase";

interface StorageEntry {
  name: string;
  isDir: boolean;
  expanded?: boolean;
  children?: StorageEntry[];
  loading?: boolean;
}

interface AgentStorageBrowserProps {
  agentId: string;
  label: string;
  rootPath: string;
  emptyMessage?: string;
}

export default function AgentStorageBrowser({ agentId, label, rootPath, emptyMessage }: AgentStorageBrowserProps) {
  const [entries, setEntries] = useState<StorageEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [fileLoading, setFileLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const loadDir = useCallback(
    async (subPath: string): Promise<StorageEntry[]> => {
      const prefix = subPath
        ? `${agentId}/${rootPath}/${subPath}`
        : `${agentId}/${rootPath}`;
      const { data, error } = await supabase.storage.from("agent-data").list(prefix, {
        sortBy: { column: "name", order: "asc" },
      });
      if (error) {
        console.error("Storage list error:", error);
        setError(error.message);
        setStatusMsg(`Listed "${prefix}" → error: ${error.message}`);
        return [];
      }
      if (!data) {
        setStatusMsg(`Listed "${prefix}" → null response`);
        return [];
      }
      const filtered = data.filter((f) => f.name !== ".emptyFolderPlaceholder");
      if (!subPath) {
        setStatusMsg(`${filtered.length} items`);
      }
      return filtered.map((f) => ({
        name: f.name,
        isDir: f.id === null,
      }));
    },
    [agentId, rootPath],
  );

  const handleLoad = useCallback(async () => {
    setLoading(true);
    setError(null);
    setStatusMsg(null);
    const root = await loadDir("");
    setEntries(root);
    setLoaded(true);
    setLoading(false);
  }, [loadDir]);

  // Auto-load on mount
  useEffect(() => {
    handleLoad();
  }, [handleLoad]);

  const handleRefresh = () => {
    setSelectedFile(null);
    setFileContent("");
    setLoaded(false);
    handleLoad();
  };

  const toggleDir = async (path: string[], index: number) => {
    const update = (items: StorageEntry[], depth: number): StorageEntry[] => {
      return items.map((item, i) => {
        if (depth === path.length - 1 && i === index) {
          if (item.expanded) {
            return { ...item, expanded: false };
          }
          return { ...item, expanded: true, loading: true };
        }
        if (depth < path.length - 1 && item.name === path[depth] && item.children) {
          return { ...item, children: update(item.children, depth + 1) };
        }
        return item;
      });
    };

    setEntries((prev) => update(prev, 0));

    const subPath = path.join("/");
    const children = await loadDir(subPath);

    const setChildren = (items: StorageEntry[], depth: number): StorageEntry[] => {
      return items.map((item, i) => {
        if (depth === path.length - 1 && i === index) {
          return { ...item, loading: false, children };
        }
        if (depth < path.length - 1 && item.name === path[depth] && item.children) {
          return { ...item, children: setChildren(item.children, depth + 1) };
        }
        return item;
      });
    };

    setEntries((prev) => setChildren(prev, 0));
  };

  const handleFileClick = async (storagePath: string) => {
    setSelectedFile(storagePath);
    setFileLoading(true);
    try {
      const { data, error } = await supabase.storage
        .from("agent-data")
        .download(`${agentId}/${rootPath}/${storagePath}`);
      if (error || !data) {
        setFileContent("Error al cargar archivo");
        return;
      }
      const text = await data.text();
      setFileContent(text);
    } catch {
      setFileContent("Error al cargar archivo");
    } finally {
      setFileLoading(false);
    }
  };

  const renderEntries = (items: StorageEntry[], parentPath: string[] = [], depth = 0) => {
    return items.map((item, i) => {
      const currentPath = [...parentPath, item.name];
      const pathStr = currentPath.join("/");

      return (
        <div key={pathStr}>
          <button
            onClick={() => {
              if (item.isDir) {
                toggleDir(currentPath, i);
              } else {
                handleFileClick(pathStr);
              }
            }}
            className={`w-full text-left flex items-center gap-1.5 py-0.5 hover:bg-black/5 rounded transition-colors ${
              selectedFile === pathStr ? "bg-black/5 font-medium" : ""
            }`}
            style={{ paddingLeft: `${depth * 12 + 4}px` }}
          >
            <span className="text-[10px] text-text-tertiary w-3 text-center shrink-0">
              {item.isDir ? (item.expanded ? "▾" : "▸") : ""}
            </span>
            <span className="text-[11px] text-text-body truncate">
              {item.isDir ? `${item.name}/` : item.name}
            </span>
          </button>
          {item.isDir && item.expanded && item.loading && (
            <div style={{ paddingLeft: `${(depth + 1) * 12 + 4}px` }}>
              <span className="text-[10px] text-text-tertiary">Loading...</span>
            </div>
          )}
          {item.isDir &&
            item.expanded &&
            !item.loading &&
            item.children &&
            renderEntries(item.children, currentPath, depth + 1)}
        </div>
      );
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-[11px] uppercase tracking-wide text-text-tertiary">{label}</p>
        <button
          onClick={handleRefresh}
          className="text-[10px] text-text-tertiary hover:text-text-secondary transition-colors"
        >
          Refresh
        </button>
      </div>

      {loading && !loaded && (
        <p className="text-[11px] text-text-tertiary">Loading...</p>
      )}
      {error && (
        <p className="text-[11px] text-red-500 mb-1">{error}</p>
      )}
      {statusMsg && (
        <p className="text-[10px] text-text-tertiary mb-1 font-mono">{statusMsg}</p>
      )}
      {loaded && entries.length === 0 && !error ? (
        <p className="text-[11px] text-text-tertiary italic">
          {emptyMessage || "Sin archivos a�n."}
        </p>
      ) : (
        <div className="border border-border-light rounded-lg bg-white overflow-hidden">
          <div className="max-h-[200px] overflow-y-auto py-1">{renderEntries(entries)}</div>
        </div>
      )}

      {/* File content viewer */}
      {selectedFile && (
        <div className="mt-2 border border-border-light rounded-lg bg-white overflow-hidden">
          <div className="flex items-center justify-between px-2 py-1 border-b border-border-light bg-gray-50/50">
            <span className="text-[10px] text-text-tertiary truncate">{selectedFile}</span>
            <button
              onClick={() => {
                setSelectedFile(null);
                setFileContent("");
              }}
              className="text-[10px] text-text-tertiary hover:text-text-secondary shrink-0 ml-2"
            >
              Close
            </button>
          </div>
          <pre className="p-2 text-[11px] text-text-body font-mono whitespace-pre-wrap break-words max-h-[300px] overflow-y-auto">
            {fileLoading ? "Cargando..." : fileContent}
          </pre>
        </div>
      )}
    </div>
  );
}
