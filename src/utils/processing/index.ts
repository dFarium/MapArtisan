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
    getColorCache
} from './colorSpace';

// Dithering
export {
    type DitheringMode,
    type DitherMatrix,
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
    getValidColors,
    findClosestColorIndex,
    findTwoClosestColors
} from './colorMatching';
