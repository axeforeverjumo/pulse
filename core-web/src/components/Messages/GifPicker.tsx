import { useState, useEffect, useRef, useCallback } from "react";

export interface GifResult {
  id: string;
  url: string;        // Full size URL
  preview: string;    // Small preview URL
  width: number;
  height: number;
  title: string;
}

interface GifPickerProps {
  onSelect: (gif: GifResult) => void;
  onClose: () => void;
}

// Tenor API v2 - Google's default public Tenor key
const TENOR_API_KEY = "AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ";

export default function GifPicker({ onSelect, onClose }: GifPickerProps) {
  const [query, setQuery] = useState("");
  const [gifs, setGifs] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [trending, setTrending] = useState<GifResult[]>([]);
  const searchTimeoutRef = useRef<NodeJS.Timeout>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch trending on mount
  useEffect(() => {
    fetchTrending();
  }, []);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const mapTenorResults = (results: unknown[]): GifResult[] => {
    return (results || []).map((r: unknown) => {
      const item = r as Record<string, unknown>;
      const formats = item.media_formats as Record<string, { url?: string; dims?: number[] }> | undefined;
      return {
        id: item.id as string,
        url: formats?.gif?.url || formats?.mediumgif?.url || "",
        preview: formats?.tinygif?.url || formats?.nanogif?.url || "",
        width: formats?.gif?.dims?.[0] || 200,
        height: formats?.gif?.dims?.[1] || 200,
        title: (item.content_description as string) || "",
      };
    });
  };

  const fetchTrending = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `https://tenor.googleapis.com/v2/featured?key=${TENOR_API_KEY}&limit=20&media_filter=gif,tinygif&contentfilter=medium`
      );
      const data = await res.json();
      setTrending(mapTenorResults(data.results));
    } catch (err) {
      console.error("Failed to fetch trending GIFs:", err);
    } finally {
      setLoading(false);
    }
  };

  const searchGifs = async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setGifs([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `https://tenor.googleapis.com/v2/search?key=${TENOR_API_KEY}&q=${encodeURIComponent(searchQuery)}&limit=20&media_filter=gif,tinygif&contentfilter=medium`
      );
      const data = await res.json();
      setGifs(mapTenorResults(data.results));
    } catch (err) {
      console.error("Failed to search GIFs:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = useCallback((value: string) => {
    setQuery(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => searchGifs(value), 300);
  }, []);

  const displayGifs = query.trim() ? gifs : trending;

  return (
    <div
      ref={containerRef}
      className="absolute bottom-full left-0 mb-2 w-[340px] bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden z-50"
    >
      {/* Search */}
      <div className="p-3 border-b border-gray-100">
        <input
          type="text"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Buscar GIFs..."
          autoFocus
          className="w-full px-3 py-2 text-sm bg-gray-50 rounded-lg border-0 focus:outline-none focus:ring-1 focus:ring-violet-300"
        />
      </div>

      {/* Grid */}
      <div className="h-[300px] overflow-y-auto p-2">
        {loading && displayGifs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            Cargando...
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {displayGifs.map((gif) => (
              <button
                key={gif.id}
                onClick={() => onSelect(gif)}
                className="relative rounded-lg overflow-hidden hover:ring-2 hover:ring-violet-400 transition-all group"
                style={{ aspectRatio: `${gif.width}/${Math.min(gif.height, gif.width)}` }}
              >
                <img
                  src={gif.preview}
                  alt={gif.title}
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
              </button>
            ))}
          </div>
        )}
        {!loading && displayGifs.length === 0 && query.trim() && (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            No se encontraron GIFs
          </div>
        )}
      </div>

      {/* Tenor attribution */}
      <div className="px-3 py-1.5 border-t border-gray-100 flex items-center justify-end">
        <span className="text-[10px] text-gray-400">Powered by Tenor</span>
      </div>
    </div>
  );
}
