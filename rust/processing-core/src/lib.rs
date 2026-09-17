//! Pure processing core for the future Rust/WASM engine.
//!
//! This crate deliberately has no browser, React, Web Worker, or WASM
//! dependency. The WASM adapter will translate these structures at the edge.

pub mod color;
pub mod config;
pub mod dithering;
pub mod errors;
pub mod height;
pub mod oklab;
pub mod processing;

pub use color::{closest_rgb, quantize_rgba, rgb_distance_sq, PaletteColor, Rgb};
pub use config::{
    BlockSupport, BuildMode, DitheringMode, ExportFormat, ExportMode, PaletteItem, ProcessingConfig,
};
pub use errors::ProcessingError;
pub use oklab::{
    clear_oklab_cache, closest_oklab, closest_oklab_precomputed, distance_sq as oklab_distance_sq,
    rgb_to_oklab, rgb_to_oklab_cached, rgb_values_to_oklab, Oklab,
};
pub use processing::{
    apply_edits, process, ImageBuffer, ManualEdit, ProcessingRequest, ProcessingResponse,
};
