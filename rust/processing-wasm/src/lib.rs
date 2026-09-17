use processing_core::*;
use serde::Deserialize;
use wasm_bindgen::prelude::*;

#[cfg(feature = "parallel")]
pub use wasm_bindgen_rayon::init_thread_pool;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConfigDto {
    protocol_version: u32,
    request_id: u64,
    source_version: u64,
    width: u32,
    height: u32,
    build_mode: String,
    three_d_precision: u8,
    dithering: String,
    use_perceptual: bool,
    hybrid_strength: u8,
    independent_maps: bool,
    block_support: String,
    support_block_id: String,
    export_mode: String,
    export_format: String,
    palette_version: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PaletteDto {
    color_id: u16,
    block_id: String,
    rgb: [u8; 3],
    brightness: i8,
    needs_support: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EditDto {
    index: u32,
    block_id: String,
    brightness: i8,
    rgb: [u8; 3],
    needs_support: Option<bool>,
}

#[wasm_bindgen]
pub struct WasmProcessingResult {
    inner: ProcessingResponse,
}

#[wasm_bindgen]
impl WasmProcessingResult {
    #[wasm_bindgen(getter)] pub fn protocol_version(&self) -> u32 { self.inner.protocol_version }
    #[wasm_bindgen(getter)] pub fn request_id(&self) -> u64 { self.inner.request_id }
    #[wasm_bindgen(getter)] pub fn source_version(&self) -> u64 { self.inner.source_version }
    #[wasm_bindgen(getter)] pub fn width(&self) -> u32 { self.inner.width }
    #[wasm_bindgen(getter)] pub fn height(&self) -> u32 { self.inner.height }
    #[wasm_bindgen(getter)] pub fn min_height(&self) -> i32 { self.inner.stats.min_height }
    #[wasm_bindgen(getter)] pub fn max_height(&self) -> i32 { self.inner.stats.max_height }
    pub fn rgba(&self) -> js_sys::Uint8Array { js_sys::Uint8Array::from(self.inner.rgba.as_slice()) }
    pub fn packed_results(&self) -> js_sys::Uint32Array { js_sys::Uint32Array::from(self.inner.packed_results.as_slice()) }
    pub fn height_map(&self) -> js_sys::Int32Array { js_sys::Int32Array::from(self.inner.stats.height_map.as_slice()) }
    pub fn tone_map(&self) -> Option<js_sys::Int8Array> { self.inner.tone_map.as_deref().map(js_sys::Int8Array::from) }
    pub fn height_path(&self) -> Option<js_sys::Int32Array> { self.inner.height_path.as_deref().map(js_sys::Int32Array::from) }
}

#[wasm_bindgen]
pub fn process_v1(source: &[u8], config: JsValue, palette: JsValue, edits: JsValue) -> Result<WasmProcessingResult, JsValue> {
    let dto: ConfigDto = serde_wasm_bindgen::from_value(config).map_err(js_error)?;
    let palette: Vec<PaletteDto> = serde_wasm_bindgen::from_value(palette).map_err(js_error)?;
    let edits: Vec<EditDto> = serde_wasm_bindgen::from_value(edits).map_err(js_error)?;
    let request = ProcessingRequest {
        protocol_version: dto.protocol_version,
        request_id: dto.request_id,
        source_version: dto.source_version,
        config: ProcessingConfig {
            width: dto.width, height: dto.height,
            build_mode: match dto.build_mode.as_str() { "2d" => BuildMode::TwoD, "3d_valley" => BuildMode::ThreeDValley, _ => return Err(JsValue::from_str("invalid buildMode")) },
            palette: palette.into_iter().map(|item| PaletteItem { color_id: item.color_id, block_id: item.block_id, rgb: item.rgb, brightness: item.brightness, needs_support: item.needs_support }).collect(),
            three_d_precision: dto.three_d_precision,
            dithering: parse_dithering(&dto.dithering)?, use_perceptual: dto.use_perceptual,
            hybrid_strength: dto.hybrid_strength, independent_maps: dto.independent_maps,
            block_support: match dto.block_support.as_str() { "all" => BlockSupport::All, "needed" => BlockSupport::Needed, "gravity" => BlockSupport::Gravity, _ => return Err(JsValue::from_str("invalid blockSupport")) },
            support_block_id: dto.support_block_id,
            export_mode: match dto.export_mode.as_str() { "full" => ExportMode::Full, "sections" => ExportMode::Sections, _ => return Err(JsValue::from_str("invalid exportMode")) },
            export_format: match dto.export_format.as_str() { "litematic" => ExportFormat::Litematic, "nbt" => ExportFormat::Nbt, _ => return Err(JsValue::from_str("invalid exportFormat")) },
            palette_version: dto.palette_version,
        },
        source: Some(ImageBuffer { width: dto.width, height: dto.height, rgba: source.to_vec() }),
        manual_edits: edits.into_iter().map(|edit| ManualEdit { index: edit.index, block_id: edit.block_id, brightness: edit.brightness, rgb: edit.rgb, needs_support: edit.needs_support }).collect(),
    };
    process(request).map(|inner| WasmProcessingResult { inner }).map_err(|error| JsValue::from_str(&format!("{error:?}")))
}

fn parse_dithering(value: &str) -> Result<DitheringMode, JsValue> {
    Ok(match value {
        "none" => DitheringMode::None, "floyd-steinberg" => DitheringMode::FloydSteinberg,
        "atkinson" => DitheringMode::Atkinson, "stucki" => DitheringMode::Stucki,
        "burkes" => DitheringMode::Burkes, "sierra-lite" => DitheringMode::SierraLite,
        "ordered" => DitheringMode::Ordered, "ordered-8x8" => DitheringMode::Ordered8x8,
        "adaptive" => DitheringMode::Adaptive, "hybrid" => DitheringMode::Hybrid,
        "hybrid-v2" => DitheringMode::HybridV2,
        _ => return Err(JsValue::from_str("invalid dithering")),
    })
}

fn js_error(error: serde_wasm_bindgen::Error) -> JsValue { JsValue::from_str(&error.to_string()) }
