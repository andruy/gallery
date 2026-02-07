import { useEffect, useState } from "react"

// Assumes Apache autoindex is enabled for the root directory
// and that images are directly accessible via /filename.ext

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif"]
const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov", ".mkv"]

function isImage(href: string) {
  return IMAGE_EXTENSIONS.some(ext => href.toLowerCase().endsWith(ext))
}

function isVideo(href: string) {
  return VIDEO_EXTENSIONS.some(ext => href.toLowerCase().endsWith(ext))
}

function isMedia(href: string) {
  return isImage(href) || isVideo(href)
}

function isFolder(href: string) {
  return href.endsWith("/") && href !== "../" && !href.startsWith("/") && !href.startsWith("http")
}

function MediaThumbnail({ src }: { src: string }) {
  const [loaded, setLoaded] = useState(false)

  return (
    <a
      href={src}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900"
    >
      {!loaded && (
        <div className="absolute inset-0 bg-neutral-800 animate-pulse" />
      )}
      {isVideo(src) ? (
        <video
          src={src}
          muted
          preload="metadata"
          onLoadedData={() => setLoaded(true)}
          className={`aspect-square w-full object-cover transition-all duration-300 group-hover:scale-105 ${loaded ? "opacity-100" : "opacity-0"}`}
        />
      ) : (
        <img
          src={src}
          alt={src}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          className={`aspect-square w-full object-cover transition-all duration-300 group-hover:scale-105 ${loaded ? "opacity-100" : "opacity-0"}`}
        />
      )}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition" />
      {isVideo(src) && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-12 h-12 rounded-full bg-black/60 flex items-center justify-center">
            <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M6.3 2.8A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.31l9.9-5.89a1.5 1.5 0 000-2.62L6.3 2.8z" />
            </svg>
          </div>
        </div>
      )}
    </a>
  )
}

export default function App() {
  const [currentPath, setCurrentPath] = useState("/Home/")
  const [folders, setFolders] = useState<string[]>([])
  const [media, setMedia] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setError(null)
    fetch(currentPath)
      .then(res => res.text())
      .then(html => {
        const doc = new DOMParser().parseFromString(html, "text/html")
        const hrefs = Array.from(doc.querySelectorAll("a"))
          .map(a => a.getAttribute("href"))
          .filter((href): href is string => !!href)

        setFolders(
          hrefs
            .filter(isFolder)
            .map(href => currentPath + href)
        )
        setMedia(
          hrefs
            .filter(isMedia)
            .map(href => currentPath + href)
        )
      })
      .catch(() => setError("Failed to load media"))
  }, [currentPath])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-950 text-red-400">
        {error}
      </div>
    )
  }

  const pathSegments = currentPath.replace(/\/$/, "").split("/").filter(Boolean)

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="px-6 py-10 text-center">
        <h1 className="text-4xl font-bold tracking-tight">Media Vault</h1>
        <p className="mt-3 text-neutral-400">Click any item to view it at full resolution</p>
      </header>

      <nav className="px-6 pb-4 flex items-center gap-1 text-sm text-neutral-400">
        {pathSegments.map((segment, i) => {
          const segmentPath = "/" + pathSegments.slice(0, i + 1).join("/") + "/"
          const isLast = i === pathSegments.length - 1
          return (
            <span key={segmentPath} className="flex items-center gap-1">
              {i > 0 && <span className="text-neutral-600">/</span>}
              {isLast ? (
                <span className="text-neutral-100">{segment}</span>
              ) : (
                <button
                  onClick={() => setCurrentPath(segmentPath)}
                  className="hover:text-neutral-100 transition-colors cursor-pointer"
                >
                  {segment}
                </button>
              )}
            </span>
          )
        })}
      </nav>

      <main className="px-6 pb-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {folders.map(folder => {
            const name = folder.replace(/\/$/, "").split("/").pop()
            return (
              <button
                key={folder}
                onClick={() => setCurrentPath(folder)}
                className="group relative overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900 aspect-square flex flex-col items-center justify-center gap-3 transition-colors hover:border-neutral-600 cursor-pointer"
              >
                <svg className="w-16 h-16 text-neutral-500 group-hover:text-neutral-300 transition-colors" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                </svg>
                <span className="text-sm text-neutral-300 group-hover:text-neutral-100 transition-colors truncate max-w-[80%]">
                  {name}
                </span>
              </button>
            )
          })}

          {media.map(src => (
            <MediaThumbnail key={src} src={src} />
          ))}
        </div>

        {folders.length === 0 && media.length === 0 && (
          <div className="mt-20 text-center text-neutral-500">
            No media or folders found
          </div>
        )}
      </main>

      <footer className="border-t border-neutral-800 py-6 text-center text-xs text-neutral-500">
        All rights reserved
      </footer>
    </div>
  )
}
