use crate::config::DitheringMode;

#[derive(Debug, Clone, Copy)]
pub struct Kernel {
    pub dx: i32,
    pub dy: i32,
    pub weight: f32,
}

pub fn kernel(mode: DitheringMode) -> Option<&'static [Kernel]> {
    match mode {
        DitheringMode::FloydSteinberg
        | DitheringMode::Adaptive
        | DitheringMode::Hybrid
        | DitheringMode::HybridV2 => Some(&[
            Kernel {
                dx: 1,
                dy: 0,
                weight: 7.0 / 16.0,
            },
            Kernel {
                dx: -1,
                dy: 1,
                weight: 3.0 / 16.0,
            },
            Kernel {
                dx: 0,
                dy: 1,
                weight: 5.0 / 16.0,
            },
            Kernel {
                dx: 1,
                dy: 1,
                weight: 1.0 / 16.0,
            },
        ]),
        DitheringMode::Atkinson => Some(&[
            Kernel {
                dx: 1,
                dy: 0,
                weight: 1.0 / 8.0,
            },
            Kernel {
                dx: 2,
                dy: 0,
                weight: 1.0 / 8.0,
            },
            Kernel {
                dx: -1,
                dy: 1,
                weight: 1.0 / 8.0,
            },
            Kernel {
                dx: 0,
                dy: 1,
                weight: 1.0 / 8.0,
            },
            Kernel {
                dx: 1,
                dy: 1,
                weight: 1.0 / 8.0,
            },
            Kernel {
                dx: 0,
                dy: 2,
                weight: 1.0 / 8.0,
            },
        ]),
        DitheringMode::Stucki => Some(&[
            Kernel {
                dx: 1,
                dy: 0,
                weight: 8.0 / 42.0,
            },
            Kernel {
                dx: 2,
                dy: 0,
                weight: 4.0 / 42.0,
            },
            Kernel {
                dx: -2,
                dy: 1,
                weight: 2.0 / 42.0,
            },
            Kernel {
                dx: -1,
                dy: 1,
                weight: 4.0 / 42.0,
            },
            Kernel {
                dx: 0,
                dy: 1,
                weight: 8.0 / 42.0,
            },
            Kernel {
                dx: 1,
                dy: 1,
                weight: 4.0 / 42.0,
            },
            Kernel {
                dx: 2,
                dy: 1,
                weight: 2.0 / 42.0,
            },
            Kernel {
                dx: -2,
                dy: 2,
                weight: 1.0 / 42.0,
            },
            Kernel {
                dx: -1,
                dy: 2,
                weight: 2.0 / 42.0,
            },
            Kernel {
                dx: 0,
                dy: 2,
                weight: 4.0 / 42.0,
            },
            Kernel {
                dx: 1,
                dy: 2,
                weight: 2.0 / 42.0,
            },
            Kernel {
                dx: 2,
                dy: 2,
                weight: 1.0 / 42.0,
            },
        ]),
        DitheringMode::Burkes => Some(&[
            Kernel {
                dx: 1,
                dy: 0,
                weight: 8.0 / 32.0,
            },
            Kernel {
                dx: 2,
                dy: 0,
                weight: 4.0 / 32.0,
            },
            Kernel {
                dx: -2,
                dy: 1,
                weight: 2.0 / 32.0,
            },
            Kernel {
                dx: -1,
                dy: 1,
                weight: 4.0 / 32.0,
            },
            Kernel {
                dx: 0,
                dy: 1,
                weight: 8.0 / 32.0,
            },
            Kernel {
                dx: 1,
                dy: 1,
                weight: 4.0 / 32.0,
            },
            Kernel {
                dx: 2,
                dy: 1,
                weight: 2.0 / 32.0,
            },
        ]),
        DitheringMode::SierraLite => Some(&[
            Kernel {
                dx: 1,
                dy: 0,
                weight: 2.0 / 4.0,
            },
            Kernel {
                dx: -1,
                dy: 1,
                weight: 1.0 / 4.0,
            },
            Kernel {
                dx: 0,
                dy: 1,
                weight: 1.0 / 4.0,
            },
        ]),
        DitheringMode::None | DitheringMode::Ordered | DitheringMode::Ordered8x8 => None,
    }
}

pub const BAYER_4X4: [[u8; 4]; 4] = [
    [1, 9, 3, 11],
    [13, 5, 15, 7],
    [4, 12, 2, 10],
    [16, 8, 14, 6],
];
pub const BAYER_8X8: [[u8; 8]; 8] = [
    [1, 49, 13, 61, 4, 52, 16, 64],
    [33, 17, 45, 29, 36, 20, 48, 32],
    [9, 57, 5, 53, 12, 60, 8, 56],
    [41, 25, 37, 21, 44, 28, 40, 24],
    [3, 51, 15, 63, 2, 50, 14, 62],
    [35, 19, 47, 31, 34, 18, 46, 30],
    [11, 59, 7, 55, 10, 58, 6, 54],
    [43, 27, 39, 23, 42, 26, 38, 22],
];
