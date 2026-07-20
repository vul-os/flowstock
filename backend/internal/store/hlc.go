package store

import (
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Field-width bounds. Lexical order over the timestamp string equals numeric
// order over (wall, counter, node) ONLY while every field is fixed-width; these
// are what guarantee that, and TestHLCStringOrderMatchesTupleOrder is the
// executable statement of the equivalence.
const (
	// maxCounter is the largest value "%04x" renders in four characters. One
	// more and the field widens to five, at which point "1700000000000-10000-k"
	// sorts BEFORE "1700000000000-ffff-k" and causal order silently inverts.
	//
	// This is reachable from the network, not just from a 65k-ops-per-ms burst:
	// Observe folds a REMOTE counter forward as counter+1, so a peer sending
	// 0xffff drives this node to 0x10000. It parses fine and nothing errors —
	// the mesh just stops agreeing. Hence the spill below rather than a comment.
	maxCounter = 0xffff
	// maxWallMS is the largest value "%013d" renders in thirteen digits
	// (year 2286). Same failure mode as maxCounter, far away in time but
	// reachable now via a wildly-skewed or hostile remote timestamp.
	maxWallMS = 9999999999999
)

// HLC is a hybrid logical clock. Timestamps are strings that sort lexically in
// causal order: "{unix_ms:013}-{counter:04x}-{node_id}". The node id breaks
// ties so two nodes can never mint the same timestamp, which is what lets
// last-writer-wins converge deterministically across a leaderless mesh.
//
// Since node ids are public keys (see identity.go), this breaks ties on the same
// value the DMTAP substrate engine uses ("HLCs compare lexicographically by
// (wall, counter, author)", substrate/SYNC.md §3), so the two engines pick the
// same winner from the same history rather than merely both converging.
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
//
// A timestamp whose fields fall outside their fixed width is rejected rather
// than parsed. Accepting one would let a single remote op drag this node's clock
// past the width boundary through Observe, breaking lexical ordering for every
// timestamp minted afterwards — so this fails closed at the edge.
func ParseHLC(ts string) (ms int64, counter uint32, node string, ok bool) {
	parts := strings.SplitN(ts, "-", 3)
	if len(parts) != 3 {
		return 0, 0, "", false
	}
	m, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil || m < 0 || m > maxWallMS {
		return 0, 0, "", false
	}
	c, err := strconv.ParseUint(parts[1], 16, 32)
	if err != nil || c > maxCounter {
		return 0, 0, "", false
	}
	return m, uint32(c), parts[2], true
}

// formatHLC renders the wire form. The only place the layout is written down —
// the width bounds above are meaningless if a second call site disagrees.
func formatHLC(ms int64, counter uint32, node string) string {
	return fmt.Sprintf("%013d-%04x-%s", ms, counter, node)
}

// bump advances the logical counter by one, spilling into the wall field when
// the counter would outgrow the four hex digits "%04x" gives it. Spilling keeps
// the timestamp strictly greater than the previous one AND keeps every field
// fixed-width, which is the invariant lexical ordering depends on.
//
// At the very top of the wall range there is nowhere left to spill; the counter
// then saturates. Order stops being strict there (two ticks can tie) but it
// never inverts, which is the property that actually matters for convergence.
func (h *HLC) bump() {
	if h.counter < maxCounter {
		h.counter++
		return
	}
	if h.lastMS < maxWallMS {
		h.lastMS++
		h.counter = 0
	}
}

// Tick mints a timestamp strictly greater than every timestamp minted or
// observed so far on this node.
func (h *HLC) Tick() string {
	h.mu.Lock()
	defer h.mu.Unlock()
	now := h.nowFn()
	if now > h.lastMS && now <= maxWallMS {
		h.lastMS = now
		h.counter = 0
	} else {
		h.bump()
	}
	return formatHLC(h.lastMS, h.counter, h.node)
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
		h.counter = counter
		h.bump()
	}
}
