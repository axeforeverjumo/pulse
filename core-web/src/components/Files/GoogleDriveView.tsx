import { useState, useEffect, useCallback, useRef } from "react";
import {
  FolderClosed,
  FileText,
  Sheet,
  Presentation,
  Image,
  File,
  Search,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Loader2,
  LayoutList,
  LayoutGrid,
  MoreVertical,
  Share2,
  Download,
  Trash2,
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
  owners?: Array<{ displayName?: string }>;
  lastModifyingUser?: { displayName?: string };
}

interface BreadcrumbItem {
  id: string;
  name: string;
}

type SortField = "name" | "modifiedTime" | "size";
type SortDir = "asc" | "desc";
type ViewMode = "list" | "grid";

interface CreateMenuItem {
  type: "document" | "spreadsheet" | "presentation" | "folder" | "upload";
  label: string;
  emoji: string;
  disabled?: boolean;
  separator?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const CREATE_MENU_ITEMS: CreateMenuItem[] = [
  { type: "document", label: "Documento de Google", emoji: "\u{1F4C4}" },
  { type: "spreadsheet", label: "Hoja de c\u00e1lculo de Google", emoji: "\u{1F4CA}" },
  { type: "presentation", label: "Presentaci\u00f3n de Google", emoji: "\u{1F4BD}" },
  { type: "folder", label: "Carpeta", emoji: "\u{1F4C1}" },
  { type: "upload", label: "Subir archivo", emoji: "\u{1F4E4}", disabled: true, separator: true },
];

const GOOGLE_NATIVE_MIMES = new Set([
  "application/vnd.google-apps.document",
  "application/vnd.google-apps.spreadsheet",
  "application/vnd.google-apps.presentation",
  "application/vnd.google-apps.folder",
  "application/vnd.google-apps.form",
  "application/vnd.google-apps.drawing",
]);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function isFolder(mimeType: string): boolean {
  return mimeType === "application/vnd.google-apps.folder";
}

function getFileIcon(mimeType: string): { icon: typeof File; color: string } {
  if (isFolder(mimeType)) return { icon: FolderClosed, color: "text-gray-500" };
  if (mimeType === "application/vnd.google-apps.document")
    return { icon: FileText, color: "text-blue-600" };
  if (mimeType === "application/vnd.google-apps.spreadsheet")
    return { icon: Sheet, color: "text-green-600" };
  if (mimeType === "application/vnd.google-apps.presentation")
    return { icon: Presentation, color: "text-orange-500" };
  if (mimeType === "application/pdf")
    return { icon: FileText, color: "text-red-600" };
  if (mimeType.startsWith("image/"))
    return { icon: Image, color: "text-purple-600" };
  return { icon: File, color: "text-gray-400" };
}

function formatFileSize(bytes?: string): string {
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

function formatDate(dateStr?: string, ownerName?: string): string {
  if (!dateStr) return "\u2014";
  const d = new Date(dateStr);
  const day = d.getDate();
  const month = d.toLocaleDateString("es-ES", { month: "short" }).replace(".", "");
  const result = `${day} ${month}`;
  if (ownerName) return `${result} ${ownerName}`;
  return result;
}

function getOwnerName(file: DriveFile): string | undefined {
  return file.lastModifyingUser?.displayName ?? file.owners?.[0]?.displayName;
}

function sortFiles(files: DriveFile[], field: SortField, dir: SortDir): DriveFile[] {
  const folders = files.filter((f) => isFolder(f.mimeType));
  const nonFolders = files.filter((f) => !isFolder(f.mimeType));

  const comparator = (a: DriveFile, b: DriveFile): number => {
    let cmp = 0;
    switch (field) {
      case "name":
        cmp = a.name.localeCompare(b.name, "es");
        break;
      case "modifiedTime":
        cmp =
          new Date(a.modifiedTime ?? 0).getTime() -
          new Date(b.modifiedTime ?? 0).getTime();
        break;
      case "size": {
        const sa = parseInt(a.size ?? "0", 10) || 0;
        const sb = parseInt(b.size ?? "0", 10) || 0;
        cmp = sa - sb;
        break;
      }
    }
    return dir === "asc" ? cmp : -cmp;
  };

  folders.sort(comparator);
  nonFolders.sort(comparator);
  return [...folders, ...nonFolders];
}

/* ------------------------------------------------------------------ */
/*  useClickOutside hook                                               */
/* ------------------------------------------------------------------ */

function useClickOutside(ref: React.RefObject<HTMLElement | null>, handler: () => void) {
  useEffect(() => {
    function listener(e: MouseEvent | TouchEvent) {
      if (!ref.current || ref.current.contains(e.target as Node)) return;
      handler();
    }
    document.addEventListener("mousedown", listener);
    document.addEventListener("touchstart", listener);
    return () => {
      document.removeEventListener("mousedown", listener);
      document.removeEventListener("touchstart", listener);
    };
  }, [ref, handler]);
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
    { id: "", name: "PULSE" },
  ]);
  const [creating, setCreating] = useState(false);
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [activeContextMenu, setActiveContextMenu] = useState<string | null>(null);

  const createMenuRef = useRef<HTMLDivElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

  useClickOutside(createMenuRef, () => setShowCreateMenu(false));
  useClickOutside(contextMenuRef, () => setActiveContextMenu(null));

  const currentFolderId = breadcrumb[breadcrumb.length - 1].id;

  /* Sorted & filtered files ---------------------------------------- */
  const sortedFiles = sortFiles(
    files.filter((f) =>
      searchQuery
        ? f.name.toLowerCase().includes(searchQuery.toLowerCase())
        : true
    ),
    sortField,
    sortDir
  );

  /* Fetch files ---------------------------------------------------- */
  const fetchFiles = useCallback(async (folderId: string, query?: string) => {
    setLoading(true);
    setError(null);
    setNoAccount(false);
    try {
      let url = "/drive/files";
      const params: string[] = [];
      if (folderId) params.push(`folder_id=${encodeURIComponent(folderId)}`);
      if (query) params.push(`q=${encodeURIComponent(query)}`);
      if (params.length) url += `?${params.join("&")}`;
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
  }, []);

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

  /* Sort ----------------------------------------------------------- */
  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  /* Create actions ------------------------------------------------- */
  const createItem = async (
    type: "document" | "spreadsheet" | "presentation" | "folder" | "upload"
  ) => {
    if (type === "upload") return;
    setShowCreateMenu(false);

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
      const parentId = currentFolderId || undefined;
      if (type === "folder") {
        await api<{ folder: DriveFile }>("/drive/folders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, parent_id: parentId }),
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
            parent_id: parentId,
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

  /* Delete --------------------------------------------------------- */
  const deleteFile = async (file: DriveFile) => {
    setActiveContextMenu(null);
    const confirmed = confirm(`\u00bfEliminar "${file.name}"?`);
    if (!confirmed) return;
    try {
      await api(`/drive/files/${file.id}`, { method: "DELETE" });
      fetchFiles(currentFolderId, searchQuery || undefined);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al eliminar";
      alert(msg);
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

  /* Sort arrow ------------------------------------------------------ */
  const SortArrow = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDir === "asc" ? (
      <Icon icon={ChevronUp} size={14} className="text-gray-600 ml-0.5" />
    ) : (
      <Icon icon={ChevronDown} size={14} className="text-gray-600 ml-0.5" />
    );
  };

  /* ---------------------------------------------------------------- */
  /*  Render: No account                                               */
  /* ---------------------------------------------------------------- */
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
            Conecta tu cuenta de Google en Configuraci&oacute;n para ver tus
            archivos de Drive
          </p>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Render: Main                                                     */
  /* ---------------------------------------------------------------- */
  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-white">
      {/* ============================================================ */}
      {/*  Top bar                                                      */}
      {/* ============================================================ */}
      <div className="shrink-0 border-b border-gray-200 bg-white px-4 sm:px-6 py-3 flex items-center gap-3">
        {/* + Nuevo button */}
        <div className="relative" ref={createMenuRef}>
          <button
            onClick={() => setShowCreateMenu((v) => !v)}
            disabled={creating}
            className="inline-flex items-center gap-2 pl-3 pr-4 py-2 text-sm font-medium rounded-full border border-gray-300 bg-white hover:bg-gray-50 shadow-sm hover:shadow transition-all disabled:opacity-50"
          >
            {creating ? (
              <Icon icon={Loader2} size={20} className="animate-spin text-gray-500" />
            ) : (
              <span className="text-lg leading-none font-bold">
                <span className="text-blue-500">+</span>
              </span>
            )}
            <span className="text-gray-700">Nuevo</span>
          </button>

          {/* Dropdown menu */}
          {showCreateMenu && (
            <div className="absolute left-0 top-full mt-2 w-64 bg-white rounded-xl shadow-lg border border-gray-200 py-2 z-50">
              {CREATE_MENU_ITEMS.map((item) => (
                <div key={item.type}>
                  {item.separator && (
                    <div className="border-t border-gray-200 my-1.5 mx-3" />
                  )}
                  <button
                    onClick={() => createItem(item.type)}
                    disabled={item.disabled}
                    className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-colors ${
                      item.disabled
                        ? "text-gray-400 cursor-not-allowed"
                        : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    <span className="text-base">{item.emoji}</span>
                    <span>{item.label}</span>
                    {item.disabled && (
                      <span className="ml-auto text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full">
                        Pronto
                      </span>
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Search */}
        <div className="relative max-w-xs w-full hidden sm:block">
          <Icon
            icon={Search}
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            placeholder="Buscar en Drive"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-full border border-gray-200 bg-gray-100 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
          />
        </div>

        {/* View toggle */}
        <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
          <button
            onClick={() => setViewMode("list")}
            className={`p-1.5 transition-colors ${
              viewMode === "list"
                ? "bg-blue-50 text-blue-600"
                : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
            }`}
            title="Vista de lista"
          >
            <Icon icon={LayoutList} size={18} />
          </button>
          <button
            onClick={() => setViewMode("grid")}
            className={`p-1.5 transition-colors ${
              viewMode === "grid"
                ? "bg-blue-50 text-blue-600"
                : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
            }`}
            title="Vista de cuadr\u00edcula"
          >
            <Icon icon={LayoutGrid} size={18} />
          </button>
        </div>
      </div>

      {/* Mobile search */}
      <div className="shrink-0 px-4 py-2 sm:hidden bg-white border-b border-gray-100">
        <div className="relative">
          <Icon
            icon={Search}
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            placeholder="Buscar en Drive"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-full border border-gray-200 bg-gray-100 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
          />
        </div>
      </div>

      {/* ============================================================ */}
      {/*  Breadcrumb                                                   */}
      {/* ============================================================ */}
      <div className="shrink-0 px-4 sm:px-6 py-2.5 flex items-center gap-1 text-sm text-gray-500 bg-white border-b border-gray-100 overflow-x-auto">
        <span className="text-gray-400 mr-1">
          <Icon icon={FolderClosed} size={16} />
        </span>
        {breadcrumb.map((item, i) => (
          <span key={`${item.id}-${i}`} className="flex items-center gap-1 shrink-0">
            {i > 0 && (
              <Icon icon={ChevronRight} size={14} className="text-gray-300" />
            )}
            <button
              onClick={() => navigateToBreadcrumb(i)}
              className={`hover:text-gray-900 transition-colors whitespace-nowrap ${
                i === breadcrumb.length - 1
                  ? "text-gray-900 font-medium"
                  : "text-gray-500 hover:underline"
              }`}
            >
              {item.name}
            </button>
          </span>
        ))}
      </div>

      {/* ============================================================ */}
      {/*  Content area                                                 */}
      {/* ============================================================ */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Icon icon={Loader2} size={28} className="text-blue-500 animate-spin" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <p className="text-sm text-red-500 mb-3">{error}</p>
              <button
                onClick={() => fetchFiles(currentFolderId, searchQuery || undefined)}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                Reintentar
              </button>
            </div>
          </div>
        ) : sortedFiles.length === 0 ? (
          /* ============================================================ */
          /*  Empty state                                                  */
          /* ============================================================ */
          <div className="flex items-center justify-center py-24">
            <div className="text-center">
              <div className="w-20 h-20 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-4">
                <Icon icon={FolderClosed} size={36} className="text-gray-300" />
              </div>
              <p className="text-base text-gray-500 mb-1">
                {searchQuery
                  ? "No se encontraron resultados"
                  : "Arrastra archivos aqu\u00ed o usa el bot\u00f3n Nuevo"}
              </p>
              {!searchQuery && (
                <p className="text-sm text-gray-400">
                  Crea documentos, hojas de c\u00e1lculo o carpetas
                </p>
              )}
            </div>
          </div>
        ) : viewMode === "grid" ? (
          /* ============================================================ */
          /*  Grid view                                                    */
          /* ============================================================ */
          <div className="p-4 sm:p-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {sortedFiles.map((file) => {
              const { icon, color } = getFileIcon(file.mimeType);
              return (
                <button
                  key={file.id}
                  onClick={() => handleFileClick(file)}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 transition-all text-center group cursor-pointer"
                >
                  <Icon icon={icon} size={32} className={color} />
                  <span className="text-xs text-gray-800 line-clamp-2 leading-tight group-hover:text-blue-700 transition-colors w-full">
                    {file.name}
                  </span>
                  <span className="text-[10px] text-gray-400">
                    {formatDate(file.modifiedTime)}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          /* ============================================================ */
          /*  List view (default)                                          */
          /* ============================================================ */
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs font-medium text-gray-500 border-b border-gray-200">
                <th className="px-4 sm:px-6 py-3">
                  <button
                    onClick={() => toggleSort("name")}
                    className="inline-flex items-center gap-0.5 hover:text-gray-700 transition-colors"
                  >
                    Nombre
                    <SortArrow field="name" />
                  </button>
                </th>
                <th className="px-4 py-3 w-44 hidden sm:table-cell">
                  <button
                    onClick={() => toggleSort("modifiedTime")}
                    className="inline-flex items-center gap-0.5 hover:text-gray-700 transition-colors"
                  >
                    Fecha de modificaci&oacute;n
                    <SortArrow field="modifiedTime" />
                  </button>
                </th>
                <th className="px-4 py-3 w-24 text-right hidden md:table-cell">
                  <button
                    onClick={() => toggleSort("size")}
                    className="inline-flex items-center gap-0.5 hover:text-gray-700 transition-colors ml-auto"
                  >
                    Tama&ntilde;o
                    <SortArrow field="size" />
                  </button>
                </th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody>
              {sortedFiles.map((file) => {
                const { icon, color } = getFileIcon(file.mimeType);
                const isHovered = hoveredRow === file.id;
                const isMenuOpen = activeContextMenu === file.id;
                const noSize =
                  isFolder(file.mimeType) || GOOGLE_NATIVE_MIMES.has(file.mimeType);
                const ownerName = getOwnerName(file);

                return (
                  <tr
                    key={file.id}
                    onClick={() => handleFileClick(file)}
                    onMouseEnter={() => setHoveredRow(file.id)}
                    onMouseLeave={() => {
                      setHoveredRow(null);
                      if (!isMenuOpen) setActiveContextMenu(null);
                    }}
                    className={`border-b border-gray-100 cursor-pointer transition-colors h-12 ${
                      isHovered ? "bg-[#E8F0FE]/60" : "hover:bg-gray-50"
                    }`}
                  >
                    {/* Name */}
                    <td className="px-4 sm:px-6 py-0">
                      <div className="flex items-center gap-3">
                        <Icon icon={icon} size={20} className={`${color} shrink-0`} />
                        <span
                          className={`text-sm truncate transition-colors ${
                            isHovered ? "text-blue-700" : "text-gray-900"
                          }`}
                        >
                          {file.name}
                        </span>
                        {/* Mobile date */}
                        <span className="sm:hidden text-[11px] text-gray-400 shrink-0 ml-auto">
                          {formatDate(file.modifiedTime)}
                        </span>
                      </div>
                    </td>

                    {/* Modified date */}
                    <td className="px-4 py-0 text-xs text-gray-500 hidden sm:table-cell">
                      {formatDate(file.modifiedTime, ownerName)}
                    </td>

                    {/* Size */}
                    <td className="px-4 py-0 text-xs text-gray-500 text-right hidden md:table-cell">
                      {noSize ? "\u2014" : formatFileSize(file.size)}
                    </td>

                    {/* Actions */}
                    <td className="px-2 py-0 relative">
                      <div
                        className={`flex items-center justify-end gap-0.5 transition-opacity ${
                          isHovered || isMenuOpen ? "opacity-100" : "opacity-0"
                        }`}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveContextMenu(
                              isMenuOpen ? null : file.id
                            );
                          }}
                          className="p-1 rounded-full hover:bg-gray-200/80 text-gray-500 hover:text-gray-700 transition-colors"
                          title="M\u00e1s acciones"
                        >
                          <Icon icon={MoreVertical} size={18} />
                        </button>
                      </div>

                      {/* Context menu dropdown */}
                      {isMenuOpen && (
                        <div
                          ref={contextMenuRef}
                          className="absolute right-2 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1.5 z-50"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {file.webViewLink && (
                            <button
                              onClick={() => {
                                setActiveContextMenu(null);
                                window.open(file.webViewLink, "_blank", "noopener");
                              }}
                              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-3 transition-colors"
                            >
                              <Icon icon={FileText} size={16} className="text-gray-400" />
                              Abrir
                            </button>
                          )}
                          {!isFolder(file.mimeType) && (
                            <button
                              onClick={() => {
                                setActiveContextMenu(null);
                                if (file.webViewLink) {
                                  const exportUrl = file.webViewLink.replace(
                                    /\/edit.*$/,
                                    "/export?format=pdf"
                                  );
                                  window.open(exportUrl, "_blank", "noopener");
                                }
                              }}
                              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-3 transition-colors"
                            >
                              <Icon icon={Download} size={16} className="text-gray-400" />
                              Descargar
                            </button>
                          )}
                          <button
                            onClick={() => setActiveContextMenu(null)}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-3 transition-colors"
                          >
                            <Icon icon={Share2} size={16} className="text-gray-400" />
                            Compartir
                          </button>
                          <div className="border-t border-gray-100 my-1" />
                          <button
                            onClick={() => deleteFile(file)}
                            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-3 transition-colors"
                          >
                            <Icon icon={Trash2} size={16} className="text-red-400" />
                            Mover a papelera
                          </button>
                        </div>
                      )}
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
