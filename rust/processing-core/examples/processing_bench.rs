use processing_core::*;
use std::{hint::black_box, time::Instant};

const COLORS: &[(u16, &str, [[u8; 3]; 3])] = &[
    (
        1,
        "minecraft:grass_block",
        [[89, 125, 39], [109, 153, 48], [127, 178, 56]],
    ),
    (
        4,
        "minecraft:stone",
        [[180, 0, 0], [220, 0, 0], [255, 0, 0]],
    ),
    (
        8,
        "minecraft:dirt",
        [[180, 180, 180], [220, 220, 220], [255, 255, 255]],
    ),
    (
        12,
        "minecraft:white_wool",
        [[45, 45, 180], [55, 55, 220], [64, 64, 255]],
    ),
    (
        17,
        "minecraft:oak_log",
        [[72, 108, 152], [88, 132, 186], [102, 153, 216]],
    ),
    (
        30,
        "minecraft:red_wool",
        [[176, 168, 54], [215, 205, 66], [250, 238, 77]],
    ),
    (
        49,
        "minecraft:obsidian",
        [[53, 57, 29], [65, 70, 36], [76, 82, 42]],
    ),
];

#[derive(Clone, Copy)]
struct Scenario {
    name: &'static str,
    width: u32,
    height: u32,
    build: BuildMode,
    dither: DitheringMode,
    perceptual: bool,
}

fn palette(three_d: bool) -> Vec<PaletteItem> {
    let levels: &[usize] = if three_d { &[0, 1, 2] } else { &[1] };
    COLORS
        .iter()
        .flat_map(|(id, block, colors)| {
            levels.iter().map(move |level| PaletteItem {
                color_id: *id,
                block_id: (*block).into(),
                rgb: colors[*level],
                brightness: *level as i8 - 1,
                needs_support: false,
            })
        })
        .collect()
}

fn source(width: u32, height: u32) -> Vec<u8> {
    let mut data = vec![0; (width * height * 4) as usize];
    for y in 0..height {
        for x in 0..width {
            let mut rgb = [
                (x * 17 + y * 31 + (x ^ y) * 3) as u8,
                (x * 7 + y * 13 + ((x >> 4) * (y >> 4)) * 19) as u8,
                (x * x + y * y + x * y) as u8,
            ];
            if x % 128 == 127 {
                rgb = [255, 0, 255];
            }
            if x % 128 == 0 {
                rgb = [0, 255, 255];
            }
            if y % 128 == 127 {
                rgb = [255, 255, 0];
            }
            if y % 128 == 0 {
                rgb = [0, 0, 255];
            }
            let i = ((y * width + x) * 4) as usize;
            data[i..i + 4].copy_from_slice(&[rgb[0], rgb[1], rgb[2], 255]);
        }
    }
    data
}

fn percentile(sorted: &[f64], ratio: f64) -> f64 {
    sorted[((sorted.len() - 1) as f64 * ratio).ceil() as usize]
}

fn run(s: Scenario) -> (f64, f64, f64, f64, f64) {
    let rgba = source(s.width, s.height);
    let config = ProcessingConfig {
        width: s.width,
        height: s.height,
        build_mode: s.build,
        palette: palette(matches!(s.build, BuildMode::ThreeDValley)),
        three_d_precision: 73,
        dithering: s.dither,
        use_perceptual: s.perceptual,
        hybrid_strength: 61,
        independent_maps: false,
        block_support: BlockSupport::All,
        support_block_id: "minecraft:cobblestone".into(),
        export_mode: ExportMode::Sections,
        export_format: ExportFormat::Litematic,
        palette_version: "benchmark".into(),
    };
    let iterations = if s.width * s.height >= 500_000 {
        16
    } else {
        30
    };
    let warmup = 5;
    let mut values = Vec::with_capacity(iterations);
    for iteration in 0..iterations + warmup {
        let request = ProcessingRequest {
            protocol_version: 1,
            request_id: iteration as u64,
            source_version: 1,
            config: config.clone(),
            source: Some(ImageBuffer {
                width: s.width,
                height: s.height,
                rgba: rgba.clone(),
            }),
            manual_edits: vec![],
        };
        let start = Instant::now();
        black_box(process(request).unwrap());
        if iteration >= warmup {
            values.push(start.elapsed().as_secs_f64() * 1000.0);
        }
    }
    values.sort_by(f64::total_cmp);
    let mean = values.iter().sum::<f64>() / values.len() as f64;
    (
        mean,
        percentile(&values, 0.5),
        percentile(&values, 0.95),
        values[0],
        values[values.len() - 1],
    )
}

fn main() {
    let scenarios = [
        Scenario {
            name: "128-2d-none-rgb",
            width: 128,
            height: 128,
            build: BuildMode::TwoD,
            dither: DitheringMode::None,
            perceptual: false,
        },
        Scenario {
            name: "512-2d-none-rgb",
            width: 512,
            height: 512,
            build: BuildMode::TwoD,
            dither: DitheringMode::None,
            perceptual: false,
        },
        Scenario {
            name: "512-2d-none-oklab",
            width: 512,
            height: 512,
            build: BuildMode::TwoD,
            dither: DitheringMode::None,
            perceptual: true,
        },
        Scenario {
            name: "512-2d-fs-rgb",
            width: 512,
            height: 512,
            build: BuildMode::TwoD,
            dither: DitheringMode::FloydSteinberg,
            perceptual: false,
        },
        Scenario {
            name: "512-2d-fs-oklab",
            width: 512,
            height: 512,
            build: BuildMode::TwoD,
            dither: DitheringMode::FloydSteinberg,
            perceptual: true,
        },
        Scenario {
            name: "512-3d-hybrid-oklab",
            width: 512,
            height: 512,
            build: BuildMode::ThreeDValley,
            dither: DitheringMode::Hybrid,
            perceptual: true,
        },
        Scenario {
            name: "1024x512-3d-hybrid-oklab",
            width: 1024,
            height: 512,
            build: BuildMode::ThreeDValley,
            dither: DitheringMode::Hybrid,
            perceptual: true,
        },
    ];
    println!("engine,scenario,mean_ms,median_ms,p95_ms,min_ms,max_ms");
    for scenario in scenarios {
        let (mean, median, p95, min, max) = run(scenario);
        println!(
            "rust,{},{mean:.3},{median:.3},{p95:.3},{min:.3},{max:.3}",
            scenario.name
        );
    }
}
