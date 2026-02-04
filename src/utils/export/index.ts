/**
 * Export Module - Barrel Exports
 */

// Types
export {
    LITEMATICA_VERSION,
    type BlockWithCoords,
    type LitematicaMetadata
} from './types';

// Block Generation
export { imageDataToBlockStates } from './blockGeneration';

// NBT Builder
export { createLitematicaNBT } from './nbtBuilder';

// File Export
export { generateMapartExport, triggerDownload } from './fileExport';

// Materials
export { calculateMaterialCounts } from './materials';
