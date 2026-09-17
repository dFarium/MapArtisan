pub fn optimize_column(
    tone_map: &[i8],
    start: usize,
    stride: usize,
    count: usize,
) -> (i32, i32, Vec<i32>) {
    let mut reference = vec![0i32; count + 1];
    for i in 0..count {
        reference[i + 1] = reference[i] + tone_map[start + i * stride] as i32;
    }
    let mut future_min = vec![0i32; count + 1];
    let mut current_min = i32::MAX;
    for i in (0..=count).rev() {
        current_min = current_min.min(reference[i]);
        future_min[i] = current_min;
    }
    let mut path = vec![0i32; count];
    let mut current = 0;
    let mut min = 0;
    let mut max = 0;
    for i in 0..count {
        match tone_map[start + i * stride] {
            -1 => {
                let safe = reference[i + 1] - future_min[i + 1];
                if safe < current {
                    current = safe;
                } else {
                    current -= 1;
                }
            }
            1 => current += 1,
            _ => {}
        }
        path[i] = current;
        min = min.min(current);
        max = max.max(current);
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
    #[test]
    fn smart_drop_matches_reference_shape() {
        let (min, max, path) = optimize_column(&[1, 0, -1, -1, 1], 0, 1, 5);
        assert_eq!((min, max), (-1, 1));
        assert_eq!(path, vec![1, 1, 0, -1, 0]);
    }
}
