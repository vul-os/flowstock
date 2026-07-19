package api

import (
	"errors"
	"strings"

	syncpkg "flowstock/backend/internal/sync"
)

var (
	errSecret  = errors.New("a sync secret is required before advertising this branch")
	errPeerURL = errors.New("peer URL must start with http:// or https://")
)

// syncResult aliases the sync package result for JSON responses.
type syncResult = syncpkg.Result

func boolStr(b bool) string {
	if b {
		return "1"
	}
	return "0"
}

func validPeerURL(u string) bool {
	u = strings.TrimSpace(u)
	return strings.HasPrefix(u, "http://") || strings.HasPrefix(u, "https://")
}
