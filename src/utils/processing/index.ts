/**
 * Processing Module - Barrel Exports
 */

// Color Space
export {
    type LAB,
    rgbToLab,
    deltaE,
    labDistanceSq,
    colorDistanceSq,
    rgbToBinary,
    clearColorCache,
    getColorCache,
    clearLabCache,
    getLabCacheSize,
    LAB_CACHE_MAX_ENTRIES,
    packPixel,
    unpackCandidateIdx,
    unpackTone,
    unpackNeedsSupport
} from './colorSpace';

// Dithering
export {
    type DitheringMode,
    type DitherMatrix,
    type FlatDitherKernel,
    buildFlatDitherKernel,
    DITHER_MATRICES,
    BAYER_4X4,
    BAYER_8X8,
    calculateLocalVariance
} from './dithering';

// Height Optimization
export { optimizeColumnHeights, type SmartDropWorkspace } from './heightOptimization';

// Color Matching
export {
    type ColorCandidate,
    type ColorMatchResult,
    type CandidatesSoA,
    buildCandidatesSoA,
    getValidColors,
    findClosestColorIndex,
    findTwoClosestColors
} from './colorMatching';

// Pipeline (Main Processing Functions)
export {
    type BuildMode,
    processMapart,
    applyManualEdits,
    suggestDitheringMode
} from './pipeline';
