import { useEffect, useState } from "react"

// Assumes Apache autoindex is enabled for the root directory
// and that images are directly accessible via /filename.ext

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif"]

function isImage(href: string) {
  return IMAGE_EXTENSIONS.some(ext => href.toLowerCase().endsWith(ext))
}

export default function App() {
  const [images, setImages] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/photos/")
      .then(res => res.text())
      .then(html => {
        const doc = new DOMParser().parseFromString(html, "text/html")
        const links = Array.from(doc.querySelectorAll("a"))
          .map(a => a.getAttribute("href"))
          .filter((href): href is string => !!href && isImage(href))
          .map(href => `/photos/${href}`)
        setImages(links)
      })
      .catch(() => setError("Failed to load images"))
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
        <h1 className="text-4xl font-bold tracking-tight">Image Vault</h1>
        <p className="mt-3 text-neutral-400">Click any image to view it at full resolution</p>
      </header>

      <main className="px-6 pb-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {images.map(src => (
            <a
              key={src}
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900"
            >
              <img
                src={src}
                alt={src}
                loading="lazy"
                className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition" />
            </a>
          ))}
        </div>

        {images.length === 0 && (
          <div className="mt-20 text-center text-neutral-500">
            No images found in server
          </div>
        )}
      </main>

      <footer className="border-t border-neutral-800 py-6 text-center text-xs text-neutral-500">
        All rights reserved
      </footer>
    </div>
  )
}
