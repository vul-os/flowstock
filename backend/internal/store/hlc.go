package store

import (
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"
)

// HLC is a hybrid logical clock. Timestamps are strings that sort lexically in
// causal order: "{unix_ms:013}-{counter:04x}-{node_id}". The node id breaks
// ties so two nodes can never mint the same timestamp, which is what lets
// last-writer-wins converge deterministically across a leaderless mesh.
type HLC struct {
	mu      sync.Mutex
	node    string
	lastMS  int64
	counter uint32
	nowFn   func() int64 // injectable for tests
}

func wallMS() int64 { return time.Now().UnixMilli() }

// NewHLC builds a clock for node, seeded past lastSeen (an existing max
// timestamp, e.g. from the oplog) so a wall clock that moved backwards can
// never mint a stale timestamp.
func NewHLC(node, lastSeen string) *HLC {
	h := &HLC{node: node, nowFn: wallMS}
	if lastSeen != "" {
		h.Observe(lastSeen)
	}
	return h
}

// ParseHLC splits a timestamp into (unix_ms, counter, node_id).
func ParseHLC(ts string) (ms int64, counter uint32, node string, ok bool) {
	parts := strings.SplitN(ts, "-", 3)
	if len(parts) != 3 {
		return 0, 0, "", false
	}
	m, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return 0, 0, "", false
	}
	c, err := strconv.ParseUint(parts[1], 16, 32)
	if err != nil {
		return 0, 0, "", false
	}
	return m, uint32(c), parts[2], true
}

// Tick mints a timestamp strictly greater than every timestamp minted or
// observed so far on this node.
func (h *HLC) Tick() string {
	h.mu.Lock()
	defer h.mu.Unlock()
	now := h.nowFn()
	if now > h.lastMS {
		h.lastMS = now
		h.counter = 0
	} else {
		h.counter++
	}
	return fmt.Sprintf("%013d-%04x-%s", h.lastMS, h.counter, h.node)
}

// Observe folds a remote timestamp into the clock so future ticks sort after it.
func (h *HLC) Observe(remote string) {
	ms, counter, _, ok := ParseHLC(remote)
	if !ok {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	if ms > h.lastMS || (ms == h.lastMS && counter >= h.counter) {
		h.lastMS = ms
		h.counter = counter + 1
	}
}
