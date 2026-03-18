import { useState, useCallback } from "react";
import {
  listSandboxFiles,
  readSandboxFile,
  type SandboxFile,
} from "../../api/client";

interface FileNode extends SandboxFile {
  expanded?: boolean;
  children?: FileNode[];
  loading?: boolean;
}

interface SandboxFileBrowserProps {
  agentId: string;
  sandboxStatus?: string;
}

export default function SandboxFileBrowser({ agentId, sandboxStatus }: SandboxFileBrowserProps) {
  const [entries, setEntries] = useState<FileNode[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [fileLoading, setFileLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const isOnline = sandboxStatus === "running" || sandboxStatus === "idle";

  const loadDir = useCallback(
    async (path: string): Promise<FileNode[]> => {
      const files = await listSandboxFiles(agentId, path);
      return files.map((f) => ({ ...f }));
    },
    [agentId],
  );

  const handleLoad = async () => {
    setLoading(true);
    setError(null);
    setStatusMsg(null);
    try {
      const root = await loadDir("/home/user");
      setStatusMsg(`Listed /home/user → ${root.length} items`);
      setEntries(root);
      setLoaded(true);
    } catch (e: any) {
      const msg = e?.message || String(e);
      setError("Failed to load files");
      setStatusMsg(`Listed /home/user → error: ${msg}`);
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    setSelectedFile(null);
    setFileContent("");
    setLoaded(false);
    handleLoad();
  };

  const toggleDir = async (fullPath: string, pathParts: string[], index: number) => {
    const update = (items: FileNode[], depth: number): FileNode[] => {
      return items.map((item, i) => {
        if (depth === pathParts.length - 1 && i === index) {
          if (item.expanded) return { ...item, expanded: false };
          return { ...item, expanded: true, loading: true };
        }
        if (depth < pathParts.length - 1 && item.name === pathParts[depth] && item.children) {
          return { ...item, children: update(item.children, depth + 1) };
        }
        return item;
      });
    };

    setEntries((prev) => update(prev, 0));

    try {
      const children = await loadDir(fullPath);
      const setChildren = (items: FileNode[], depth: number): FileNode[] => {
        return items.map((item, i) => {
          if (depth === pathParts.length - 1 && i === index) {
            return { ...item, loading: false, children };
          }
          if (depth < pathParts.length - 1 && item.name === pathParts[depth] && item.children) {
            return { ...item, children: setChildren(item.children, depth + 1) };
          }
          return item;
        });
      };
      setEntries((prev) => setChildren(prev, 0));
    } catch {
      // Reset loading state on error
      const reset = (items: FileNode[], depth: number): FileNode[] => {
        return items.map((item, i) => {
          if (depth === pathParts.length - 1 && i === index) {
            return { ...item, loading: false, expanded: false };
          }
          if (depth < pathParts.length - 1 && item.name === pathParts[depth] && item.children) {
            return { ...item, children: reset(item.children, depth + 1) };
          }
          return item;
        });
      };
      setEntries((prev) => reset(prev, 0));
    }
  };

  const handleFileClick = async (path: string) => {
    setSelectedFile(path);
    setFileLoading(true);
    try {
      const content = await readSandboxFile(agentId, path);
      setFileContent(content);
    } catch {
      setFileContent("Failed to load file");
    } finally {
      setFileLoading(false);
    }
  };

  const renderEntries = (items: FileNode[], parentPath: string, nameTrail: string[] = [], depth = 0) => {
    return items.map((item, i) => {
      const fullPath = `${parentPath}/${item.name}`;
      const trail = [...nameTrail, item.name];

      return (
        <div key={fullPath}>
          <button
            onClick={() => {
              if (item.type === "dir") {
                toggleDir(fullPath, trail, i);
              } else {
                handleFileClick(fullPath);
              }
            }}
            className={`w-full text-left flex items-center gap-1.5 py-0.5 hover:bg-black/5 rounded transition-colors ${
              selectedFile === fullPath ? "bg-black/5 font-medium" : ""
            }`}
            style={{ paddingLeft: `${depth * 12 + 4}px` }}
          >
            <span className="text-[10px] text-text-tertiary w-3 text-center shrink-0">
              {item.type === "dir" ? (item.expanded ? "▾" : "▸") : ""}
            </span>
            <span className="text-[11px] text-text-body truncate">
              {item.type === "dir" ? `${item.name}/` : item.name}
            </span>
            {item.type === "file" && item.size > 0 && (
              <span className="text-[9px] text-text-tertiary shrink-0 ml-auto mr-1">
                {item.size < 1024 ? `${item.size}B` : `${(item.size / 1024).toFixed(1)}K`}
              </span>
            )}
          </button>
          {item.type === "dir" && item.expanded && item.loading && (
            <div style={{ paddingLeft: `${(depth + 1) * 12 + 4}px` }}>
              <span className="text-[10px] text-text-tertiary">Loading...</span>
            </div>
          )}
          {item.type === "dir" &&
            item.expanded &&
            !item.loading &&
            item.children &&
            renderEntries(item.children, fullPath, trail, depth + 1)}
        </div>
      );
    });
  };

  if (!isOnline) {
    return (
      <div>
        <p className="text-[11px] uppercase tracking-wide text-text-tertiary mb-1">Sandbox Files</p>
        <p className="text-[11px] text-text-tertiary italic">Sandbox is offline</p>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div>
        <p className="text-[11px] uppercase tracking-wide text-text-tertiary mb-1">Sandbox Files</p>
        {error && <p className="text-[11px] text-red-500 mb-1">{error}</p>}
        {statusMsg && <p className="text-[10px] text-text-tertiary mb-1 font-mono">{statusMsg}</p>}
        <button
          onClick={handleLoad}
          disabled={loading}
          className="text-[11px] px-2.5 py-1 rounded-md border border-border-gray text-text-secondary hover:bg-white disabled:opacity-50 transition-colors"
        >
          {loading ? "Loading..." : "Browse VM"}
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-[11px] uppercase tracking-wide text-text-tertiary">Sandbox Files</p>
        <button
          onClick={handleRefresh}
          className="text-[10px] text-text-tertiary hover:text-text-secondary transition-colors"
        >
          Refresh
        </button>
      </div>

      {statusMsg && <p className="text-[10px] text-text-tertiary mb-1 font-mono">{statusMsg}</p>}

      <div className="border border-border-light rounded-lg bg-white overflow-hidden">
        <div className="max-h-[200px] overflow-y-auto py-1">
          {entries.length === 0 ? (
            <p className="text-[11px] text-text-tertiary italic px-2 py-1">Empty directory</p>
          ) : (
            renderEntries(entries, "/home/user")
          )}
        </div>
      </div>

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
            {fileLoading ? "Loading..." : fileContent}
          </pre>
        </div>
      )}
    </div>
  );
}
