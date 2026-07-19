// Package auth provides an optional single-password gate. When no password is
// configured FlowStock runs open (suitable for a trusted single-user machine
// or when fronted by the Vulos OS shell); when a password is set, the app and
// its data API require a session token, while the /api/sync/* mesh keeps its
// own bearer-secret auth.
package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"time"
)

type session struct {
	expires time.Time
}

type Auth struct {
	password string
	mu       sync.Mutex
	sessions map[string]session
}

func New(password string) *Auth {
	return &Auth{password: password, sessions: map[string]session{}}
}

// Enabled reports whether a password gate is active.
func (a *Auth) Enabled() bool { return a.password != "" }

func newToken() string {
	b := make([]byte, 24)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func (a *Auth) issue() string {
	tok := newToken()
	a.mu.Lock()
	a.sessions[tok] = session{expires: time.Now().Add(30 * 24 * time.Hour)}
	a.mu.Unlock()
	return tok
}

func (a *Auth) valid(tok string) bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	s, ok := a.sessions[tok]
	if !ok {
		return false
	}
	if time.Now().After(s.expires) {
		delete(a.sessions, tok)
		return false
	}
	return true
}

func tokenFrom(r *http.Request) string {
	if h := r.Header.Get("Authorization"); strings.HasPrefix(h, "Bearer ") {
		return strings.TrimPrefix(h, "Bearer ")
	}
	if c, err := r.Cookie("flowstock_session"); err == nil {
		return c.Value
	}
	return ""
}

// Login exchanges a password for a session token.
func (a *Auth) Login(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Password string `json:"password"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if !a.Enabled() {
		writeJSON(w, map[string]any{"token": "", "auth": false})
		return
	}
	if subtle.ConstantTimeCompare([]byte(body.Password), []byte(a.password)) != 1 {
		http.Error(w, "invalid password", http.StatusUnauthorized)
		return
	}
	tok := a.issue()
	http.SetCookie(w, &http.Cookie{
		Name: "flowstock_session", Value: tok, Path: "/",
		HttpOnly: true, SameSite: http.SameSiteLaxMode,
		Expires: time.Now().Add(30 * 24 * time.Hour),
	})
	writeJSON(w, map[string]any{"token": tok, "auth": true})
}

// Check reports whether auth is required and whether the caller is authed.
func (a *Auth) Check(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]any{
		"auth_required": a.Enabled(),
		"authed":        !a.Enabled() || a.valid(tokenFrom(r)),
	})
}

// Logout invalidates the caller's session.
func (a *Auth) Logout(w http.ResponseWriter, r *http.Request) {
	tok := tokenFrom(r)
	a.mu.Lock()
	delete(a.sessions, tok)
	a.mu.Unlock()
	http.SetCookie(w, &http.Cookie{Name: "flowstock_session", Value: "", Path: "/", MaxAge: -1})
	w.WriteHeader(http.StatusNoContent)
}

// Middleware gates a handler behind a valid session (no-op when disabled).
func (a *Auth) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if a.Enabled() && !a.valid(tokenFrom(r)) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}
