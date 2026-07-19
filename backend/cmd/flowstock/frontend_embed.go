//go:build embed_frontend

package main

import (
	"embed"
	"io/fs"
	"log"
	"net/http"
	"strings"
)

//go:embed dist
var frontendFS embed.FS

// newFrontendHandler serves the embedded React build, falling back to
// index.html for client-side routes (SPA).
func newFrontendHandler() http.HandlerFunc {
	distFS, err := fs.Sub(frontendFS, "dist")
	if err != nil {
		log.Fatal("embedded frontend dist not found:", err)
	}
	fileServer := http.FileServer(http.FS(distFS))
	return func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/")
		if path == "" {
			path = "index.html"
		}
		if _, err := fs.Stat(distFS, path); err != nil {
			r.URL.Path = "/"
		}
		fileServer.ServeHTTP(w, r)
	}
}
