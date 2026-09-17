use crate::color::Rgb;
use std::{cell::RefCell, collections::HashMap, sync::OnceLock};

const CACHE_LIMIT: usize = 65_536;

thread_local! {
    static OKLAB_CACHE: RefCell<HashMap<u32, Oklab>> = RefCell::new(HashMap::with_capacity(4096));
}

static GAMMA_LUT: OnceLock<[f64; 256]> = OnceLock::new();

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Oklab {
    pub l: f64,
    pub a: f64,
    pub b: f64,
}

fn linearize_value(channel: f64) -> f64 {
    let value = channel / 255.0;
    if value <= 0.04045 {
        value / 12.0
    } else {
        ((value + 0.055) / 1.055).powf(2.4)
    }
}

fn gamma_lut() -> &'static [f64; 256] {
    GAMMA_LUT.get_or_init(|| std::array::from_fn(|index| linearize_value(index as f64)))
}

pub fn rgb_to_oklab(rgb: Rgb) -> Oklab {
    let lut = gamma_lut();
    linear_rgb_to_oklab(
        lut[rgb.r as usize],
        lut[rgb.g as usize],
        lut[rgb.b as usize],
    )
}

pub fn rgb_values_to_oklab(red: f64, green: f64, blue: f64) -> Oklab {
    linear_rgb_to_oklab(
        linearize_value(red),
        linearize_value(green),
        linearize_value(blue),
    )
}

fn linear_rgb_to_oklab(r: f64, g: f64, b: f64) -> Oklab {
    let l = (0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b).cbrt();
    let m = (0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b).cbrt();
    let s = (0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b).cbrt();
    Oklab {
        l: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
        a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
        b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
    }
}

pub fn rgb_to_oklab_cached(rgb: Rgb) -> Oklab {
    let key = ((rgb.r as u32) << 16) | ((rgb.g as u32) << 8) | rgb.b as u32;
    OKLAB_CACHE.with(|cache| {
        let mut cache = cache.borrow_mut();
        if let Some(value) = cache.get(&key) {
            return *value;
        }
        if cache.len() >= CACHE_LIMIT {
            cache.clear();
        }
        let value = rgb_to_oklab(rgb);
        cache.insert(key, value);
        value
    })
}

pub fn clear_oklab_cache() {
    OKLAB_CACHE.with(|cache| cache.borrow_mut().clear());
}

#[inline]
pub fn distance_sq(a: Oklab, b: Oklab) -> f64 {
    (a.l - b.l).powi(2) + (a.a - b.a).powi(2) + (a.b - b.b).powi(2)
}

pub fn closest_oklab(query: Rgb, candidates: &[Rgb]) -> Option<usize> {
    let converted: Vec<Oklab> = candidates
        .iter()
        .map(|candidate| rgb_to_oklab(*candidate))
        .collect();
    closest_oklab_precomputed(query, &converted)
}

pub fn closest_oklab_precomputed(query: Rgb, candidates: &[Oklab]) -> Option<usize> {
    let target = rgb_to_oklab(query);
    candidates
        .iter()
        .enumerate()
        .min_by(|(_, a), (_, b)| distance_sq(target, **a).total_cmp(&distance_sq(target, **b)))
        .map(|(index, _)| index)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_reference_neutrals() {
        let black = rgb_to_oklab(Rgb { r: 0, g: 0, b: 0 });
        let white = rgb_to_oklab(Rgb {
            r: 255,
            g: 255,
            b: 255,
        });
        assert!(black.l.abs() < 1e-6 && black.a.abs() < 1e-6 && black.b.abs() < 1e-6);
        assert!((white.l - 1.0).abs() < 1e-5 && white.a.abs() < 1e-5 && white.b.abs() < 1e-5);
    }
}
