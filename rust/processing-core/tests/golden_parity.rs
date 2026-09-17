use processing_core::*;
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    three_d_precision: u8,
    hybrid_strength: u8,
    cases: Vec<Case>,
}

#[derive(Deserialize)]
struct Case {
    id: String,
    config: CaseConfig,
    expected: Expected,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CaseConfig {
    grid_x: u32,
    grid_y: u32,
    build_mode: String,
    dithering: String,
    use_perceptual: bool,
    with_edits: bool,
    independent_maps: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Expected {
    source_rgba: String,
    processed_rgba: String,
    packed_results: String,
    tone_map: Option<String>,
    height_path: Option<String>,
    height_map: String,
    min_height: i32,
    max_height: i32,
}

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
            let mut r = (x * 17 + y * 31 + (x ^ y) * 3) as u8;
            let mut g = (x * 7 + y * 13 + ((x >> 4) * (y >> 4)) * 19) as u8;
            let mut b = (x * x + y * y + x * y) as u8;
            if x % 128 == 127 {
                (r, g, b) = (255, 0, 255);
            }
            if x % 128 == 0 {
                (r, g, b) = (0, 255, 255);
            }
            if y % 128 == 127 {
                (r, g, b) = (255, 255, 0);
            }
            if y % 128 == 0 {
                (r, g, b) = (0, 0, 255);
            }
            let offset = ((y * width + x) * 4) as usize;
            data[offset..offset + 4].copy_from_slice(&[r, g, b, 255]);
        }
    }
    data
}

fn coords(width: u32, height: u32) -> Vec<(u32, u32)> {
    let candidates = [
        (0, 0),
        (width - 1, 0),
        (0, height - 1),
        (width - 1, height - 1),
        (width / 2, height / 2),
        (63, 63),
        (64, 64),
        (127, 127),
        (128, 127),
        (127, 128),
        (128, 128),
        (191, 64),
        (64, 191),
        (191, 191),
    ];
    let mut result = Vec::new();
    for point in candidates {
        if point.0 < width && point.1 < height && !result.contains(&point) {
            result.push(point);
        }
    }
    result
}

fn edits(width: u32, height: u32, palette: &[PaletteItem]) -> Vec<ManualEdit> {
    coords(width, height)
        .into_iter()
        .enumerate()
        .map(|(i, (x, y))| {
            let item = &palette[(i * 7 + 3) % palette.len()];
            ManualEdit {
                index: y * width + x,
                block_id: item.block_id.clone(),
                brightness: item.brightness,
                rgb: item.rgb,
                needs_support: Some(i % 2 == 1),
            }
        })
        .collect()
}

fn mode(value: &str) -> DitheringMode {
    match value {
        "none" => DitheringMode::None,
        "floyd-steinberg" => DitheringMode::FloydSteinberg,
        "atkinson" => DitheringMode::Atkinson,
        "stucki" => DitheringMode::Stucki,
        "burkes" => DitheringMode::Burkes,
        "sierra-lite" => DitheringMode::SierraLite,
        "ordered" => DitheringMode::Ordered,
        "ordered-8x8" => DitheringMode::Ordered8x8,
        "adaptive" => DitheringMode::Adaptive,
        "hybrid" => DitheringMode::Hybrid,
        "hybrid-v2" => DitheringMode::HybridV2,
        other => panic!("unknown dithering {other}"),
    }
}

fn hash(bytes: impl IntoIterator<Item = u8>) -> String {
    let mut value = 0xcbf29ce484222325u64;
    for byte in bytes {
        value ^= byte as u64;
        value = value.wrapping_mul(0x100000001b3);
    }
    format!("{value:016x}")
}

fn hash_u32(values: &[u32]) -> String {
    hash(values.iter().flat_map(|v| v.to_le_bytes()))
}
fn hash_i32(values: &[i32]) -> String {
    hash(values.iter().flat_map(|v| v.to_le_bytes()))
}
fn hash_i8(values: &[i8]) -> String {
    hash(values.iter().map(|v| *v as u8))
}

#[test]
fn matches_all_typescript_golden_fixtures() {
    let manifest: Manifest = serde_json::from_str(include_str!(
        "../../../src/utils/__tests__/fixtures/processing-goldens.json"
    ))
    .unwrap();
    let mut failures = Vec::new();
    for case in manifest.cases {
        let width = case.config.grid_x * 128;
        let height = case.config.grid_y * 128;
        let three_d = case.config.build_mode == "3d_valley";
        let palette = palette(three_d);
        let source_rgba = source(width, height);
        if hash(source_rgba.iter().copied()) != case.expected.source_rgba {
            failures.push(format!("{}:source", case.id));
            continue;
        }
        let request = ProcessingRequest {
            protocol_version: 1,
            request_id: 1,
            source_version: 1,
            config: ProcessingConfig {
                width,
                height,
                build_mode: if three_d {
                    BuildMode::ThreeDValley
                } else {
                    BuildMode::TwoD
                },
                palette: palette.clone(),
                three_d_precision: manifest.three_d_precision,
                dithering: mode(&case.config.dithering),
                use_perceptual: case.config.use_perceptual,
                hybrid_strength: manifest.hybrid_strength,
                independent_maps: case.config.independent_maps,
                block_support: BlockSupport::All,
                support_block_id: "minecraft:cobblestone".into(),
                export_mode: ExportMode::Sections,
                export_format: ExportFormat::Litematic,
                palette_version: "golden-v1".into(),
            },
            source: Some(ImageBuffer {
                width,
                height,
                rgba: source_rgba,
            }),
            manual_edits: if case.config.with_edits {
                edits(width, height, &palette)
            } else {
                vec![]
            },
        };
        let result = process(request).unwrap();
        let actual = (
            hash(result.rgba),
            hash_u32(&result.packed_results),
            result.tone_map.as_deref().map(hash_i8),
            result.height_path.as_deref().map(hash_i32),
            hash_i32(&result.stats.height_map),
            result.stats.min_height,
            result.stats.max_height,
        );
        let expected = (
            &case.expected.processed_rgba,
            &case.expected.packed_results,
            &case.expected.tone_map,
            &case.expected.height_path,
            &case.expected.height_map,
            case.expected.min_height,
            case.expected.max_height,
        );
        if actual.0 != *expected.0
            || actual.1 != *expected.1
            || actual.2 != *expected.2
            || actual.3 != *expected.3
            || actual.4 != *expected.4
            || actual.5 != expected.5
            || actual.6 != expected.6
        {
            if failures.is_empty() {
                eprintln!(
                    "first mismatch {}\nactual: {:?}\nexpected: {:?}",
                    case.id, actual, expected
                );
            }
            failures.push(case.id);
        }
    }
    assert!(
        failures.is_empty(),
        "{} fixtures differ; first: {:?}",
        failures.len(),
        &failures[..failures.len().min(20)]
    );
}
