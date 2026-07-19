package auth

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// login drives a real Login round-trip and returns the issued token plus the
// session cookie the handler set (if any).
func login(t *testing.T, a *Auth, password string) (int, string, *http.Cookie) {
	t.Helper()
	body := `{"password":` + quote(password) + `}`
	r := httptest.NewRequest("POST", "/api/auth/login", strings.NewReader(body))
	w := httptest.NewRecorder()
	a.Login(w, r)

	var out struct {
		Token string `json:"token"`
		Auth  bool   `json:"auth"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &out)
	var cookie *http.Cookie
	for _, c := range w.Result().Cookies() {
		if c.Name == "flowstock_session" {
			cookie = c
		}
	}
	return w.Code, out.Token, cookie
}

func quote(s string) string {
	b, _ := json.Marshal(s)
	return string(b)
}

// probe runs a request through Middleware and reports the status a protected
// handler would answer with. 200 means the caller got through.
func probe(t *testing.T, a *Auth, decorate func(*http.Request)) int {
	t.Helper()
	reached := false
	h := a.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reached = true
		w.WriteHeader(http.StatusOK)
	}))
	r := httptest.NewRequest("GET", "/api/rows/products", nil)
	if decorate != nil {
		decorate(r)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code == http.StatusOK && !reached {
		t.Fatal("middleware reported 200 without reaching the protected handler")
	}
	if w.Code != http.StatusOK && reached {
		t.Fatalf("middleware answered %d but the protected handler still ran", w.Code)
	}
	return w.Code
}

func bearer(tok string) func(*http.Request) {
	return func(r *http.Request) { r.Header.Set("Authorization", "Bearer "+tok) }
}

func sessionCookie(tok string) func(*http.Request) {
	return func(r *http.Request) {
		r.AddCookie(&http.Cookie{Name: "flowstock_session", Value: tok})
	}
}

// ── disabled (open) mode ─────────────────────────────────────────────────────

func TestDisabledRunsOpen(t *testing.T) {
	a := New("")
	if a.Enabled() {
		t.Fatal("no password configured should mean the gate is disabled")
	}
	// Every caller gets through, with or without credentials.
	for name, decorate := range map[string]func(*http.Request){
		"no credentials":  nil,
		"garbage bearer":  bearer("not-a-real-token"),
		"garbage cookie":  sessionCookie("not-a-real-token"),
		"empty bearer":    bearer(""),
		"unrelated token": bearer("00000000"),
	} {
		if code := probe(t, a, decorate); code != http.StatusOK {
			t.Fatalf("%s: open mode must let the request through, got %d", name, code)
		}
	}
}

func TestDisabledLoginIssuesNothing(t *testing.T) {
	a := New("")
	code, tok, cookie := login(t, a, "anything")
	if code != http.StatusOK {
		t.Fatalf("login against an open install should succeed, got %d", code)
	}
	if tok != "" {
		t.Fatal("open mode must not issue a session token")
	}
	if cookie != nil {
		t.Fatal("open mode must not set a session cookie")
	}
}

func TestCheckReportsState(t *testing.T) {
	check := func(a *Auth, decorate func(*http.Request)) (bool, bool) {
		r := httptest.NewRequest("GET", "/api/auth/check", nil)
		if decorate != nil {
			decorate(r)
		}
		w := httptest.NewRecorder()
		a.Check(w, r)
		var out struct {
			Required bool `json:"auth_required"`
			Authed   bool `json:"authed"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
			t.Fatalf("check response is not JSON: %v", err)
		}
		return out.Required, out.Authed
	}

	open := New("")
	if req, authed := check(open, nil); req || !authed {
		t.Fatalf("open install should report required=false authed=true, got %v/%v", req, authed)
	}

	gated := New("hunter2")
	if req, authed := check(gated, nil); !req || authed {
		t.Fatalf("gated install with no session should report required=true authed=false, got %v/%v", req, authed)
	}
	_, tok, _ := login(t, gated, "hunter2")
	if req, authed := check(gated, bearer(tok)); !req || !authed {
		t.Fatalf("gated install with a session should report required=true authed=true, got %v/%v", req, authed)
	}
}

// ── password gate ────────────────────────────────────────────────────────────

func TestLoginRejectsWrongPassword(t *testing.T) {
	const pw = "correct horse battery staple"
	cases := map[string]string{
		"empty":            "",
		"wrong":            "wrong password",
		"prefix":           "correct horse battery stapl",
		"suffix":           "correct horse battery staple ",
		"case-shifted":     "Correct Horse Battery Staple",
		"same-length-diff": strings.Repeat("x", len(pw)),
	}
	for name, attempt := range cases {
		t.Run(name, func(t *testing.T) {
			a := New(pw)
			code, tok, cookie := login(t, a, attempt)
			if code != http.StatusUnauthorized {
				t.Fatalf("expected 401 for %q, got %d", attempt, code)
			}
			if tok != "" || cookie != nil {
				t.Fatal("a failed login must not issue a token or cookie")
			}
		})
	}
}

func TestLoginIssuesUsableSession(t *testing.T) {
	a := New("hunter2")
	code, tok, cookie := login(t, a, "hunter2")
	if code != http.StatusOK {
		t.Fatalf("correct password should authenticate, got %d", code)
	}
	if tok == "" {
		t.Fatal("a successful login must issue a token")
	}
	if cookie == nil {
		t.Fatal("a successful login must set the session cookie")
	}
	if !cookie.HttpOnly {
		t.Fatal("the session cookie must be HttpOnly so scripts cannot read it")
	}
	if cookie.SameSite != http.SameSiteLaxMode {
		t.Fatal("the session cookie must be SameSite=Lax to blunt cross-site use")
	}
	if cookie.Value != tok {
		t.Fatal("the cookie and the JSON token should carry the same session")
	}
	// The session works over either transport the app uses.
	if got := probe(t, a, bearer(tok)); got != http.StatusOK {
		t.Fatalf("bearer token should pass the gate, got %d", got)
	}
	if got := probe(t, a, sessionCookie(tok)); got != http.StatusOK {
		t.Fatalf("session cookie should pass the gate, got %d", got)
	}
}

func TestMiddlewareRejectsWithoutValidSession(t *testing.T) {
	a := New("hunter2")
	_, good, _ := login(t, a, "hunter2")

	cases := map[string]func(*http.Request){
		"no credentials":        nil,
		"empty bearer":          bearer(""),
		"forged token":          bearer("deadbeefdeadbeefdeadbeefdeadbeef"),
		"forged cookie":         sessionCookie("deadbeefdeadbeefdeadbeefdeadbeef"),
		"token with whitespace": bearer(good + " "),
		"truncated token":       bearer(good[:len(good)-1]),
		"wrong scheme":          func(r *http.Request) { r.Header.Set("Authorization", "Basic "+good) },
		"wrong cookie name":     func(r *http.Request) { r.AddCookie(&http.Cookie{Name: "session", Value: good}) },
	}
	for name, decorate := range cases {
		t.Run(name, func(t *testing.T) {
			if code := probe(t, a, decorate); code != http.StatusUnauthorized {
				t.Fatalf("expected 401, got %d", code)
			}
		})
	}
}

// A session minted by one install must be worthless against another, even when
// both happen to share the same password.
func TestSessionsAreNotPortableBetweenInstances(t *testing.T) {
	a := New("hunter2")
	b := New("hunter2")
	_, tok, _ := login(t, a, "hunter2")
	if code := probe(t, a, bearer(tok)); code != http.StatusOK {
		t.Fatalf("token should work on its own instance, got %d", code)
	}
	if code := probe(t, b, bearer(tok)); code != http.StatusUnauthorized {
		t.Fatalf("a foreign instance must reject the token, got %d", code)
	}
}

func TestTokensAreUniqueAndUnguessable(t *testing.T) {
	a := New("hunter2")
	seen := map[string]bool{}
	for i := 0; i < 64; i++ {
		_, tok, _ := login(t, a, "hunter2")
		if len(tok) != 48 { // 24 random bytes, hex-encoded
			t.Fatalf("expected a 48-char hex token, got %d chars", len(tok))
		}
		if seen[tok] {
			t.Fatal("session tokens must never repeat")
		}
		seen[tok] = true
	}
	// Every issued session stays valid — logging in again does not evict earlier
	// devices.
	for tok := range seen {
		if code := probe(t, a, bearer(tok)); code != http.StatusOK {
			t.Fatalf("previously issued session should still work, got %d", code)
		}
	}
}

// ── logout + expiry ──────────────────────────────────────────────────────────

func TestLogoutInvalidatesTheSession(t *testing.T) {
	a := New("hunter2")
	_, tok, _ := login(t, a, "hunter2")

	r := httptest.NewRequest("DELETE", "/api/auth/logout", nil)
	r.Header.Set("Authorization", "Bearer "+tok)
	w := httptest.NewRecorder()
	a.Logout(w, r)
	if w.Code != http.StatusNoContent {
		t.Fatalf("logout should answer 204, got %d", w.Code)
	}
	var cleared bool
	for _, c := range w.Result().Cookies() {
		if c.Name == "flowstock_session" && c.Value == "" && c.MaxAge < 0 {
			cleared = true
		}
	}
	if !cleared {
		t.Fatal("logout must clear the session cookie")
	}
	if code := probe(t, a, bearer(tok)); code != http.StatusUnauthorized {
		t.Fatalf("a logged-out token must be rejected, got %d", code)
	}
}

// Logging out one device must not sign the others out.
func TestLogoutOnlyEndsTheCallersSession(t *testing.T) {
	a := New("hunter2")
	_, first, _ := login(t, a, "hunter2")
	_, second, _ := login(t, a, "hunter2")

	r := httptest.NewRequest("DELETE", "/api/auth/logout", nil)
	r.Header.Set("Authorization", "Bearer "+first)
	a.Logout(httptest.NewRecorder(), r)

	if code := probe(t, a, bearer(first)); code != http.StatusUnauthorized {
		t.Fatalf("the logged-out session must be rejected, got %d", code)
	}
	if code := probe(t, a, bearer(second)); code != http.StatusOK {
		t.Fatalf("the other device's session must survive, got %d", code)
	}
}

func TestExpiredSessionIsRejectedAndForgotten(t *testing.T) {
	a := New("hunter2")
	_, tok, _ := login(t, a, "hunter2")

	// Backdate the session past its lifetime.
	a.mu.Lock()
	a.sessions[tok] = session{expires: time.Now().Add(-time.Second)}
	a.mu.Unlock()

	if code := probe(t, a, bearer(tok)); code != http.StatusUnauthorized {
		t.Fatalf("an expired session must be rejected, got %d", code)
	}
	a.mu.Lock()
	_, still := a.sessions[tok]
	a.mu.Unlock()
	if still {
		t.Fatal("an expired session should be dropped from the session table")
	}
}

// ── malformed input ──────────────────────────────────────────────────────────

func TestLoginWithMalformedBodyIsRejectedNotAccepted(t *testing.T) {
	bodies := map[string]string{
		"empty body":     "",
		"not json":       "hunter2",
		"truncated json": `{"password":`,
		"wrong type":     `{"password":123}`,
		"null password":  `{"password":null}`,
		"array":          `[]`,
	}
	for name, body := range bodies {
		t.Run(name, func(t *testing.T) {
			a := New("hunter2")
			r := httptest.NewRequest("POST", "/api/auth/login", strings.NewReader(body))
			w := httptest.NewRecorder()
			a.Login(w, r)
			if w.Code != http.StatusUnauthorized {
				t.Fatalf("a malformed login must fail closed with 401, got %d: %s", w.Code, w.Body.String())
			}
		})
	}
}

// A gated install must never be talked into open mode by a request; Enabled is
// decided by configuration alone.
func TestGateCannotBeDisabledByRequest(t *testing.T) {
	a := New("hunter2")
	r := httptest.NewRequest("POST", "/api/auth/login", strings.NewReader(`{"password":"","auth":false}`))
	a.Login(httptest.NewRecorder(), r)
	if !a.Enabled() {
		t.Fatal("a request must not be able to turn the password gate off")
	}
	if code := probe(t, a, nil); code != http.StatusUnauthorized {
		t.Fatalf("the gate must still be closed, got %d", code)
	}
}
