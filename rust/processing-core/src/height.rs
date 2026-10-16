/// Builds the lowest possible staircase for one map column.
///
/// Minecraft only compares the sign of the height difference with the block
/// to the north, so a step may climb or drop any number of blocks. A run of
/// highlights without a shadow (or shadows without a highlight) forces one
/// block per tone, which makes the longest such run the minimum range. This
/// reaches it: steps inside a run move one block, and the last step before a
/// run in the other direction jumps far enough for that run to fit.
///
/// Heights are relative to the north reference block at 0, and `min`/`max`
/// include it. Mirrors `optimizeColumnHeights` in TypeScript.
pub fn optimize_column(
    tone_map: &[i8],
    start: usize,
    stride: usize,
    count: usize,
) -> (i32, i32, Vec<i32>) {
    let tone = |i: usize| tone_map[start + i * stride];

    let mut up_ahead = vec![0i32; count + 1];
    let mut down_ahead = vec![0i32; count + 1];
    let mut range = 0;
    for i in (0..count).rev() {
        match tone(i) {
            1 => {
                up_ahead[i] = up_ahead[i + 1] + 1;
                down_ahead[i] = 0;
            }
            -1 => {
                up_ahead[i] = 0;
                down_ahead[i] = down_ahead[i + 1] + 1;
            }
            _ => {
                up_ahead[i] = up_ahead[i + 1];
                down_ahead[i] = down_ahead[i + 1];
            }
        }
        range = range.max(up_ahead[i]).max(down_ahead[i]);
    }

    let reference = down_ahead[0];
    let mut current = reference;
    let mut path = vec![0i32; count];
    let mut min = 0;
    let mut max = 0;
    for i in 0..count {
        match tone(i) {
            1 => current = (current + 1).max(down_ahead[i + 1]),
            -1 => current = (current - 1).min(range - up_ahead[i + 1]),
            _ => {}
        }
        let relative = current - reference;
        path[i] = relative;
        min = min.min(relative);
        max = max.max(relative);
    }
    (min, max, path)
}

pub fn build_height_layout(
    tone_map: &[i8],
    width: usize,
    height: usize,
    independent: bool,
) -> (i32, i32, Vec<i32>, Vec<i32>) {
    let mut global_min = 0;
    let mut global_max = 0;
    let mut height_map = vec![0; width];
    let mut height_path = vec![0; width * height];
    for x in 0..width {
        let chunks = if independent { height.div_ceil(128) } else { 1 };
        for chunk in 0..chunks {
            let start_y = if independent { chunk * 128 } else { 0 };
            let end_y = if independent {
                ((chunk + 1) * 128).min(height)
            } else {
                height
            };
            let count = end_y - start_y;
            let (min, max, path) = optimize_column(tone_map, start_y * width + x, width, count);
            global_min = global_min.min(min);
            global_max = global_max.max(max);
            height_map[x] = height_map[x].max(max - min);
            let shift = -min;
            for (i, value) in path.into_iter().enumerate() {
                height_path[x * height + start_y + i] = value + shift;
            }
        }
    }
    (global_min, global_max, height_map, height_path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn longest_run(tones: &[i8]) -> i32 {
        let (mut best, mut ups, mut downs) = (0, 0, 0);
        for &t in tones {
            match t {
                1 => {
                    ups += 1;
                    downs = 0;
                }
                -1 => {
                    downs += 1;
                    ups = 0;
                }
                _ => {}
            }
            best = best.max(ups).max(downs);
        }
        best
    }

    fn assert_tones_honoured(tones: &[i8], path: &[i32]) {
        let mut north = 0;
        for (i, (&t, &h)) in tones.iter().zip(path).enumerate() {
            assert_eq!((h - north).signum(), t as i32, "tones {tones:?} at {i}");
            north = h;
        }
    }

    #[test]
    fn matches_reference_shape() {
        let (min, max, path) = optimize_column(&[1, 0, -1, -1, 1], 0, 1, 5);
        assert_eq!((min, max), (0, 2));
        assert_eq!(path, vec![2, 2, 1, 0, 1]);
    }

    #[test]
    fn reaches_minimum_range_for_every_column_up_to_8_rows() {
        for length in 1..=8u32 {
            for code in 0..3usize.pow(length) {
                let mut rest = code;
                let tones: Vec<i8> = (0..length)
                    .map(|_| {
                        let t = (rest % 3) as i8 - 1;
                        rest /= 3;
                        t
                    })
                    .collect();
                let (min, max, path) = optimize_column(&tones, 0, 1, tones.len());
                assert_tones_honoured(&tones, &path);
                assert_eq!(max - min, longest_run(&tones), "tones {tones:?}");
            }
        }
    }
}
