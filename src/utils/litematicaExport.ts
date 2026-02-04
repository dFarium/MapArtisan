/**
 * Litematica Export - Main Entry Point
 * 
 * This module re-exports from sub-modules for backwards compatibility.
 * The actual implementation is now split across the export/ directory.
 */

// Re-export everything from the export module
export {
    // Types
    LITEMATICA_VERSION,
    type BlockWithCoords,
    type LitematicaMetadata,

    // Block Generation
    imageDataToBlockStates,

    // NBT Builder
    createLitematicaNBT,

    // File Export
    generateMapartExport,
    triggerDownload,

    // Materials
    calculateMaterialCounts
} from './export';
