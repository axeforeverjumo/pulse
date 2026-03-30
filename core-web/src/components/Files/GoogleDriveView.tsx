import { useState, useEffect, useCallback } from "react";
import {
  FolderOpen,
  FileText,
  Table,
  Presentation,
  Image,
  File,
  Search,
  ChevronRight,
  Loader2,
  RefreshCw,
  FolderPlus,
} from "lucide-react";
import { Icon } from "../ui/Icon";
import { api } from "../../api/client";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
  webViewLink?: string;
  iconLink?: string;
}

interface BreadcrumbItem {
  id: string;
  name: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function isFolder(mimeType: string) {
  return mimeType === "application/vnd.google-apps.folder";
}

function getFileIcon(mimeType: string) {
  if (isFolder(mimeType)) return { icon: FolderOpen, color: "text-yellow-500" };
  if (mimeType === "application/vnd.google-apps.document")
    return { icon: FileText, color: "text-blue-500" };
  if (mimeType === "application/vnd.google-apps.spreadsheet")
    return { icon: Table, color: "text-green-500" };
  if (mimeType === "application/vnd.google-apps.presentation")
    return { icon: Presentation, color: "text-orange-500" };
  if (mimeType === "application/pdf")
    return { icon: FileText, color: "text-red-500" };
  if (mimeType.startsWith("image/"))
    return { icon: Image, color: "text-purple-500" };
  return { icon: File, color: "text-gray-400" };
}

function formatFileSize(bytes?: string) {
  if (!bytes) return "\u2014";
  const n = parseInt(bytes, 10);
  if (isNaN(n) || n === 0) return "\u2014";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let size = n;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(dateStr?: string) {
  if (!dateStr) return "\u2014";
  const d = new Date(dateStr);
  return d.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function GoogleDriveView() {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noAccount, setNoAccount] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>([
    { id: "root", name: "Mi Drive" },
  ]);
  const [creating, setCreating] = useState(false);

  const currentFolderId = breadcrumb[breadcrumb.length - 1].id;

  /* Fetch files ---------------------------------------------------- */
  const fetchFiles = useCallback(
    async (folderId: string, query?: string) => {
      setLoading(true);
      setError(null);
      setNoAccount(false);
      try {
        let url = `/drive/files?folder_id=${encodeURIComponent(folderId)}`;
        if (query) url += `&q=${encodeURIComponent(query)}`;
        const data = await api<{ files: DriveFile[] }>(url);
        setFiles(data.files);
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : "Error al cargar archivos";
        if (
          msg.includes("not connected") ||
          msg.includes("no Google") ||
          msg.includes("401") ||
          msg.includes("google_account") ||
          msg.includes("No Google")
        ) {
          setNoAccount(true);
        } else {
          setError(msg);
        }
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchFiles(currentFolderId, searchQuery || undefined);
  }, [currentFolderId, fetchFiles]);

  /* Search with debounce ------------------------------------------- */
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchFiles(currentFolderId, searchQuery || undefined);
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  /* Navigation ----------------------------------------------------- */
  const navigateToFolder = (file: DriveFile) => {
    setBreadcrumb((prev) => [...prev, { id: file.id, name: file.name }]);
  };

  const navigateToBreadcrumb = (index: number) => {
    setBreadcrumb((prev) => prev.slice(0, index + 1));
  };

  /* Create actions ------------------------------------------------- */
  const createItem = async (
    type: "document" | "spreadsheet" | "presentation" | "folder"
  ) => {
    const labels: Record<string, string> = {
      document: "documento",
      spreadsheet: "hoja de c\u00e1lculo",
      presentation: "presentaci\u00f3n",
      folder: "carpeta",
    };
    const name = prompt(`Nombre del nuevo ${labels[type]}:`);
    if (!name) return;

    setCreating(true);
    try {
      if (type === "folder") {
        await api<{ folder: DriveFile }>("/drive/folders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            parent_id: currentFolderId === "root" ? undefined : currentFolderId,
          }),
        });
      } else {
        const mimeTypes: Record<string, string> = {
          document: "application/vnd.google-apps.document",
          spreadsheet: "application/vnd.google-apps.spreadsheet",
          presentation: "application/vnd.google-apps.presentation",
        };
        await api<{ file: DriveFile }>("/drive/files", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            mimeType: mimeTypes[type],
            parent_id: currentFolderId === "root" ? undefined : currentFolderId,
          }),
        });
      }
      fetchFiles(currentFolderId, searchQuery || undefined);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al crear";
      alert(msg);
    } finally {
      setCreating(false);
    }
  };

  /* Click on file -------------------------------------------------- */
  const handleFileClick = (file: DriveFile) => {
    if (isFolder(file.mimeType)) {
      navigateToFolder(file);
    } else if (file.webViewLink) {
      window.open(file.webViewLink, "_blank", "noopener");
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  /* No Google account connected */
  if (noAccount) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <Icon icon={File} size={28} className="text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Google Drive no conectado
          </h3>
          <p className="text-sm text-gray-500">
            Conecta tu cuenta de Google en Configuraci\u00f3n para ver tus
            archivos de Drive
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-bg-mini-app">
      {/* Top bar */}
      <div className="shrink-0 border-b border-gray-200 bg-white px-4 py-2.5 flex items-center gap-3 flex-wrap">
        {/* Create buttons */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => createItem("document")}
            disabled={creating}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-50"
          >
            <Icon icon={FileText} size={13} />
            Documento
          </button>
          <button
            onClick={() => createItem("spreadsheet")}
            disabled={creating}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md bg-green-50 text-green-700 hover:bg-green-100 transition-colors disabled:opacity-50"
          >
            <Icon icon={Table} size={13} />
            Hoja de c\u00e1lculo
          </button>
          <button
            onClick={() => createItem("presentation")}
            disabled={creating}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md bg-orange-50 text-orange-700 hover:bg-orange-100 transition-colors disabled:opacity-50"
          >
            <Icon icon={Presentation} size={13} />
            Presentaci\u00f3n
          </button>
          <button
            onClick={() => createItem("folder")}
            disabled={creating}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md bg-yellow-50 text-yellow-700 hover:bg-yellow-100 transition-colors disabled:opacity-50"
          >
            <Icon icon={FolderPlus} size={13} />
            Carpeta
          </button>
        </div>

        {/* Search */}
        <div className="ml-auto relative">
          <Icon
            icon={Search}
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            placeholder="Buscar en Drive..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-xs rounded-md border border-gray-200 bg-gray-50 focus:bg-white focus:border-blue-300 focus:ring-1 focus:ring-blue-300 outline-none w-56 transition-colors"
          />
        </div>

        {/* Refresh */}
        <button
          onClick={() => fetchFiles(currentFolderId, searchQuery || undefined)}
          className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          title="Refrescar"
        >
          <Icon icon={RefreshCw} size={14} />
        </button>
      </div>

      {/* Breadcrumb */}
      <div className="shrink-0 px-4 py-2 flex items-center gap-1 text-xs text-gray-500 bg-white border-b border-gray-100">
        {breadcrumb.map((item, i) => (
          <span key={item.id} className="flex items-center gap-1">
            {i > 0 && <Icon icon={ChevronRight} size={12} className="text-gray-300" />}
            <button
              onClick={() => navigateToBreadcrumb(i)}
              className={`hover:text-gray-900 transition-colors ${
                i === breadcrumb.length - 1
                  ? "text-gray-900 font-medium"
                  : "text-gray-500"
              }`}
            >
              {item.name}
            </button>
          </span>
        ))}
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Icon icon={Loader2} size={24} className="text-gray-400 animate-spin" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <p className="text-sm text-red-500 mb-2">{error}</p>
              <button
                onClick={() =>
                  fetchFiles(currentFolderId, searchQuery || undefined)
                }
                className="text-xs text-blue-600 hover:text-blue-700"
              >
                Reintentar
              </button>
            </div>
          </div>
        ) : files.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                <Icon icon={FolderOpen} size={22} className="text-gray-400" />
              </div>
              <p className="text-sm text-gray-500">
                {searchQuery
                  ? "No se encontraron resultados"
                  : "Esta carpeta est\u00e1 vac\u00eda"}
              </p>
            </div>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider border-b border-gray-100">
                <th className="px-4 py-2">Nombre</th>
                <th className="px-4 py-2 w-32">Modificado</th>
                <th className="px-4 py-2 w-24 text-right">Tama\u00f1o</th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => {
                const { icon, color } = getFileIcon(file.mimeType);
                return (
                  <tr
                    key={file.id}
                    onClick={() => handleFileClick(file)}
                    className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors group"
                  >
                    <td className="px-4 py-2.5 flex items-center gap-2.5">
                      <Icon icon={icon} size={16} className={color} />
                      <span className="text-sm text-gray-900 group-hover:text-blue-600 truncate transition-colors">
                        {file.name}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-400">
                      {formatDate(file.modifiedTime)}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-400 text-right">
                      {isFolder(file.mimeType)
                        ? "\u2014"
                        : formatFileSize(file.size)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
