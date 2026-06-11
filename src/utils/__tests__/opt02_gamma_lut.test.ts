/**
 * Regression tests for the OKLab color conversion in rgbToLab.
 * Tests that the implementation correctly converts RGB → OKLab using:
 *   - GAMMA_LUT for sRGB→linear (power 2.4)
 *   - M1 matrix: linear sRGB → LMS
 *   - Math.cbrt for LMS^(1/3)
 *   - M2 matrix: LMS^(1/3) → OKLab
 *
 * Strategy: implement the OKLab formula inline in this test file as a reference,
 * compute expected values for known inputs, then compare against rgbToLab.
 * All candidate colors are integer RGB → must be bit-identical.
 */

import { describe, it, expect } from 'vitest';
import { processMapart, rgbToLab } from '../mapartProcessing';
import type { RGB } from '../../types/mapart';

// ---------------------------------------------------------------------------
// Reference implementation: OKLab formula (inline, used only in tests)
// Reference: https://bottosson.github.io/posts/oklab/
// ---------------------------------------------------------------------------
function rgbToOklabReference(r: number, g: number, b: number): { L: number; a: number; b: number } {
    // sRGB → linear (same gamma formula as GAMMA_LUT)
    const toLinear = (v: number) => {
        v = v / 255.0;
        return v <= 0.04045 ? v / 12.0 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    const r1 = toLinear(r);
    const g1 = toLinear(g);
    const b1 = toLinear(b);

    // M1: linear sRGB → LMS
    const lms_l = 0.4122214708 * r1 + 0.5363325363 * g1 + 0.0514459929 * b1;
    const lms_m = 0.2119034982 * r1 + 0.6806995451 * g1 + 0.1073969566 * b1;
    const lms_s = 0.0883024619 * r1 + 0.2817188376 * g1 + 0.6299787005 * b1;

    // LMS^(1/3)
    const l_ = Math.cbrt(lms_l);
    const m_ = Math.cbrt(lms_m);
    const s_ = Math.cbrt(lms_s);

    // M2: LMS^(1/3) → OKLab
    return {
        L:  0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
        a:  1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
        b:  0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
    };
}

// ---------------------------------------------------------------------------
// TC1 — Known anchor colors must match reference formula within 1e-6
// ---------------------------------------------------------------------------
describe('OKLab — rgbToLab conversion (regression)', () => {

    it('TC1: known anchor colors match OKLab reference formula within 1e-6', () => {
        const anchors: Array<[number, number, number, string]> = [
            [255, 255, 255, 'white'],
            [  0,   0,   0, 'black'],
            [255,   0,   0, 'red'],
            [  0, 255,   0, 'green'],
            [  0,   0, 255, 'blue'],
            [128, 128, 128, 'mid-gray'],
            [ 89, 125,  39, 'grass-like'],
            [174, 164, 115, 'sand-like'],
            [111,  85,  65, 'dirt-like'],
            [ 90,  90,  90, 'stone-like'],
        ];

        for (const [r, g, b, name] of anchors) {
            const ref = rgbToOklabReference(r, g, b);
            const opt = rgbToLab({ r, g, b } as RGB);

            expect(opt.L, `${name} L`).toBeCloseTo(ref.L, 6);
            expect(opt.a, `${name} a`).toBeCloseTo(ref.a, 6);
            expect(opt.b, `${name} b`).toBeCloseTo(ref.b, 6);
        }
    });

    // ---------------------------------------------------------------------------
    // TC2 — OKLab range sanity checks for canonical colors
    // ---------------------------------------------------------------------------
    it('TC2: white → L≈1, a≈0, b≈0', () => {
        const lab = rgbToLab({ r: 255, g: 255, b: 255 } as RGB);
        expect(lab.L).toBeCloseTo(1.0, 4);
        expect(lab.a).toBeCloseTo(0.0, 4);
        expect(lab.b).toBeCloseTo(0.0, 4);
    });

    it('TC2: black → L≈0, a≈0, b≈0', () => {
        const lab = rgbToLab({ r: 0, g: 0, b: 0 } as RGB);
        expect(lab.L).toBeCloseTo(0.0, 4);
        expect(lab.a).toBeCloseTo(0.0, 4);
        expect(lab.b).toBeCloseTo(0.0, 4);
    });

    it('TC2: red has positive a (red axis) and L≈0.628', () => {
        const lab = rgbToLab({ r: 255, g: 0, b: 0 } as RGB);
        expect(lab.L).toBeCloseTo(0.6279, 3);
        expect(lab.a).toBeGreaterThan(0.1);  // OKLab red a ≈ 0.225
    });

    it('TC2: blue has negative a and negative b', () => {
        const lab = rgbToLab({ r: 0, g: 0, b: 255 } as RGB);
        expect(lab.a).toBeLessThan(0);
        expect(lab.b).toBeLessThan(0);
    });

    // ---------------------------------------------------------------------------
    // TC3 — All 256 grayscale steps must match reference within 1e-6
    // ---------------------------------------------------------------------------
    it('TC3: all 256 grayscale steps match OKLab reference within 1e-6', () => {
        for (let v = 0; v < 256; v++) {
            const ref = rgbToOklabReference(v, v, v);
            const opt = rgbToLab({ r: v, g: v, b: v } as RGB);

            expect(opt.L).toBeCloseTo(ref.L, 6);
            expect(opt.a).toBeCloseTo(ref.a, 6);
            expect(opt.b).toBeCloseTo(ref.b, 6);
        }
    });

    // ---------------------------------------------------------------------------
    // TC4 — Determinism: same reference returns cached object
    // ---------------------------------------------------------------------------
    it('TC4: same RGB input returns the same cached object (cache hit)', () => {
        const color: RGB = { r: 128, g: 64, b: 192 };
        const lab1 = rgbToLab(color);
        const lab2 = rgbToLab(color);
        expect(lab1).toBe(lab2);
    });

    // ---------------------------------------------------------------------------
    // TC5 — Pipeline stability: processMapart must produce bit-identical output
    // on two consecutive calls (labCache + colorCache determinism).
    // ---------------------------------------------------------------------------
    it('TC5: processMapart pipeline produces stable output', () => {
        const W = 8, H = 8;
        const data = new Uint8ClampedArray(W * H * 4);

        for (let i = 0; i < W * H; i++) {
            const v = Math.round((i / (W * H - 1)) * 255);
            data[i * 4]     = v;
            data[i * 4 + 1] = Math.round(v * 0.6);
            data[i * 4 + 2] = Math.round(v * 0.3);
            data[i * 4 + 3] = 255;
        }
        const imageData = new ImageData(data, W, H);
        const palette = {
            4:  'minecraft:stone',
            8:  'minecraft:dirt',
            17: 'minecraft:oak_log',
            49: 'minecraft:obsidian',
        };

        const r1 = processMapart(imageData, '3d_valley', palette, 50, 'floyd-steinberg', true, 50, false);
        const r2 = processMapart(imageData, '3d_valley', palette, 50, 'floyd-steinberg', true, 50, false);

        expect(Array.from(r1.imageData.data)).toEqual(Array.from(r2.imageData.data));
        expect(Array.from(r1.packedResults)).toEqual(Array.from(r2.packedResults));

        // All output pixels must map to a valid candidate
        const candidateKeys = new Set(r1.candidates.map(c => `${c.rgb.r},${c.rgb.g},${c.rgb.b}`));
        for (let i = 0; i < W * H; i++) {
            const idx = i * 4;
            const key = `${r1.imageData.data[idx]},${r1.imageData.data[idx+1]},${r1.imageData.data[idx+2]}`;
            expect(candidateKeys.has(key)).toBe(true);
        }
    });
});
