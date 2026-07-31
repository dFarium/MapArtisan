#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BuildMode {
    TwoD,
    ThreeDValley,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DitheringMode {
    None,
    FloydSteinberg,
    Ordered,
    Hybrid,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BlockSupport {
    All,
    Needed,
    Gravity,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExportMode {
    Full,
    Sections,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExportFormat {
    Litematic,
    Nbt,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PaletteItem {
    pub color_id: u16,
    pub block_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProcessingConfig {
    pub width: u32,
    pub height: u32,
    pub build_mode: BuildMode,
    pub palette: Vec<PaletteItem>,
    pub three_d_precision: u8,
    pub dithering: DitheringMode,
    pub use_perceptual: bool,
    pub hybrid_strength: u8,
    pub independent_maps: bool,
    pub block_support: BlockSupport,
    pub support_block_id: String,
    pub export_mode: ExportMode,
    pub export_format: ExportFormat,
    pub palette_version: String,
}
