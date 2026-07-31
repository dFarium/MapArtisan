//! Pure processing core for the future Rust/WASM engine.
//!
//! This crate deliberately has no browser, React, Web Worker, or WASM
//! dependency. The WASM adapter will translate these structures at the edge.

pub mod config;
pub mod errors;
pub mod processing;

pub use config::{BlockSupport, BuildMode, DitheringMode, ExportFormat, ExportMode, ProcessingConfig};
pub use errors::ProcessingError;
pub use processing::{apply_edits, process, ImageBuffer, ManualEdit, ProcessingRequest, ProcessingResponse};
