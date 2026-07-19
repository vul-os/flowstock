//go:build !embed_frontend

package main

import (
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
)

// newFrontendHandler proxies to the Vite dev server in development builds
// (default). Set FLOWSTOCK_VITE to override the dev server URL. Release builds
// use the embed_frontend tag and serve the bundled assets instead.
func newFrontendHandler() http.HandlerFunc {
	target := os.Getenv("FLOWSTOCK_VITE")
	if target == "" {
		target = "http://localhost:5173"
	}
	u, err := url.Parse(target)
	if err != nil {
		log.Fatalf("bad FLOWSTOCK_VITE url: %v", err)
	}
	proxy := httputil.NewSingleHostReverseProxy(u)
	log.Printf("dev mode: proxying frontend to %s (run `npm run dev`)", target)
	return func(w http.ResponseWriter, r *http.Request) {
		proxy.ServeHTTP(w, r)
	}
}
