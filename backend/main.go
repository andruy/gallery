package main

import (
	"embed"
	"encoding/json"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"

	"github.com/chai2010/webp"
	"golang.org/x/image/draw"
	_ "golang.org/x/image/webp"
)

const (
	imagesDir    = "./images"
	thumbsDir    = "./thumbs"
	thumbWidth   = 300
	maxWorkers   = 4
	listenAddr   = ":9000"
	webpQuality  = 80
	videoQuality = 75
)

var (
	imageExts = map[string]bool{
		".jpg": true, ".jpeg": true, ".png": true, ".gif": true, ".webp": true,
	}
	videoExts = map[string]bool{
		".mp4": true, ".mov": true, ".mkv": true, ".webm": true,
	}

	// Semaphore to limit concurrent thumbnail generation.
	workerSem = make(chan struct{}, maxWorkers)

	// Per-file mutex to prevent concurrent generation of the same thumbnail.
	thumbLocks sync.Map // map[string]*sync.Mutex
)

//go:embed all:static
var staticFiles embed.FS

type ListResponse struct {
	Directories []string `json:"directories"`
	Images      []string `json:"images"`
	Videos      []string `json:"videos"`
}

func main() {
	os.MkdirAll(thumbsDir, 0o755)

	mux := http.NewServeMux()
	mux.HandleFunc("/api/list", handleList)
	mux.HandleFunc("/thumbs/", handleThumb)
	mux.HandleFunc("/images/", handleImage)

	// Serve the embedded frontend SPA.
	staticFS, _ := fs.Sub(staticFiles, "static")
	fileServer := http.FileServer(http.FS(staticFS))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// Try to serve the file directly; fall back to index.html for SPA routing.
		path := strings.TrimPrefix(r.URL.Path, "/")
		if path == "" {
			path = "index.html"
		}
		if _, err := fs.Stat(staticFS, path); err != nil {
			r.URL.Path = "/"
		}
		fileServer.ServeHTTP(w, r)
	})

	handler := corsMiddleware(mux)

	log.Printf("Gallery server listening on %s", listenAddr)
	log.Fatal(http.ListenAndServe(listenAddr, handler))
}

// corsMiddleware sets CORS headers on all responses.
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// safePath validates and cleans a relative path, rejecting traversal attempts.
func safePath(rel string) (string, error) {
	if filepath.IsAbs(rel) {
		return "", fmt.Errorf("absolute paths not allowed")
	}
	cleaned := filepath.Clean(rel)
	if cleaned == "." {
		cleaned = ""
	}
	if strings.Contains(cleaned, "..") {
		return "", fmt.Errorf("path traversal not allowed")
	}
	return cleaned, nil
}

func handleList(w http.ResponseWriter, r *http.Request) {
	reqPath := r.URL.Query().Get("path")
	rel, err := safePath(reqPath)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	dirPath := filepath.Join(imagesDir, rel)
	entries, err := os.ReadDir(dirPath)
	if err != nil {
		if os.IsNotExist(err) {
			http.Error(w, "directory not found", http.StatusNotFound)
		} else {
			http.Error(w, "failed to read directory", http.StatusInternalServerError)
		}
		return
	}

	resp := ListResponse{
		Directories: []string{},
		Images:      []string{},
		Videos:      []string{},
	}

	var thumbTargets []string

	for _, entry := range entries {
		name := entry.Name()
		if strings.HasPrefix(name, ".") {
			continue
		}
		if entry.IsDir() {
			resp.Directories = append(resp.Directories, name)
			continue
		}
		ext := strings.ToLower(filepath.Ext(name))
		entryRel := filepath.Join(rel, name)
		if imageExts[ext] {
			resp.Images = append(resp.Images, name)
			thumbTargets = append(thumbTargets, entryRel)
		} else if videoExts[ext] {
			resp.Videos = append(resp.Videos, name)
			thumbTargets = append(thumbTargets, entryRel)
		}
	}

	// Kick off background thumbnail pre-generation.
	for _, t := range thumbTargets {
		go pregenThumb(t)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func handleImage(w http.ResponseWriter, r *http.Request) {
	rel := strings.TrimPrefix(r.URL.Path, "/images/")
	clean, err := safePath(rel)
	if err != nil || clean == "" {
		http.Error(w, "invalid path", http.StatusBadRequest)
		return
	}
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	http.ServeFile(w, r, filepath.Join(imagesDir, clean))
}

func handleThumb(w http.ResponseWriter, r *http.Request) {
	rel := strings.TrimPrefix(r.URL.Path, "/thumbs/")
	clean, err := safePath(rel)
	if err != nil || clean == "" {
		http.Error(w, "invalid path", http.StatusBadRequest)
		return
	}

	thumbPath := filepath.Join(thumbsDir, clean)

	// If thumbnail doesn't exist, find the source and generate synchronously.
	if _, err := os.Stat(thumbPath); os.IsNotExist(err) {
		srcRel := webpToSource(clean)
		if srcRel == "" {
			http.Error(w, "source file not found", http.StatusNotFound)
			return
		}
		if err := generateThumb(srcRel); err != nil {
			log.Printf("thumb generation failed for %s: %v", srcRel, err)
			http.Error(w, "thumbnail generation failed", http.StatusInternalServerError)
			return
		}
	}

	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	w.Header().Set("Content-Type", "image/webp")
	http.ServeFile(w, r, thumbPath)
}

// webpToSource finds the actual source file for a .webp thumb path.
// E.g. "vacation/photo.webp" -> "vacation/photo.jpg" (whichever exists).
func webpToSource(webpRel string) string {
	base := strings.TrimSuffix(webpRel, filepath.Ext(webpRel))
	for ext := range imageExts {
		candidate := base + ext
		if _, err := os.Stat(filepath.Join(imagesDir, candidate)); err == nil {
			return candidate
		}
		upper := base + strings.ToUpper(ext)
		if _, err := os.Stat(filepath.Join(imagesDir, upper)); err == nil {
			return upper
		}
	}
	for ext := range videoExts {
		candidate := base + ext
		if _, err := os.Stat(filepath.Join(imagesDir, candidate)); err == nil {
			return candidate
		}
		upper := base + strings.ToUpper(ext)
		if _, err := os.Stat(filepath.Join(imagesDir, upper)); err == nil {
			return upper
		}
	}
	return ""
}

// pregenThumb generates a thumbnail in the background if it doesn't exist.
func pregenThumb(rel string) {
	thumbPath := thumbPathFor(rel)
	if _, err := os.Stat(thumbPath); err == nil {
		return // already exists
	}
	workerSem <- struct{}{}
	defer func() { <-workerSem }()
	if err := generateThumb(rel); err != nil {
		log.Printf("background thumb generation failed for %s: %v", rel, err)
	}
}

// generateThumb generates a thumbnail for the given source path (relative to imagesDir).
// Uses per-file locking to prevent duplicate work.
func generateThumb(rel string) error {
	thumbPath := thumbPathFor(rel)

	mu, _ := thumbLocks.LoadOrStore(thumbPath, &sync.Mutex{})
	mu.(*sync.Mutex).Lock()
	defer mu.(*sync.Mutex).Unlock()

	// Re-check after acquiring lock — another goroutine may have just created it.
	if _, err := os.Stat(thumbPath); err == nil {
		return nil
	}
	return doGenerateThumb(rel, thumbPath)
}

// thumbPathFor returns the thumbnail file path for a source file.
func thumbPathFor(rel string) string {
	ext := filepath.Ext(rel)
	base := strings.TrimSuffix(rel, ext)
	return filepath.Join(thumbsDir, base+".webp")
}

func doGenerateThumb(rel, thumbPath string) error {
	srcPath := filepath.Join(imagesDir, rel)
	ext := strings.ToLower(filepath.Ext(rel))

	os.MkdirAll(filepath.Dir(thumbPath), 0o755)

	if videoExts[ext] {
		return generateVideoThumb(srcPath, thumbPath)
	}
	return generateImageThumb(srcPath, thumbPath)
}

func generateImageThumb(srcPath, thumbPath string) error {
	f, err := os.Open(srcPath)
	if err != nil {
		return fmt.Errorf("open source: %w", err)
	}
	defer f.Close()

	src, _, err := image.Decode(f)
	if err != nil {
		return fmt.Errorf("decode image: %w", err)
	}

	bounds := src.Bounds()
	srcW := bounds.Dx()
	srcH := bounds.Dy()
	if srcW == 0 {
		return fmt.Errorf("source image has zero width")
	}

	dstW := thumbWidth
	dstH := srcH * thumbWidth / srcW
	if dstH == 0 {
		dstH = 1
	}

	dst := image.NewRGBA(image.Rect(0, 0, dstW, dstH))
	draw.CatmullRom.Scale(dst, dst.Bounds(), src, bounds, draw.Over, nil)

	out, err := os.Create(thumbPath)
	if err != nil {
		return fmt.Errorf("create thumb file: %w", err)
	}
	defer out.Close()

	if err := webp.Encode(out, dst, &webp.Options{Quality: webpQuality}); err != nil {
		os.Remove(thumbPath)
		return fmt.Errorf("encode webp: %w", err)
	}
	log.Printf("generated thumb: %s", thumbPath)
	return nil
}

func generateVideoThumb(srcPath, thumbPath string) error {
	cmd := exec.Command("ffmpeg",
		"-i", srcPath,
		"-vframes", "1",
		"-ss", "1",
		"-vf", fmt.Sprintf("scale=%d:-1", thumbWidth),
		"-f", "webp",
		"-quality", fmt.Sprintf("%d", videoQuality),
		"-y",
		thumbPath,
	)
	output, err := cmd.CombinedOutput()
	if err != nil {
		os.Remove(thumbPath)
		return fmt.Errorf("ffmpeg: %w\n%s", err, string(output))
	}
	log.Printf("generated video thumb: %s", thumbPath)
	return nil
}
