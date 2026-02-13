import { useState, useEffect } from "react";

const API_BASE = "/api";
const THUMBS_BASE = "/thumbs";
const IMAGES_BASE = "/images";

interface ListResponse {
  directories: string[];
  images: string[];
  videos: string[];
}

function thumbUrl(path: string, filename: string): string {
  const base = filename.substring(0, filename.lastIndexOf("."));
  const rel = path ? `${path}/${base}.webp` : `${base}.webp`;
  return `${THUMBS_BASE}/${rel}`;
}

function rawUrl(path: string, filename: string): string {
  const rel = path ? `${path}/${filename}` : filename;
  return `${IMAGES_BASE}/${rel}`;
}

function FolderIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      className="w-24 h-24 text-purple-400 group-hover:text-purple-300 transition-colors"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.06-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z"
      />
    </svg>
  );
}

export default function App() {
  const [path, setPath] = useState("");
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const url = path
      ? `${API_BASE}/list?path=${encodeURIComponent(path)}`
      : `${API_BASE}/list`;
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json: ListResponse) => setData(json))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [path]);

  const pathParts = path ? path.split("/") : [];

  function navigateTo(index: number) {
    if (index < 0) {
      setPath("");
    } else {
      setPath(pathParts.slice(0, index + 1).join("/"));
    }
  }

  return (
    <div className="min-h-screen bg-[#0d0f14] text-white">
      {/* Header */}
      <header className="border-b border-white/10 bg-[#0d0f14]/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <h1 className="text-xl font-semibold bg-linear-to-r from-[#3245ff] to-[#bc52ee] bg-clip-text text-transparent">
            Gallery
          </h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* Breadcrumbs */}
        <nav className="flex items-center gap-1.5 text-sm mb-6 flex-wrap">
          <button
            onClick={() => navigateTo(-1)}
            className={`hover:text-purple-400 transition-colors ${
              path === "" ? "text-white font-medium" : "text-gray-400"
            }`}
          >
            Home
          </button>
          {pathParts.map((part, i) => (
            <span key={i} className="flex items-center gap-1.5">
              <span className="text-gray-600">/</span>
              <button
                onClick={() => navigateTo(i)}
                className={`hover:text-purple-400 transition-colors ${
                  i === pathParts.length - 1
                    ? "text-white font-medium"
                    : "text-gray-400"
                }`}
              >
                {part}
              </button>
            </span>
          ))}
        </nav>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-4 py-3">
            Failed to load: {error}
          </div>
        )}

        {data && !loading && (
          <>
            {/* Directories */}
            {data.directories.length > 0 && (
              <section className="mb-8">
                <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">
                  Folders
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {data.directories.map((dir) => (
                    <button
                      key={dir}
                      onClick={() =>
                        setPath(path ? `${path}/${dir}` : dir)
                      }
                      className="group flex flex-col items-center gap-3 p-8 rounded-xl bg-white/3 border border-white/6 hover:bg-white/[0.07] hover:border-purple-500/30 transition-all"
                    >
                      <FolderIcon />
                      <span className="text-lg text-gray-300 group-hover:text-white truncate w-full text-center transition-colors">
                        {dir}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Images & Videos */}
            {(data.images.length > 0 || data.videos.length > 0) && (
              <section>
                <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">
                  Files
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {data.images.map((file) => (
                    <a
                      key={file}
                      href={rawUrl(path, file)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group relative aspect-square rounded-xl overflow-hidden bg-white/3 border border-white/6 hover:border-purple-500/30 transition-all"
                    >
                      <img
                        src={thumbUrl(path, file)}
                        alt={file}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/70 to-transparent p-2 pt-6 opacity-0 group-hover:opacity-100 transition-opacity">
                        <p className="text-xs text-white truncate">{file}</p>
                      </div>
                    </a>
                  ))}
                  {data.videos.map((file) => (
                    <a
                      key={file}
                      href={rawUrl(path, file)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group relative aspect-square rounded-xl overflow-hidden bg-white/3 border border-white/6 hover:border-purple-500/30 transition-all"
                    >
                      <img
                        src={thumbUrl(path, file)}
                        alt={file}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      {/* Video badge */}
                      <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm rounded-md px-1.5 py-0.5 text-[10px] font-medium text-white/80">
                        VIDEO
                      </div>
                      <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/70 to-transparent p-2 pt-6 opacity-0 group-hover:opacity-100 transition-opacity">
                        <p className="text-xs text-white truncate">{file}</p>
                      </div>
                    </a>
                  ))}
                </div>
              </section>
            )}

            {/* Empty state */}
            {data.directories.length === 0 &&
              data.images.length === 0 &&
              data.videos.length === 0 && (
                <div className="text-center py-20 text-gray-500">
                  This folder is empty.
                </div>
              )}
          </>
        )}
      </main>
    </div>
  );
}
