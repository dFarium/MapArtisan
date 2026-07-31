use crate::{ProcessingConfig, ProcessingError};

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
    let tone_map = matches!(request.config.build_mode, crate::BuildMode::ThreeDValley)
        .then(|| vec![0; pixel_count]);
    let height_path = matches!(request.config.build_mode, crate::BuildMode::ThreeDValley)
        .then(|| vec![0; pixel_count]);

    Ok(ProcessingResponse {
        protocol_version: request.protocol_version,
        request_id: request.request_id,
        source_version: request.source_version,
        width: source.width,
        height: source.height,
        rgba: source.rgba,
        packed_results: vec![0; pixel_count],
        tone_map,
        height_path,
        stats: ProcessingStats { min_height: 0, max_height: 0, height_map: vec![0; request.config.width as usize] },
    })
}

pub fn apply_edits(
    base: &ProcessingResponse,
    edits: &[ManualEdit],
) -> Result<ProcessingResponse, ProcessingError> {
    let mut response = base.clone();
    for edit in edits {
        let index = edit.index as usize;
        if index >= response.packed_results.len() || index * 4 + 3 >= response.rgba.len() {
            continue;
        }
        let offset = index * 4;
        response.rgba[offset..offset + 4].copy_from_slice(&[edit.rgb[0], edit.rgb[1], edit.rgb[2], 255]);
    }
    Ok(response)
}

fn validate_request(request: &ProcessingRequest) -> Result<(), ProcessingError> {
    if request.config.width == 0 || request.config.height == 0 {
        return Err(ProcessingError::InvalidDimensions);
    }
    let source = request.source.as_ref().ok_or(ProcessingError::SourceRequired)?;
    if source.width != request.config.width || source.height != request.config.height {
        return Err(ProcessingError::InvalidDimensions);
    }
    let expected = (source.width * source.height * 4) as usize;
    if source.rgba.len() != expected {
        return Err(ProcessingError::SourceSizeMismatch { expected, actual: source.rgba.len() });
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{BuildMode, DitheringMode, BlockSupport, ExportFormat, ExportMode, ProcessingConfig};

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
            source: Some(ImageBuffer { width: 1, height: 1, rgba: vec![1, 2, 3, 255] }),
            manual_edits: vec![],
        }).unwrap();
        assert_eq!(response.request_id, 7);
        assert_eq!(response.source_version, 3);
        assert_eq!(response.rgba, vec![1, 2, 3, 255]);
    }
}
