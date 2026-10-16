/**
 * Export Module - Barrel Exports
 */

// Types
export {
    LITEMATICA_VERSION,
    type BlockWithCoords,
    type BlockStatesBuffers,
    type LitematicaMetadata
} from './types';

// Block Generation
export { imageDataToBlockStates } from './blockGeneration';

// NBT Builder
export { createLitematicaNBT, createVanillaNBT } from './nbtBuilder';

// File Export
export { generateMapartExport, splitBlocksIntoSections, triggerDownload, type ExportSection } from './fileExport';

// Materials
export { calculateMaterialCounts } from './materials';
