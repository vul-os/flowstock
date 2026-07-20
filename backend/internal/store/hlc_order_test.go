package store

import (
	"encoding/hex"
	"sort"
	"testing"
)

// The HLC's whole contract is that sorting the timestamp STRINGS reproduces
// causal order. That holds only while each field is fixed-width, and the width
// boundaries are reachable from the network (see maxCounter's comment), so these
// tests pin the boundary behaviour rather than the happy path.

func hlcAt(ms int64, counter uint32, node string) *HLC {
	return &HLC{node: node, lastMS: ms, counter: counter, nowFn: func() int64 { return ms }}
}

// A counter at its width limit must spill into the wall field, not widen the
// field. Widening inverts the order: "…-10000-k" sorts BEFORE "…-ffff-k".
func TestTickSpillsCounterInsteadOfWideningTheField(t *testing.T) {
	h := hlcAt(1700000000000, maxCounter, "aa")
	prev := "1700000000000-ffff-aa"
	got := h.Tick()

	if len(got) != len(prev) {
		t.Fatalf("field widened: %q (%d chars) vs %q (%d chars)", got, len(got), prev, len(prev))
	}
	if got <= prev {
		t.Fatalf("causal order inverted at the counter boundary: %q must sort after %q", got, prev)
	}
	if ms, c, _, ok := ParseHLC(got); !ok || ms != 1700000000001 || c != 0 {
		t.Fatalf("expected a spill to (ms+1, 0), got ms=%d counter=%d ok=%v", ms, c, ok)
	}
}

// The same boundary, reached the way an attacker would reach it: through a
// remote timestamp. Observe folds counter+1, so a peer sending 0xffff would
// previously drive this node to 0x10000.
func TestObserveCannotPushTheCounterPastItsWidth(t *testing.T) {
	h := hlcAt(1700000000000, 0, "aa")
	h.Observe("1700000000000-ffff-bb")

	got := h.Tick()
	if len(got) != len("1700000000000-ffff-aa") {
		t.Fatalf("a remote timestamp widened the local counter field: %q", got)
	}
	if got <= "1700000000000-ffff-bb" {
		t.Fatalf("a local tick must sort after the observed remote op: %q vs %q", got, "1700000000000-ffff-bb")
	}
}

// A timestamp outside the fixed width is refused at the edge. Accepting one
// would let a single remote op break ordering for everything minted afterwards.
func TestParseRejectsOutOfWidthTimestamps(t *testing.T) {
	for _, ts := range []string{
		"1700000000000-10000-aa", // counter one past its width
		"10000000000000-0001-aa", // wall one digit too wide
		"-0001-0001-aa",          // negative wall
	} {
		if _, _, _, ok := ParseHLC(ts); ok {
			t.Errorf("ParseHLC(%q) accepted an out-of-width timestamp", ts)
		}
	}
	if _, _, _, ok := ParseHLC("1700000000000-ffff-aa"); !ok {
		t.Error("ParseHLC rejected a timestamp exactly at the width limit")
	}
}

// An unparseable remote timestamp must not move the clock at all — the fail-
// closed half of the check above.
func TestObserveIgnoresOutOfWidthRemote(t *testing.T) {
	h := hlcAt(1700000000000, 5, "aa")
	h.Observe("9999999999999999-ffffffff-bb")
	if h.lastMS != 1700000000000 || h.counter != 5 {
		t.Fatalf("a malformed remote timestamp moved the clock to (%d, %d)", h.lastMS, h.counter)
	}
}

// THE cross-engine guard, and the reason this file exists.
//
// FlowStock orders by comparing timestamp strings; the DMTAP substrate engine
// orders by comparing the tuple (wall, counter, author) numerically/bytewise
// (substrate/SYNC.md §3). Both converge — but run against the same history they
// can pick different winners unless the two orders are IDENTICAL. Node ids are
// public keys now, so the tie-break value matches; this asserts the orders
// themselves match, over inputs that include both width boundaries.
func TestHLCStringOrderMatchesTupleOrder(t *testing.T) {
	type stamp struct {
		ms      int64
		counter uint32
		node    string // hex, as identity.go emits
	}
	keyA := hex.EncodeToString([]byte{0x0a, 0xff})
	keyB := hex.EncodeToString([]byte{0xa0, 0x01})
	keyC := hex.EncodeToString([]byte{0x00, 0x01})

	stamps := []stamp{
		{1700000000000, 0, keyA},
		{1700000000000, 0, keyB},
		{1700000000000, 0, keyC},
		{1700000000000, 1, keyA},
		{1700000000000, maxCounter, keyA},
		{1700000000001, 0, keyA},
		{999999999999, 0, keyA}, // 12-digit ms, zero-padded to 13
		{maxWallMS, maxCounter, keyC},
	}

	strs := make([]string, len(stamps))
	for i, s := range stamps {
		strs[i] = formatHLC(s.ms, s.counter, s.node)
	}

	byString := append([]string(nil), strs...)
	sort.Strings(byString)

	byTuple := append([]stamp(nil), stamps...)
	sort.Slice(byTuple, func(i, j int) bool {
		a, b := byTuple[i], byTuple[j]
		if a.ms != b.ms {
			return a.ms < b.ms
		}
		if a.counter != b.counter {
			return a.counter < b.counter
		}
		return a.node < b.node // hex is order-preserving vs raw key bytes
	})

	for i := range byTuple {
		want := formatHLC(byTuple[i].ms, byTuple[i].counter, byTuple[i].node)
		if byString[i] != want {
			t.Fatalf("string order diverges from tuple order at position %d:\n"+
				"  string sort: %s\n  tuple  sort: %s\n"+
				"the two engines would pick different winners from the same history",
				i, byString[i], want)
		}
	}
}

// Hex is order-preserving against the raw key bytes it encodes, which is what
// lets FlowStock's hex node id tie-break agree with the substrate's raw ik-pub
// comparison. Mixed-case hex would break it, so this pins lowercase too.
func TestHexKeyOrderMatchesRawByteOrder(t *testing.T) {
	raw := [][]byte{{0x00, 0x01}, {0x0a, 0xff}, {0xa0, 0x01}, {0xff, 0xff}}
	for i := 1; i < len(raw); i++ {
		lo, hi := hex.EncodeToString(raw[i-1]), hex.EncodeToString(raw[i])
		if !(lo < hi) {
			t.Fatalf("hex encoding is not order-preserving: %q !< %q", lo, hi)
		}
	}
}
