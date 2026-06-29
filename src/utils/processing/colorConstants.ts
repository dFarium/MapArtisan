export const MAPART = {
    // 3D Mode Penalty
    MAX_HEIGHT_PENALTY: 255 * 255 * 3 + 1,

    // sRGB → Linear RGB gamma correction (shared by OKLab and legacy CIELab)
    RGB_TO_LINEAR_THRESHOLD: 0.04045,
    RGB_TO_LINEAR_DIVISOR: 12.0,
    RGB_TO_LINEAR_OFFSET: 0.055,
    RGB_TO_LINEAR_POWER: 2.4,

    // OKLab matrices (Björn Ottosson, 2020 — https://bottosson.github.io/posts/oklab/)
    // M1: linear sRGB → LMS cone space
    // Row order: [l_row, m_row, s_row]
    OKLAB_M1_L: [0.4122214708, 0.5363325363, 0.0514459929],
    OKLAB_M1_M: [0.2119034982, 0.6806995451, 0.1073969566],
    OKLAB_M1_S: [0.0883024619, 0.2817188376, 0.6299787005],

    // M2: LMS^(1/3) → OKLab (L, a, b)
    // Row order: [L_row, a_row, b_row]
    OKLAB_M2_L: [ 0.2104542553,  0.7936177850, -0.0040720468],
    OKLAB_M2_A: [ 1.9779984951, -2.4285922050,  0.4505937099],
    OKLAB_M2_B: [ 0.0259040371,  0.7827717662, -0.8086757660],
};
