//! Height limit for 3D builds. Mirrors `src/utils/processing/heightLimit.ts`
//! exactly, so both engines force the same pixels.
//!
//! A column is as tall as its longest run of highlights with no shadow in
//! between (or shadows with no highlight), plus one block. When the preferred
//! tone would make a run too long, the quantizer picks the closest color with
//! the opposite tone instead, which restarts the run.

use crate::{HeightLimit, HeightLimitStyle};

/// Deterministic hash of two integers into [0, 1). Mirrored in TypeScript.
pub fn hash01(a: i32, b: i32) -> f64 {
    let mut h = a
        .wrapping_mul(374_761_393)
        .wrapping_add(b.wrapping_mul(668_265_263));
    h = (h ^ ((h as u32) >> 13) as i32).wrapping_mul(1_274_126_177);
    ((h ^ ((h as u32) >> 16) as i32) as u32) as f64 / 4_294_967_296.0
}

/// Run state of one column after a given row.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct RunState {
    direction: i8,
    run: i32,
    run_limit: i32,
}

#[derive(Debug, Clone, Copy)]
pub struct RunLimiter {
    /// Longest allowed run: the height limit minus one block.
    max_run: i32,
    style: HeightLimitStyle,
}

impl RunLimiter {
    /// Returns `None` when there is no limit.
    pub fn new(limit: HeightLimit) -> Option<Self> {
        (limit.blocks > 0).then(|| Self {
            max_run: (limit.blocks - 1).min(i32::MAX as u32) as i32,
            style: limit.style,
        })
    }

    /// State at the first row of an image or of an independent map.
    pub fn segment_start(&self, x: usize, y: usize) -> RunState {
        RunState {
            direction: 0,
            run: 0,
            run_limit: self.draw_run_limit(x, y),
        }
    }

    /// Returns `tone` when the column can take it, otherwise the tone that
    /// must replace it: the opposite tone, or normal when the limit is one block.
    pub fn allowed_tone(&self, state: &RunState, x: usize, y: usize, tone: i8) -> i8 {
        if tone == 0 || self.max_run == 0 {
            return 0;
        }
        if tone != state.direction {
            return tone;
        }
        if state.run + 1 > state.run_limit {
            return -tone;
        }
        if self.style == HeightLimitStyle::Balanced {
            let half = self.max_run as f64 / 2.0;
            if state.run as f64 >= half {
                let p = (state.run as f64 - half) / half;
                if hash01((x as i32).wrapping_mul(131).wrapping_add(7), y as i32) < p * p {
                    return -tone;
                }
            }
        }
        tone
    }

    pub fn commit(&self, state: &mut RunState, x: usize, y: usize, tone: i8) {
        if tone == 0 {
            return;
        }
        if tone == state.direction {
            state.run += 1;
        } else {
            state.direction = tone;
            state.run = 1;
            state.run_limit = self.draw_run_limit(x, y);
        }
    }

    fn draw_run_limit(&self, x: usize, y: usize) -> i32 {
        if self.style != HeightLimitStyle::Noise {
            return self.max_run;
        }
        let draw = hash01((x as i32).wrapping_mul(31).wrapping_add(11), y as i32);
        let shortened = (draw * (self.max_run as f64 / 2.0 + 1.0)).floor() as i32;
        (self.max_run - shortened).max(1)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_matches_typescript() {
        assert_eq!(hash01(0, 0), 0.0);
        assert_eq!(hash01(7, 3), 0.6220613436307758);
        assert_eq!(hash01(-5, 123456), 0.6503004196565598);
    }

    fn run_lengths(style: HeightLimitStyle, blocks: u32, rows: usize) -> Vec<i32> {
        let limiter = RunLimiter::new(HeightLimit { blocks, style }).unwrap();
        let mut state = limiter.segment_start(0, 0);
        let mut runs = Vec::new();
        let mut run = 0;
        for y in 0..rows {
            let tone = limiter.allowed_tone(&state, 0, y, 1);
            if tone == 1 {
                run += 1;
            } else {
                runs.push(run);
                run = 0;
            }
            limiter.commit(&mut state, 0, y, tone);
        }
        runs
    }

    #[test]
    fn lines_cut_every_run_at_the_limit() {
        let runs = run_lengths(HeightLimitStyle::Lines, 9, 200);
        assert!(runs.len() > 10);
        assert!(runs.iter().all(|run| *run == 8));
    }

    #[test]
    fn noise_and_balanced_stay_between_half_and_full_limit() {
        for style in [HeightLimitStyle::Noise, HeightLimitStyle::Balanced] {
            let runs = run_lengths(style, 17, 2000);
            assert!(runs.iter().all(|run| (8..=16).contains(run)), "{style:?}");
        }
    }

    #[test]
    fn one_block_forces_normal() {
        let limiter = RunLimiter::new(HeightLimit {
            blocks: 1,
            style: HeightLimitStyle::Noise,
        })
        .unwrap();
        let state = limiter.segment_start(0, 0);
        assert_eq!(limiter.allowed_tone(&state, 0, 0, 1), 0);
        assert_eq!(limiter.allowed_tone(&state, 0, 0, -1), 0);
        assert!(RunLimiter::new(HeightLimit {
            blocks: 0,
            style: HeightLimitStyle::Lines,
        })
        .is_none());
    }
}
