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

// Canonical block states
export { canonicalBlockState, formatBlockState, type CanonicalBlockState } from './blockState';

// NBT Builder
export { createLitematicaNBT, createVanillaNBT } from './nbtBuilder';

// File Export
export {
    generateMapartExport,
    generateConstructionSections,
    splitBlocksIntoSections,
    triggerDownload,
    type ConstructionSections,
    type ExportSection
} from './fileExport';

// Construction snapshot (live preview)
export {
    buildConstructionSnapshot,
    resolveSnapshotSection,
    fnv1a64,
    ConstructionSnapshotError,
    type ConstructionSnapshot,
    type ConstructionSnapshotErrorCode,
    type SnapshotSection
} from './snapshot';

// Materials
export { calculateMaterialCounts } from './materials';
