import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../../api/client";
import {
  MagnifyingGlassIcon,
  FolderIcon,
  ArrowLeftIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  iconLink?: string;
  modifiedTime?: string;
}

interface GoogleDrivePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onFileSelect: (file: DriveFile) => void;
}

// Map mime types to emoji icons
function getMimeIcon(mimeType: string): string {
  if (mimeType === "application/vnd.google-apps.folder") return "";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return "\u{1F4CA}";
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return "\u{1F4CA}";
  if (mimeType.includes("document") || mimeType.includes("word")) return "\u{1F4DD}";
  if (mimeType.includes("pdf")) return "\u{1F4D5}";
  if (mimeType.includes("image")) return "\u{1F5BC}\uFE0F";
  if (mimeType.includes("video")) return "\u{1F3AC}";
  if (mimeType.includes("audio")) return "\u{1F3B5}";
  if (mimeType.includes("zip") || mimeType.includes("compressed")) return "\u{1F4E6}";
  return "\u{1F4C4}";
}

function getFileTypeName(mimeType: string): string {
  if (mimeType === "application/vnd.google-apps.folder") return "Carpeta";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return "Hoja de calculo";
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return "Presentacion";
  if (mimeType.includes("document") || mimeType.includes("word")) return "Documento";
  if (mimeType.includes("pdf")) return "PDF";
  if (mimeType.includes("image")) return "Imagen";
  if (mimeType.includes("video")) return "Video";
  return "Archivo";
}

export function GoogleDrivePicker({ isOpen, onClose, onFileSelect }: GoogleDrivePickerProps) {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [folderStack, setFolderStack] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentFolderId = folderStack.length > 0 ? folderStack[folderStack.length - 1].id : undefined;

  const fetchFiles = useCallback(async (folderId?: string, query?: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (folderId) params.set("folder_id", folderId);
      if (query) params.set("q", query);
      const res = await api<{ files: DriveFile[] }>(`/drive/files?${params.toString()}`);
      setFiles(res.files || []);
    } catch (err) {
      setError("Error al cargar archivos");
      console.error("Drive fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch files when open state or folder changes
  useEffect(() => {
    if (isOpen) {
      fetchFiles(currentFolderId, searchQuery || undefined);
      // Focus search input
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [isOpen, currentFolderId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle search with debounce
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      fetchFiles(value ? undefined : currentFolderId, value || undefined);
    }, 300);
  };

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen, onClose]);

  const handleFileClick = (file: DriveFile) => {
    if (file.mimeType === "application/vnd.google-apps.folder") {
      // Navigate into folder
      setFolderStack((prev) => [...prev, { id: file.id, name: file.name }]);
      setSearchQuery("");
    } else {
      onFileSelect(file);
      onClose();
    }
  };

  const handleGoBack = () => {
    setFolderStack((prev) => prev.slice(0, -1));
    setSearchQuery("");
  };

  if (!isOpen) return null;

  return (
    <div
      ref={pickerRef}
      className="absolute bottom-full left-0 mb-2 w-80 bg-white rounded-lg shadow-xl border border-border-gray z-50 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border-gray bg-gray-50">
        {folderStack.length > 0 && (
          <button
            onClick={handleGoBack}
            className="p-0.5 text-text-tertiary hover:text-text-body rounded transition-colors"
          >
            <ArrowLeftIcon className="w-4 h-4" />
          </button>
        )}
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
            <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3L27.5 55H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066DA"/>
            <path d="M43.65 25L29.85 0c-1.35.8-2.5 1.9-3.3 3.3L1.2 44.5C.4 45.9 0 47.45 0 49h27.5z" fill="#00AC47"/>
            <path d="M43.65 25L57.45 0c-1.35-.8-2.85-1.2-4.35-1.2H34.55c-1.5 0-3 .45-4.35 1.2z" fill="#EA4335"/>
            <path d="M59.8 55H27.5l-13.75 21.8c1.35.8 2.85 1.2 4.35 1.2h50.6c1.5 0 3-.45 4.35-1.2z" fill="#00832D"/>
            <path d="M73.55 26.5L57.45 0l-13.8 25 16.2 28h27.5c0-1.55-.4-3.1-1.2-4.5z" fill="#2684FC"/>
            <path d="M86.1 49H59.8l13.75 21.8c1.35-.8 2.5-1.9 3.3-3.3L86.1 49z" fill="#FFBA00"/>
          </svg>
          <span className="text-xs font-medium text-text-secondary truncate">
            {folderStack.length > 0 ? folderStack[folderStack.length - 1].name : "Google Drive"}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-0.5 text-text-tertiary hover:text-text-body rounded transition-colors"
        >
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-border-gray">
        <div className="flex items-center gap-2 bg-gray-50 rounded-md px-2 py-1.5">
          <MagnifyingGlassIcon className="w-3.5 h-3.5 text-text-tertiary flex-shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Buscar archivos..."
            className="bg-transparent text-sm text-text-body placeholder:text-text-tertiary outline-none flex-1"
          />
        </div>
      </div>

      {/* File list */}
      <div className="max-h-60 overflow-y-auto">
        {loading ? (
          <div className="px-3 py-6 text-center">
            <div className="inline-block w-5 h-5 border-2 border-gray-300 border-t-brand-primary rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="px-3 py-4 text-center text-sm text-red-500">{error}</div>
        ) : files.length === 0 ? (
          <div className="px-3 py-4 text-center text-sm text-text-tertiary">
            {searchQuery ? "Sin resultados" : "Carpeta vacia"}
          </div>
        ) : (
          files.map((file) => {
            const isFolder = file.mimeType === "application/vnd.google-apps.folder";
            return (
              <button
                key={file.id}
                onClick={() => handleFileClick(file)}
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 transition-colors text-left"
              >
                {isFolder ? (
                  <FolderIcon className="w-5 h-5 text-blue-500 flex-shrink-0" />
                ) : (
                  <span className="text-base flex-shrink-0">{getMimeIcon(file.mimeType)}</span>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-body truncate">{file.name}</p>
                  <p className="text-[11px] text-text-tertiary">{getFileTypeName(file.mimeType)}</p>
                </div>
                {isFolder && (
                  <svg className="w-4 h-4 text-text-tertiary flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
