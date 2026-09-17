#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rgb {
    pub r: u8,
    pub g: u8,
    pub b: u8,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PaletteColor {
    pub id: u16,
    pub rgb: Rgb,
}

pub fn rgb_distance_sq(a: Rgb, b: Rgb) -> u32 {
    let dr = i32::from(a.r) - i32::from(b.r);
    let dg = i32::from(a.g) - i32::from(b.g);
    let db = i32::from(a.b) - i32::from(b.b);
    (dr * dr + dg * dg + db * db) as u32
}

pub fn closest_rgb(query: Rgb, candidates: &[Rgb]) -> Option<usize> {
    candidates
        .iter()
        .enumerate()
        .min_by_key(|(_, candidate)| rgb_distance_sq(query, **candidate))
        .map(|(index, _)| index)
}

/// Quantizes an RGBA8 buffer to the nearest palette entry per pixel.
/// Alpha is intentionally ignored at this protocol boundary.
pub fn quantize_rgba(rgba: &[u8], palette: &[PaletteColor]) -> Option<Vec<u16>> {
    if rgba.len() % 4 != 0 || palette.is_empty() {
        return None;
    }

    let candidates: Vec<Rgb> = palette.iter().map(|entry| entry.rgb).collect();
    rgba.chunks_exact(4)
        .map(|pixel| {
            let index = closest_rgb(
                Rgb {
                    r: pixel[0],
                    g: pixel[1],
                    b: pixel[2],
                },
                &candidates,
            )?;
            Some(palette[index].id)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chooses_the_nearest_rgb_candidate() {
        let candidates = [
            Rgb { r: 0, g: 0, b: 0 },
            Rgb {
                r: 255,
                g: 255,
                b: 255,
            },
            Rgb {
                r: 200,
                g: 20,
                b: 20,
            },
        ];
        assert_eq!(
            closest_rgb(
                Rgb {
                    r: 190,
                    g: 30,
                    b: 25
                },
                &candidates
            ),
            Some(2)
        );
        assert_eq!(
            closest_rgb(
                Rgb {
                    r: 10,
                    g: 10,
                    b: 10
                },
                &candidates
            ),
            Some(0)
        );
        assert_eq!(
            closest_rgb(
                Rgb {
                    r: 10,
                    g: 10,
                    b: 10
                },
                &[]
            ),
            None
        );
    }

    #[test]
    fn quantizes_rgba_pixels_to_palette_ids_and_ignores_alpha() {
        let palette = [
            PaletteColor {
                id: 10,
                rgb: Rgb { r: 0, g: 0, b: 0 },
            },
            PaletteColor {
                id: 20,
                rgb: Rgb {
                    r: 255,
                    g: 255,
                    b: 255,
                },
            },
        ];
        assert_eq!(
            quantize_rgba(&[2, 3, 4, 0, 250, 249, 248, 17], &palette),
            Some(vec![10, 20])
        );
        assert_eq!(quantize_rgba(&[0, 0, 0], &palette), None);
    }
}
