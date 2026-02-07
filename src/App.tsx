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

export default function App() {
  const [media, setMedia] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/photos/")
      .then(res => res.text())
      .then(html => {
        const doc = new DOMParser().parseFromString(html, "text/html")
        const links = Array.from(doc.querySelectorAll("a"))
          .map(a => a.getAttribute("href"))
          .filter((href): href is string => !!href && isMedia(href))
          .map(href => `/photos/${href}`)
        setMedia(links)
      })
      .catch(() => setError("Failed to load media"))
  }, [])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-950 text-red-400">
        {error}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="px-6 py-10 text-center">
        <h1 className="text-4xl font-bold tracking-tight">Media Vault</h1>
        <p className="mt-3 text-neutral-400">Click any item to view it at full resolution</p>
      </header>

      <main className="px-6 pb-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {media.map(src => (
            <a
              key={src}
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900"
            >
              {isVideo(src) ? (
                <video
                  src={src}
                  muted
                  preload="metadata"
                  className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <img
                  src={src}
                  alt={src}
                  loading="lazy"
                  className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-105"
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
          ))}
        </div>

        {media.length === 0 && (
          <div className="mt-20 text-center text-neutral-500">
            No media found on server
          </div>
        )}
      </main>

      <footer className="border-t border-neutral-800 py-6 text-center text-xs text-neutral-500">
        All rights reserved
      </footer>
    </div>
  )
}
