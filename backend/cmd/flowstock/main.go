// Command flowstock is a single self-hosted binary that runs one branch of a
// FlowStock deployment: an inventory app served in the browser, backed by a
// local SQLite database, that syncs peer-to-peer with the business's other
// branches. Run it on a laptop, a shop counter PC, a server, a NAS or a Pi.
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"flowstock/backend/internal/api"
	"flowstock/backend/internal/auth"
	"flowstock/backend/internal/config"
	"flowstock/backend/internal/store"
	syncpkg "flowstock/backend/internal/sync"
)

// Version is injected at build time via -ldflags "-X main.Version=vX.Y.Z".
var Version = "dev"

// securityHeaders sets baseline headers. Frame embedding follows
// cfg.FrameAncestors so the Vulos OS shell can host FlowStock in an iframe;
// empty (default) blocks all cross-origin framing.
func securityHeaders(cfg *config.Config, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if cfg.FrameAncestors != "" {
			w.Header().Set("Content-Security-Policy", "frame-ancestors "+cfg.FrameAncestors)
		} else {
			w.Header().Set("X-Frame-Options", "DENY")
			w.Header().Set("Content-Security-Policy", "frame-ancestors 'self'")
		}
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		next.ServeHTTP(w, r)
	})
}

func main() {
	portFlag := flag.String("port", "", "override listen port")
	versionFlag := flag.Bool("version", false, "print version and exit")
	flag.Parse()

	if *versionFlag {
		fmt.Println("flowstock", Version)
		return
	}

	cfg := config.Load()
	if *portFlag != "" {
		cfg.Port = *portFlag
	}

	st, err := store.Open(cfg.DBPath())
	if err != nil {
		log.Fatalf("open database: %v", err)
	}
	defer st.Close()

	syncEngine := syncpkg.New(st, func() string { return st.GetSetting("sync_secret") })
	apiServer := api.New(st, syncEngine, Version)
	authHandler := auth.New(cfg.Password)

	mux := http.NewServeMux()

	// Public: auth + the sync mesh (which carries its own bearer-secret auth).
	mux.HandleFunc("POST /api/auth/login", authHandler.Login)
	mux.HandleFunc("GET /api/auth/check", authHandler.Check)
	mux.Handle("DELETE /api/auth/logout", authHandler.Middleware(http.HandlerFunc(authHandler.Logout)))
	mux.Handle("/api/sync/vector", syncEngine.Handler())
	mux.Handle("/api/sync/ops", syncEngine.Handler())
	mux.Handle("/api/sync/pull", syncEngine.Handler())
	mux.Handle("/api/sync/ping", syncEngine.Handler())

	// Protected application API.
	appMux := http.NewServeMux()
	apiServer.Routes(appMux)
	mux.Handle("/api/", authHandler.Middleware(appMux))

	// Frontend (embedded in release builds; dev-proxied otherwise).
	mux.Handle("/", newFrontendHandler())

	// Background peer sync once a minute.
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go syncEngine.RunBackground(ctx, time.Minute)

	srv := &http.Server{
		Addr:              cfg.Addr(),
		Handler:           securityHeaders(cfg, mux),
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Printf("FlowStock %s — branch %q — http://%s", Version, st.GetSetting("branch_name"), cfg.Addr())
		if st.GetSetting("sync_secret") != "" {
			log.Printf("sync mesh live on the same port (bearer-authenticated)")
		}
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop
	log.Println("shutting down…")
	shutCtx, shutCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutCancel()
	_ = srv.Shutdown(shutCtx)
}
