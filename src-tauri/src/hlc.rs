//! Hybrid logical clock. Timestamps are strings that sort lexically in causal
//! order: `{unix_ms:013}-{counter:04x}-{node_id}`. Node id breaks ties so two
//! nodes can never mint the same timestamp.

use std::time::{SystemTime, UNIX_EPOCH};

pub struct Hlc {
    node: String,
    last_ms: u64,
    counter: u32,
}

fn wall_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn parse(ts: &str) -> Option<(u64, u32, &str)> {
    let mut parts = ts.splitn(3, '-');
    let ms = parts.next()?.parse::<u64>().ok()?;
    let counter = u32::from_str_radix(parts.next()?, 16).ok()?;
    let node = parts.next()?;
    Some((ms, counter, node))
}

impl Hlc {
    pub fn new(node: String, last_seen: Option<&str>) -> Self {
        let mut hlc = Hlc { node, last_ms: 0, counter: 0 };
        if let Some(ts) = last_seen {
            hlc.observe(ts);
        }
        hlc
    }

    /// Mint a timestamp strictly greater than every timestamp minted or
    /// observed so far on this node.
    pub fn tick(&mut self) -> String {
        let now = wall_ms();
        if now > self.last_ms {
            self.last_ms = now;
            self.counter = 0;
        } else {
            self.counter += 1;
        }
        format!("{:013}-{:04x}-{}", self.last_ms, self.counter, self.node)
    }

    /// Fold a remote timestamp into the clock so future ticks sort after it.
    pub fn observe(&mut self, remote: &str) {
        if let Some((ms, counter, _)) = parse(remote) {
            if ms > self.last_ms || (ms == self.last_ms && counter >= self.counter) {
                self.last_ms = ms;
                self.counter = counter.saturating_add(1);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ticks_are_monotonic_and_unique() {
        let mut clock = Hlc::new("nodeA".into(), None);
        let mut prev = clock.tick();
        for _ in 0..1000 {
            let next = clock.tick();
            assert!(next > prev, "{next} should sort after {prev}");
            prev = next;
        }
    }

    #[test]
    fn observe_pushes_clock_forward() {
        let mut clock = Hlc::new("nodeA".into(), None);
        let far_future = format!("{:013}-{:04x}-nodeB", wall_ms() + 60_000, 7);
        clock.observe(&far_future);
        let minted = clock.tick();
        assert!(minted > far_future);
        // Node id must still be ours.
        assert!(minted.ends_with("-nodeA"));
    }

    #[test]
    fn parse_roundtrip() {
        let (ms, c, node) = parse("0001750000000-00ff-01J0ABC").unwrap();
        assert_eq!(ms, 1_750_000_000);
        assert_eq!(c, 255);
        assert_eq!(node, "01J0ABC");
    }
}
