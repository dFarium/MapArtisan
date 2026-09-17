use crate::{
    oklab_distance_sq, rgb_to_oklab, rgb_to_oklab_cached, Oklab, ProcessingConfig, ProcessingError,
    Rgb,
};
use std::cell::UnsafeCell;

#[cfg(feature = "parallel")]
use rayon::prelude::*;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ImageBuffer {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ManualEdit {
    pub index: u32,
    pub block_id: String,
    pub brightness: i8,
    pub rgb: [u8; 3],
    pub needs_support: Option<bool>,
}

#[derive(Debug, Clone)]
pub struct ProcessingRequest {
    pub protocol_version: u32,
    pub request_id: u64,
    pub source_version: u64,
    pub config: ProcessingConfig,
    pub source: Option<ImageBuffer>,
    pub manual_edits: Vec<ManualEdit>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProcessingStats {
    pub min_height: i32,
    pub max_height: i32,
    pub height_map: Vec<i32>,
}

#[derive(Debug, Clone)]
pub struct ProcessingResponse {
    pub protocol_version: u32,
    pub request_id: u64,
    pub source_version: u64,
    pub width: u32,
    pub height: u32,
    pub independent_maps: bool,
    pub rgba: Vec<u8>,
    pub packed_results: Vec<u32>,
    pub tone_map: Option<Vec<i8>>,
    pub height_path: Option<Vec<i32>>,
    pub stats: ProcessingStats,
}

pub fn process(request: ProcessingRequest) -> Result<ProcessingResponse, ProcessingError> {
    validate_request(&request)?;
    let source = request.source.ok_or(ProcessingError::SourceRequired)?;
    let pixel_count = (request.config.width * request.config.height) as usize;
    let mut tone_map = matches!(request.config.build_mode, crate::BuildMode::ThreeDValley)
        .then(|| vec![0; pixel_count]);
    let mut rgba = source.rgba;
    let mut working = Vec::with_capacity(pixel_count * 3);
    for pixel in rgba.chunks_exact(4) {
        working.extend_from_slice(&[pixel[0] as f32, pixel[1] as f32, pixel[2] as f32]);
    }
    let mut packed_results = vec![0; pixel_count];
    let mut min_height = 0;
    let mut max_height = 0;
    let mut height_map = vec![0; request.config.width as usize];
    let uses_gather_diffusion = matches!(
        request.config.dithering,
        crate::DitheringMode::FloydSteinberg
            | crate::DitheringMode::Adaptive
            | crate::DitheringMode::HybridV2
    );

    if !request.config.palette.is_empty() {
        let colors: Vec<Rgb> = request
            .config
            .palette
            .iter()
            .map(|item| Rgb {
                r: item.rgb[0],
                g: item.rgb[1],
                b: item.rgb[2],
            })
            .collect();
        let oklab_colors: Vec<Oklab> = colors.iter().map(|color| rgb_to_oklab(*color)).collect();
        let height_penalty = if matches!(request.config.build_mode, crate::BuildMode::ThreeDValley)
            && request.config.three_d_precision < 100
        {
            if request.config.three_d_precision == 0 {
                f64::INFINITY
            } else {
                let maximum = if request.config.use_perceptual {
                    0.25
                } else {
                    200_000.0
                };
                maximum * (1.0 - request.config.three_d_precision as f64 / 100.0)
            }
        } else {
            0.0
        };
        let mut candidate_order: Vec<usize> = (0..colors.len()).collect();
        candidate_order.sort_by(|a, b| oklab_colors[*a].l.total_cmp(&oklab_colors[*b].l));
        if uses_gather_diffusion {
            let hybrid_v2_activity =
                matches!(request.config.dithering, crate::DitheringMode::HybridV2).then(|| {
                    build_hybrid_v2_activity_map(
                        &working,
                        request.config.width as usize,
                        request.config.height as usize,
                        request.config.independent_maps,
                    )
                });
            process_floyd_wavefront(
                &working,
                hybrid_v2_activity.as_deref(),
                &mut rgba,
                &mut packed_results,
                &mut tone_map,
                &request.config,
                &colors,
                &oklab_colors,
                &candidate_order,
                height_penalty,
            )?;
        } else {
            for index in 0..pixel_count {
                let offset = index * 4;
                let working_offset = index * 3;
                let x = index % request.config.width as usize;
                let y = index / request.config.width as usize;
                let source_rgb = [
                    working[working_offset].clamp(0.0, 255.0),
                    working[working_offset + 1].clamp(0.0, 255.0),
                    working[working_offset + 2].clamp(0.0, 255.0),
                ];
                let target_oklab = request
                    .config
                    .use_perceptual
                    .then(|| rgb_to_oklab_cached(rounded_rgb(source_rgb)));
                let candidate = if matches!(
                    request.config.dithering,
                    crate::DitheringMode::Ordered | crate::DitheringMode::Ordered8x8
                ) {
                    let (first, first_distance, second, second_distance) = two_closest(
                        source_rgb,
                        &colors,
                        &oklab_colors,
                        &candidate_order,
                        &request.config.palette,
                        target_oklab,
                        height_penalty,
                    );
                    let (threshold, maximum) =
                        if matches!(request.config.dithering, crate::DitheringMode::Ordered8x8) {
                            (crate::dithering::BAYER_8X8[y % 8][x % 8] as f64, 65.0)
                        } else {
                            (crate::dithering::BAYER_4X4[y % 4][x % 4] as f64, 17.0)
                        };
                    if second_distance > 0.0
                        && first_distance * maximum / second_distance > threshold
                    {
                        second
                    } else {
                        first
                    }
                } else if request.config.use_perceptual {
                    closest_candidate(
                        source_rgb,
                        &colors,
                        &oklab_colors,
                        &candidate_order,
                        &request.config.palette,
                        target_oklab,
                        height_penalty,
                    )
                    .ok_or(ProcessingError::SourceRequired)?
                } else {
                    closest_candidate(
                        source_rgb,
                        &colors,
                        &oklab_colors,
                        &candidate_order,
                        &request.config.palette,
                        None,
                        height_penalty,
                    )
                    .ok_or(ProcessingError::SourceRequired)?
                };
                let item = &request.config.palette[candidate];
                rgba[offset..offset + 4].copy_from_slice(&[
                    item.rgb[0],
                    item.rgb[1],
                    item.rgb[2],
                    255,
                ]);
                let tone = if matches!(request.config.build_mode, crate::BuildMode::ThreeDValley) {
                    item.brightness.clamp(-1, 1)
                } else {
                    0
                };
                packed_results[index] = (candidate as u32 & 0x3ff)
                    | (((tone + 1) as u32 & 0x3) << 10)
                    | ((item.needs_support as u32) << 12);
                if let Some(map) = tone_map.as_mut() {
                    map[index] = tone;
                }
                if let Some(kernel) = crate::dithering::kernel(request.config.dithering) {
                    let error_scale = match request.config.dithering {
                        crate::DitheringMode::Adaptive => 0.85,
                        crate::DitheringMode::Hybrid => hybrid_error_scale(
                            &working,
                            x,
                            y,
                            request.config.width as usize,
                            request.config.height as usize,
                            source_rgb,
                            item.rgb,
                            request.config.hybrid_strength,
                        ),
                        _ => 1.0,
                    };
                    let err = [
                        (source_rgb[0] as f64 - item.rgb[0] as f64) * error_scale,
                        (source_rgb[1] as f64 - item.rgb[1] as f64) * error_scale,
                        (source_rgb[2] as f64 - item.rgb[2] as f64) * error_scale,
                    ];
                    let width = request.config.width as i32;
                    let height = request.config.height as i32;
                    let px = x as i32;
                    let py = y as i32;
                    for step in kernel {
                        let nx = px + step.dx;
                        let ny = py + step.dy;
                        if nx < 0 || nx >= width || ny < 0 || ny >= height {
                            continue;
                        }
                        if request.config.independent_maps && (py / 128 != ny / 128) {
                            continue;
                        }
                        let target = (ny * width + nx) as usize * 3;
                        for channel in 0..3 {
                            working[target + channel] = (working[target + channel] as f64
                                + err[channel] * step.weight as f64)
                                .clamp(0.0, 255.0)
                                as f32;
                        }
                    }
                }
                height_map[x] += tone as i32;
                min_height = min_height.min(height_map[x]);
                max_height = max_height.max(height_map[x]);
            }
        }
    }

    for edit in &request.manual_edits {
        let index = edit.index as usize;
        if index >= pixel_count {
            continue;
        }
        let candidate = request
            .config
            .palette
            .iter()
            .position(|item| item.block_id == edit.block_id && item.brightness == edit.brightness)
            .unwrap_or_else(|| (packed_results[index] & 0x3ff) as usize);
        let support = edit.needs_support.unwrap_or_else(|| {
            request
                .config
                .palette
                .get(candidate)
                .is_some_and(|item| item.needs_support)
        });
        let tone = if matches!(request.config.build_mode, crate::BuildMode::ThreeDValley) {
            edit.brightness.clamp(-1, 1)
        } else {
            0
        };
        let offset = index * 4;
        rgba[offset..offset + 4].copy_from_slice(&[edit.rgb[0], edit.rgb[1], edit.rgb[2], 255]);
        packed_results[index] = (candidate as u32 & 0x3ff)
            | (((tone + 1) as u32 & 0x3) << 10)
            | ((support as u32) << 12);
        if let Some(map) = tone_map.as_mut() {
            map[index] = tone;
        }
    }

    let height_path = if let Some(tones) = tone_map.as_ref() {
        let layout = crate::height::build_height_layout(
            tones,
            request.config.width as usize,
            request.config.height as usize,
            request.config.independent_maps,
        );
        min_height = layout.0;
        max_height = layout.1;
        height_map = layout.2;
        Some(layout.3)
    } else {
        None
    };

    Ok(ProcessingResponse {
        protocol_version: request.protocol_version,
        request_id: request.request_id,
        source_version: request.source_version,
        width: source.width,
        height: source.height,
        independent_maps: request.config.independent_maps,
        rgba,
        packed_results,
        tone_map,
        height_path,
        stats: ProcessingStats {
            min_height,
            max_height,
            height_map,
        },
    })
}

/// Reconstructs the working RGB value for Floyd-Steinberg from the errors of
/// its four predecessors. Contributions are applied in the same row-major
/// order as the legacy scatter loop and rounded back to f32 after every clamp;
/// that ordering is required for byte-for-byte parity.
const FLOYD_U_TILE: usize = 64;
const FLOYD_V_TILE: usize = 32;
#[cfg(feature = "parallel")]
const FLOYD_PARALLEL_THRESHOLD: usize = 512 * 512;

/// Interior-mutable storage used by a tiled wavefront. A tile owns every cell
/// it writes, while it only reads cells from waves that have already completed.
/// The barrier between Rayon `for_each` calls makes those reads visible.
struct WavefrontCells<T> {
    values: Box<[UnsafeCell<T>]>,
}

// SAFETY: WavefrontCells is only exposed through the scheduler below. Tiles in
// one wave are disjoint, and all dependencies belong to completed prior waves.
unsafe impl<T: Send> Sync for WavefrontCells<T> {}

impl<T> WavefrontCells<T> {
    fn new(values: Vec<T>) -> Self {
        Self {
            values: values
                .into_iter()
                .map(UnsafeCell::new)
                .collect::<Vec<_>>()
                .into_boxed_slice(),
        }
    }

    #[inline]
    fn write(&self, index: usize, value: T) {
        // SAFETY: each pixel belongs to exactly one tile and is written once.
        unsafe { *self.values[index].get() = value };
    }
}

impl<T: Copy> WavefrontCells<T> {
    #[inline]
    fn read(&self, index: usize) -> T {
        // SAFETY: callers only read their own cell or a completed predecessor.
        unsafe { *self.values[index].get() }
    }
}

struct FloydContext<'a> {
    original: &'a [f32],
    hybrid_v2_activity: Option<&'a [u16]>,
    errors: &'a WavefrontCells<[f64; 3]>,
    pixels: &'a WavefrontCells<[u8; 4]>,
    packed: &'a WavefrontCells<u32>,
    tones: &'a WavefrontCells<i8>,
    config: &'a ProcessingConfig,
    colors: &'a [Rgb],
    oklab_colors: &'a [Oklab],
    candidate_order: &'a [usize],
    height_penalty: f64,
}

#[allow(clippy::too_many_arguments)]
fn process_floyd_wavefront(
    original: &[f32],
    hybrid_v2_activity: Option<&[u16]>,
    rgba: &mut [u8],
    packed_results: &mut [u32],
    tone_map: &mut Option<Vec<i8>>,
    config: &ProcessingConfig,
    colors: &[Rgb],
    oklab_colors: &[Oklab],
    candidate_order: &[usize],
    height_penalty: f64,
) -> Result<(), ProcessingError> {
    let width = config.width as usize;
    let height = config.height as usize;
    let pixel_count = width * height;
    let errors = WavefrontCells::new(vec![[0.0_f64; 3]; pixel_count]);
    let pixels = WavefrontCells::new(
        rgba.chunks_exact(4)
            .map(|pixel| [pixel[0], pixel[1], pixel[2], pixel[3]])
            .collect(),
    );
    let packed = WavefrontCells::new(vec![0_u32; pixel_count]);
    let tones = WavefrontCells::new(vec![0_i8; pixel_count]);
    let context = FloydContext {
        original,
        hybrid_v2_activity,
        errors: &errors,
        pixels: &pixels,
        packed: &packed,
        tones: &tones,
        config,
        colors,
        oklab_colors,
        candidate_order,
        height_penalty,
    };

    // Transform (x, y) into (u=x+2y, v=y). Every Floyd predecessor has a
    // smaller u, so rectangular tiles in this space become skewed dependency-
    // safe tiles in image space. A tile only depends on its left and upper
    // neighbours and tiles sharing `tile_u + tile_v` can run concurrently.
    let u_len = width + 2 * (height - 1);
    let u_tiles = u_len.div_ceil(FLOYD_U_TILE);
    let v_tiles = height.div_ceil(FLOYD_V_TILE);
    let wave_count = u_tiles + v_tiles - 2;
    for wave_index in 0..=wave_count {
        let mut wave = Vec::with_capacity(u_tiles.min(v_tiles));
        for tile_v in 0..v_tiles {
            if tile_v > wave_index {
                break;
            }
            let tile_u = wave_index - tile_v;
            if tile_u < u_tiles {
                wave.push((tile_u, tile_v));
            }
        }

        #[cfg(feature = "parallel")]
        if pixel_count >= FLOYD_PARALLEL_THRESHOLD && wave.len() > 1 {
            wave.par_iter()
                .for_each(|&(tile_u, tile_v)| process_floyd_tile(&context, tile_u, tile_v));
            continue;
        }

        for (tile_u, tile_v) in wave {
            process_floyd_tile(&context, tile_u, tile_v);
        }
    }

    for index in 0..pixel_count {
        let pixel = pixels.read(index);
        rgba[index * 4..index * 4 + 4].copy_from_slice(&pixel);
        packed_results[index] = packed.read(index);
        if let Some(map) = tone_map.as_mut() {
            map[index] = tones.read(index);
        }
    }
    Ok(())
}

fn process_floyd_tile(context: &FloydContext<'_>, tile_u: usize, tile_v: usize) {
    let width = context.config.width as usize;
    let height = context.config.height as usize;
    let start_u = tile_u * FLOYD_U_TILE;
    let end_u = (start_u + FLOYD_U_TILE).min(width + 2 * (height - 1));
    let start_v = tile_v * FLOYD_V_TILE;
    let end_v = (start_v + FLOYD_V_TILE).min(height);

    for u in start_u..end_u {
        for y in start_v..end_v {
            let doubled_y = 2 * y;
            if u < doubled_y {
                continue;
            }
            let x = u - doubled_y;
            if x < width {
                process_floyd_pixel(context, x, y);
            }
        }
    }
}

fn process_floyd_pixel(context: &FloydContext<'_>, x: usize, y: usize) {
    let width = context.config.width as usize;
    let index = y * width + x;
    let source_rgb = gather_floyd_source(
        context.original,
        context.errors,
        index,
        x,
        y,
        width,
        context.config.independent_maps,
        matches!(context.config.dithering, crate::DitheringMode::HybridV2),
    );
    let target_oklab = context
        .config
        .use_perceptual
        .then(|| rgb_to_oklab_cached(rounded_rgb(source_rgb)));
    let candidate = closest_candidate(
        source_rgb,
        context.colors,
        context.oklab_colors,
        context.candidate_order,
        &context.config.palette,
        target_oklab,
        context.height_penalty,
    )
    .expect("Floyd wavefront requires a non-empty palette");
    let item = &context.config.palette[candidate];
    let error_scale = match context.config.dithering {
        crate::DitheringMode::Adaptive => 0.85,
        crate::DitheringMode::HybridV2 => hybrid_v2_error_scale(
            context
                .hybrid_v2_activity
                .expect("Hybrid V2 requires an immutable activity map")[index],
            source_rgb,
            item.rgb,
            context.config.hybrid_strength,
        ),
        _ => 1.0,
    };
    let tone = if matches!(context.config.build_mode, crate::BuildMode::ThreeDValley) {
        item.brightness.clamp(-1, 1)
    } else {
        0
    };
    context
        .pixels
        .write(index, [item.rgb[0], item.rgb[1], item.rgb[2], 255]);
    context.packed.write(
        index,
        (candidate as u32 & 0x3ff)
            | (((tone + 1) as u32 & 0x3) << 10)
            | ((item.needs_support as u32) << 12),
    );
    context.tones.write(index, tone);
    context.errors.write(
        index,
        [
            (source_rgb[0] as f64 - item.rgb[0] as f64) * error_scale,
            (source_rgb[1] as f64 - item.rgb[1] as f64) * error_scale,
            (source_rgb[2] as f64 - item.rgb[2] as f64) * error_scale,
        ],
    );
}

fn gather_floyd_source(
    original: &[f32],
    errors: &WavefrontCells<[f64; 3]>,
    index: usize,
    x: usize,
    y: usize,
    width: usize,
    independent_maps: bool,
    strict_map_boundaries: bool,
) -> [f32; 3] {
    let original_offset = index * 3;
    let mut value = [
        original[original_offset],
        original[original_offset + 1],
        original[original_offset + 2],
    ];

    let same_section = |other_x: usize, other_y: usize| {
        !independent_maps
            || (!strict_map_boundaries && y / 128 == other_y / 128)
            || (strict_map_boundaries && x / 128 == other_x / 128 && y / 128 == other_y / 128)
    };
    if y > 0 {
        if x > 0 && same_section(x - 1, y - 1) {
            add_diffusion_error(&mut value, errors.read(index - width - 1), 1.0 / 16.0);
        }
        if same_section(x, y - 1) {
            add_diffusion_error(&mut value, errors.read(index - width), 5.0 / 16.0);
        }
        if x + 1 < width && same_section(x + 1, y - 1) {
            add_diffusion_error(&mut value, errors.read(index - width + 1), 3.0 / 16.0);
        }
    }
    if x > 0 && same_section(x - 1, y) {
        add_diffusion_error(&mut value, errors.read(index - 1), 7.0 / 16.0);
    }
    value
}

#[inline]
fn add_diffusion_error(value: &mut [f32; 3], error: [f64; 3], weight: f32) {
    for channel in 0..3 {
        value[channel] =
            (value[channel] as f64 + error[channel] * weight as f64).clamp(0.0, 255.0) as f32;
    }
}

fn two_closest(
    query: [f32; 3],
    colors: &[Rgb],
    oklab_colors: &[Oklab],
    order: &[usize],
    palette: &[crate::PaletteItem],
    target_oklab: Option<Oklab>,
    height_penalty: f64,
) -> (usize, f64, usize, f64) {
    let mut best = (0usize, f64::INFINITY);
    let mut second = (0usize, f64::INFINITY);
    for &index in order {
        let mut distance = if let Some(target) = target_oklab {
            oklab_distance_sq(target, oklab_colors[index])
        } else {
            let candidate = colors[index];
            (query[0] as f64 - candidate.r as f64).powi(2)
                + (query[1] as f64 - candidate.g as f64).powi(2)
                + (query[2] as f64 - candidate.b as f64).powi(2)
        };
        if palette[index].brightness != 0 {
            distance += height_penalty;
        }
        if distance < best.1 {
            second = best;
            best = (index, distance);
        } else if distance < second.1 {
            second = (index, distance);
        }
    }
    (best.0, best.1, second.0, second.1)
}

fn closest_candidate(
    query: [f32; 3],
    colors: &[Rgb],
    oklab_colors: &[Oklab],
    order: &[usize],
    palette: &[crate::PaletteItem],
    target: Option<Oklab>,
    height_penalty: f64,
) -> Option<usize> {
    let mut best = None;
    let mut best_distance = f64::INFINITY;
    for &index in order {
        let mut distance = if let Some(target) = target {
            oklab_distance_sq(target, oklab_colors[index])
        } else {
            let candidate = colors[index];
            (query[0] as f64 - candidate.r as f64).powi(2)
                + (query[1] as f64 - candidate.g as f64).powi(2)
                + (query[2] as f64 - candidate.b as f64).powi(2)
        };
        if palette[index].brightness != 0 {
            distance += height_penalty;
        }
        if distance < best_distance {
            best = Some(index);
            best_distance = distance;
        }
    }
    best
}

fn rounded_rgb(query: [f32; 3]) -> Rgb {
    Rgb {
        r: (query[0] + 0.5) as u8,
        g: (query[1] + 0.5) as u8,
        b: (query[2] + 0.5) as u8,
    }
}

const HYBRID_V2_DETAIL_LOW: f64 = 500.0;
const HYBRID_V2_DETAIL_HIGH: f64 = 3_000.0;
const HYBRID_V2_ERROR_LOW: f64 = 1_000.0;
const HYBRID_V2_ERROR_HIGH: f64 = 5_000.0;
const HYBRID_V2_ERROR_ASSIST: f64 = 0.65;

#[inline]
fn smoothstep(low: f64, high: f64, value: f64) -> f64 {
    let t = ((value - low) / (high - low)).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

/// Builds an immutable, section-aware local-detail map. Each entry stores a
/// normalized 0..1 activity value as u16, keeping the wavefront context compact
/// and deterministic across the TypeScript and Rust implementations.
fn build_hybrid_v2_activity_map(
    original: &[f32],
    width: usize,
    height: usize,
    independent_maps: bool,
) -> Vec<u16> {
    let pixel_count = width * height;
    let mut activity = vec![0_u16; pixel_count];

    let calculate = |index: usize| {
        let x = index % width;
        let y = index / width;
        let center = index * 3;
        let mut sum = 0.0_f64;
        let mut count = 0_u32;

        for dy in -1_i32..=1 {
            for dx in -1_i32..=1 {
                if dx == 0 && dy == 0 {
                    continue;
                }
                let nx = x as i32 + dx;
                let ny = y as i32 + dy;
                if nx < 0 || ny < 0 || nx >= width as i32 || ny >= height as i32 {
                    continue;
                }
                let nx = nx as usize;
                let ny = ny as usize;
                if independent_maps && (x / 128 != nx / 128 || y / 128 != ny / 128) {
                    continue;
                }
                let neighbour = (ny * width + nx) * 3;
                for channel in 0..3 {
                    let delta =
                        original[neighbour + channel] as f64 - original[center + channel] as f64;
                    sum += delta * delta;
                }
                count += 1;
            }
        }

        let raw = if count == 0 { 0.0 } else { sum / count as f64 };
        (smoothstep(HYBRID_V2_DETAIL_LOW, HYBRID_V2_DETAIL_HIGH, raw) * u16::MAX as f64).round()
            as u16
    };

    #[cfg(feature = "parallel")]
    if pixel_count >= FLOYD_PARALLEL_THRESHOLD {
        activity
            .par_iter_mut()
            .enumerate()
            .for_each(|(index, value)| *value = calculate(index));
        return activity;
    }

    for (index, value) in activity.iter_mut().enumerate() {
        *value = calculate(index);
    }
    activity
}

#[inline]
fn hybrid_v2_error_scale(activity: u16, source: [f32; 3], selected: [u8; 3], strength: u8) -> f64 {
    let detail_need = activity as f64 / u16::MAX as f64;
    let quantization_error = (0..3)
        .map(|channel| {
            let delta = source[channel] as f64 - selected[channel] as f64;
            delta * delta
        })
        .sum::<f64>();
    let error_need = smoothstep(
        HYBRID_V2_ERROR_LOW,
        HYBRID_V2_ERROR_HIGH,
        quantization_error,
    );
    let need = detail_need + (1.0 - detail_need) * error_need * HYBRID_V2_ERROR_ASSIST;
    let minimum = (strength as f64 / 100.0).clamp(0.0, 1.0);
    (minimum + (1.0 - minimum) * need).clamp(0.0, 1.0)
}

fn hybrid_error_scale(
    working: &[f32],
    x: usize,
    y: usize,
    width: usize,
    height: usize,
    source: [f32; 3],
    selected: [u8; 3],
    strength: u8,
) -> f64 {
    let mut variance = 0.0f64;
    let mut count = 0usize;
    for dy in -1i32..=1 {
        for dx in -1i32..=1 {
            if dx == 0 && dy == 0 {
                continue;
            }
            let nx = x as i32 + dx;
            let ny = y as i32 + dy;
            if nx < 0 || ny < 0 || nx >= width as i32 || ny >= height as i32 {
                continue;
            }
            let offset = (ny as usize * width + nx as usize) * 3;
            for channel in 0..3 {
                let delta = working[offset + channel] as f64 - source[channel] as f64;
                variance += delta * delta;
            }
            count += 1;
        }
    }
    if count > 0 {
        variance /= count as f64;
    }
    let quant_error = (0..3)
        .map(|channel| {
            let delta = source[channel] as f64 - selected[channel] as f64;
            delta * delta
        })
        .sum::<f64>();
    let min_scale = strength as f64 / 100.0;
    let inverse = 100.0 - strength as f64;
    let low = 50.0 + inverse / 100.0 * 950.0;
    let high = 500.0 + inverse / 100.0 * 5500.0;
    if quant_error > 1000.0 {
        let boost = (quant_error / 5000.0).min(1.0) * min_scale;
        min_scale + (1.0 - min_scale) * boost
    } else if variance < low {
        min_scale
    } else if variance > high {
        1.0
    } else {
        min_scale + (variance - low) / (high - low) * (1.0 - min_scale)
    }
}

pub fn apply_edits(
    base: &ProcessingResponse,
    config: &ProcessingConfig,
    edits: &[ManualEdit],
) -> Result<ProcessingResponse, ProcessingError> {
    let mut response = base.clone();
    for edit in edits {
        let index = edit.index as usize;
        if index >= response.packed_results.len() || index * 4 + 3 >= response.rgba.len() {
            continue;
        }
        let offset = index * 4;
        response.rgba[offset..offset + 4].copy_from_slice(&[
            edit.rgb[0],
            edit.rgb[1],
            edit.rgb[2],
            255,
        ]);
        let candidate = config
            .palette
            .iter()
            .position(|item| item.block_id == edit.block_id && item.brightness == edit.brightness)
            .map(|value| value as u32)
            .unwrap_or(response.packed_results[index] & 0x3ff);
        let support = edit
            .needs_support
            .unwrap_or((response.packed_results[index] & (1 << 12)) != 0);
        let tone = if response.tone_map.is_some() {
            edit.brightness.clamp(-1, 1)
        } else {
            0
        };
        response.packed_results[index] =
            candidate | (((tone + 1) as u32 & 0x3) << 10) | ((support as u32) << 12);
        if let Some(map) = response.tone_map.as_mut() {
            map[index] = tone;
        }
    }
    if let Some(tones) = response.tone_map.as_ref() {
        let layout = crate::height::build_height_layout(
            tones,
            response.width as usize,
            response.height as usize,
            response.independent_maps,
        );
        response.stats.min_height = layout.0;
        response.stats.max_height = layout.1;
        response.stats.height_map = layout.2;
        response.height_path = Some(layout.3);
    }
    Ok(response)
}

fn validate_request(request: &ProcessingRequest) -> Result<(), ProcessingError> {
    if request.config.width == 0 || request.config.height == 0 {
        return Err(ProcessingError::InvalidDimensions);
    }
    let source = request
        .source
        .as_ref()
        .ok_or(ProcessingError::SourceRequired)?;
    if source.width != request.config.width || source.height != request.config.height {
        return Err(ProcessingError::InvalidDimensions);
    }
    let expected = (source.width * source.height * 4) as usize;
    if source.rgba.len() != expected {
        return Err(ProcessingError::SourceSizeMismatch {
            expected,
            actual: source.rgba.len(),
        });
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        BlockSupport, BuildMode, DitheringMode, ExportFormat, ExportMode, PaletteItem,
        ProcessingConfig,
    };

    fn config() -> ProcessingConfig {
        ProcessingConfig {
            width: 1,
            height: 1,
            build_mode: BuildMode::TwoD,
            palette: vec![],
            three_d_precision: 50,
            dithering: DitheringMode::None,
            use_perceptual: false,
            hybrid_strength: 50,
            independent_maps: false,
            block_support: BlockSupport::All,
            support_block_id: "minecraft:cobblestone".into(),
            export_mode: ExportMode::Sections,
            export_format: ExportFormat::Litematic,
            palette_version: "1.21.5".into(),
        }
    }

    #[test]
    fn validates_rgba_contract_and_preserves_request_identity() {
        let response = process(ProcessingRequest {
            protocol_version: 1,
            request_id: 7,
            source_version: 3,
            config: config(),
            source: Some(ImageBuffer {
                width: 1,
                height: 1,
                rgba: vec![1, 2, 3, 255],
            }),
            manual_edits: vec![],
        })
        .unwrap();
        assert_eq!(response.request_id, 7);
        assert_eq!(response.source_version, 3);
        assert_eq!(response.rgba, vec![1, 2, 3, 255]);
    }

    #[test]
    fn quantizes_source_and_packs_candidate_metadata() {
        let mut cfg = config();
        cfg.palette = vec![
            crate::PaletteItem {
                color_id: 1,
                block_id: "black".into(),
                rgb: [0, 0, 0],
                brightness: 0,
                needs_support: false,
            },
            crate::PaletteItem {
                color_id: 2,
                block_id: "white".into(),
                rgb: [255, 255, 255],
                brightness: 1,
                needs_support: true,
            },
        ];
        let response = process(ProcessingRequest {
            protocol_version: 1,
            request_id: 1,
            source_version: 1,
            config: cfg,
            source: Some(ImageBuffer {
                width: 1,
                height: 1,
                rgba: vec![250, 250, 250, 12],
            }),
            manual_edits: vec![],
        })
        .unwrap();
        assert_eq!(response.rgba, vec![255, 255, 255, 255]);
        assert_eq!(response.packed_results[0], 0x1401);
    }

    #[test]
    fn manual_edit_updates_color_packing_and_height_layout() {
        let mut cfg = config();
        cfg.build_mode = BuildMode::ThreeDValley;
        cfg.palette = vec![PaletteItem {
            color_id: 1,
            block_id: "high".into(),
            rgb: [240, 240, 240],
            brightness: 1,
            needs_support: true,
        }];
        let response = process(ProcessingRequest {
            protocol_version: 1,
            request_id: 1,
            source_version: 1,
            config: cfg,
            source: Some(ImageBuffer {
                width: 1,
                height: 1,
                rgba: vec![0, 0, 0, 255],
            }),
            manual_edits: vec![ManualEdit {
                index: 0,
                block_id: "high".into(),
                brightness: 1,
                rgb: [240, 240, 240],
                needs_support: Some(true),
            }],
        })
        .unwrap();
        assert_eq!(response.rgba, vec![240, 240, 240, 255]);
        assert_eq!(response.tone_map, Some(vec![1]));
        assert_eq!(response.height_path, Some(vec![1]));
        assert_eq!(response.packed_results[0], 0x1800);
    }

    #[test]
    fn hybrid_v2_activity_respects_independent_section_boundaries() {
        let width = 129;
        let mut source = vec![0.0_f32; width * 3];
        source[128 * 3] = 255.0;
        source[128 * 3 + 1] = 255.0;
        source[128 * 3 + 2] = 255.0;

        let continuous = build_hybrid_v2_activity_map(&source, width, 1, false);
        let independent = build_hybrid_v2_activity_map(&source, width, 1, true);
        assert!(continuous[127] > 0 && continuous[128] > 0);
        assert_eq!(independent[127], 0);
        assert_eq!(independent[128], 0);
    }

    #[test]
    fn hybrid_v2_weight_is_bounded_monotonic_and_continuous() {
        assert_eq!(hybrid_v2_error_scale(0, [100.0; 3], [100; 3], 0), 0.0);
        assert!(hybrid_v2_error_scale(0, [200.0; 3], [100; 3], 0) > 0.0);
        assert_eq!(
            hybrid_v2_error_scale(u16::MAX, [100.0; 3], [100; 3], 0),
            1.0
        );

        let mut previous = 0.0;
        for strength in [0, 25, 50, 75, 100] {
            let value =
                hybrid_v2_error_scale(20_000, [140.0, 120.0, 100.0], [100, 100, 100], strength);
            assert!((0.0..=1.0).contains(&value));
            assert!(value >= previous);
            previous = value;
        }
        assert_eq!(previous, 1.0);

        let below = hybrid_v2_error_scale(10_000, [118.25, 100.0, 100.0], [100; 3], 40);
        let above = hybrid_v2_error_scale(10_000, [118.26, 100.0, 100.0], [100; 3], 40);
        assert!((above - below).abs() < 0.001);
    }

    #[test]
    fn hybrid_v2_at_full_strength_matches_floyd() {
        let width = 24;
        let height = 16;
        let mut cfg = config();
        cfg.width = width;
        cfg.height = height;
        cfg.use_perceptual = true;
        cfg.palette = vec![
            PaletteItem {
                color_id: 1,
                block_id: "dark".into(),
                rgb: [24, 32, 48],
                brightness: 0,
                needs_support: false,
            },
            PaletteItem {
                color_id: 2,
                block_id: "mid".into(),
                rgb: [112, 136, 96],
                brightness: 0,
                needs_support: false,
            },
            PaletteItem {
                color_id: 3,
                block_id: "light".into(),
                rgb: [224, 216, 192],
                brightness: 0,
                needs_support: false,
            },
        ];
        let mut rgba = Vec::with_capacity(width as usize * height as usize * 4);
        for index in 0..width as usize * height as usize {
            rgba.extend_from_slice(&[
                (index * 17 & 0xff) as u8,
                (index * 31 + 47 & 0xff) as u8,
                (index * 13 + 101 & 0xff) as u8,
                255,
            ]);
        }
        let request = ProcessingRequest {
            protocol_version: 1,
            request_id: 1,
            source_version: 1,
            config: cfg.clone(),
            source: Some(ImageBuffer {
                width,
                height,
                rgba: rgba.clone(),
            }),
            manual_edits: vec![],
        };
        let mut floyd_request = request.clone();
        floyd_request.config.dithering = DitheringMode::FloydSteinberg;
        let mut hybrid_request = request;
        hybrid_request.config.dithering = DitheringMode::HybridV2;
        hybrid_request.config.hybrid_strength = 100;

        let floyd = process(floyd_request).unwrap();
        let hybrid = process(hybrid_request).unwrap();
        assert_eq!(hybrid.rgba, floyd.rgba);
        assert_eq!(hybrid.packed_results, floyd.packed_results);
    }

    #[cfg(feature = "parallel")]
    #[test]
    fn parallel_wavefront_modes_are_reproducible_at_dispatch_threshold() {
        let width = 512;
        let height = 512;
        let mut cfg = config();
        cfg.width = width;
        cfg.height = height;
        cfg.use_perceptual = true;
        cfg.palette = vec![
            PaletteItem {
                color_id: 1,
                block_id: "dark".into(),
                rgb: [24, 32, 48],
                brightness: 0,
                needs_support: false,
            },
            PaletteItem {
                color_id: 2,
                block_id: "mid".into(),
                rgb: [112, 136, 96],
                brightness: 0,
                needs_support: false,
            },
            PaletteItem {
                color_id: 3,
                block_id: "light".into(),
                rgb: [224, 216, 192],
                brightness: 0,
                needs_support: false,
            },
        ];
        let mut source = Vec::with_capacity(width as usize * height as usize * 4);
        for index in 0..width as usize * height as usize {
            source.extend_from_slice(&[
                (index.wrapping_mul(17) & 0xff) as u8,
                (index.wrapping_mul(31).wrapping_add(47) & 0xff) as u8,
                (index.wrapping_mul(13).wrapping_add(101) & 0xff) as u8,
                255,
            ]);
        }
        for mode in [DitheringMode::FloydSteinberg, DitheringMode::HybridV2] {
            cfg.dithering = mode;
            let request = ProcessingRequest {
                protocol_version: 1,
                request_id: 1,
                source_version: 1,
                config: cfg.clone(),
                source: Some(ImageBuffer {
                    width,
                    height,
                    rgba: source.clone(),
                }),
                manual_edits: vec![],
            };

            let first = process(request.clone()).unwrap();
            let second = process(request).unwrap();
            assert_eq!(first.rgba, second.rgba, "rgba differs for {mode:?}");
            assert_eq!(
                first.packed_results, second.packed_results,
                "packed results differ for {mode:?}"
            );
        }
    }
}
