use processing_core::{
    process, BlockSupport, BuildMode, DitheringMode, ExportFormat, ExportMode, ImageBuffer,
    PaletteItem, ProcessingConfig, ProcessingRequest,
};
use std::time::{Duration, Instant};

fn palette() -> Vec<PaletteItem> {
    let bases = [
        [34, 42, 54],
        [72, 93, 67],
        [112, 104, 91],
        [146, 132, 116],
        [178, 165, 143],
        [205, 194, 174],
        [229, 224, 211],
    ];
    bases
        .into_iter()
        .enumerate()
        .flat_map(|(color_id, base)| {
            [-1_i8, 0, 1].map(move |brightness| {
                let factor = match brightness {
                    -1 => 0.72,
                    1 => 1.18,
                    _ => 1.0,
                };
                PaletteItem {
                    color_id: color_id as u16,
                    block_id: format!("benchmark:{color_id}:{brightness}"),
                    rgb: base.map(|channel| (channel as f64 * factor).clamp(0.0, 255.0) as u8),
                    brightness,
                    needs_support: false,
                }
            })
        })
        .collect()
}

fn request(width: u32, height: u32, mode: DitheringMode) -> ProcessingRequest {
    let mut rgba = Vec::with_capacity(width as usize * height as usize * 4);
    for index in 0..width as usize * height as usize {
        rgba.extend_from_slice(&[
            (index.wrapping_mul(17) & 0xff) as u8,
            (index.wrapping_mul(31).wrapping_add(47) & 0xff) as u8,
            (index.wrapping_mul(13).wrapping_add(101) & 0xff) as u8,
            255,
        ]);
    }
    ProcessingRequest {
        protocol_version: 1,
        request_id: 1,
        source_version: 1,
        config: ProcessingConfig {
            width,
            height,
            build_mode: BuildMode::ThreeDValley,
            palette: palette(),
            three_d_precision: 73,
            dithering: mode,
            use_perceptual: true,
            hybrid_strength: 61,
            independent_maps: false,
            block_support: BlockSupport::All,
            support_block_id: "minecraft:cobblestone".into(),
            export_mode: ExportMode::Sections,
            export_format: ExportFormat::Litematic,
            palette_version: "benchmark".into(),
        },
        source: Some(ImageBuffer {
            width,
            height,
            rgba,
        }),
        manual_edits: vec![],
    }
}

fn measure(request: &ProcessingRequest, iterations: usize) -> (f64, f64) {
    for _ in 0..3 {
        let _ = process(request.clone()).unwrap();
    }
    let mut samples = Vec::with_capacity(iterations);
    for _ in 0..iterations {
        let start = Instant::now();
        let _ = process(request.clone()).unwrap();
        samples.push(start.elapsed());
    }
    samples.sort_unstable();
    let total = samples.iter().copied().sum::<Duration>();
    let mean = total.as_secs_f64() * 1_000.0 / iterations as f64;
    let median = samples[samples.len() / 2].as_secs_f64() * 1_000.0;
    (mean, median)
}

fn main() {
    println!("scenario,mean_ms,median_ms");
    for (width, height, iterations) in [(512, 512, 15), (1024, 512, 10)] {
        let request = request(width, height, DitheringMode::HybridV2);
        let (mean, median) = measure(&request, iterations);
        println!("{width}x{height}-hybrid-v2-oklab,{mean:.3},{median:.3}");
    }
}
