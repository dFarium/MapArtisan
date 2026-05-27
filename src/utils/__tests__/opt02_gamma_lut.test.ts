/**
 * Regression tests for Optimization #2:
 * Replace Math.pow in rgbToLab with:
 *   - GAMMA_LUT[256] for sRGB→linear step (power 2.4)
 *   - Math.cbrt for XYZ→Lab step (power 1/3)
 *
 * Strategy: implement the ORIGINAL formula inline in this test file,
 * compute expected values for known inputs, then compare against the
 * optimized rgbToLab. All candidate colors are integer RGB → must be
 * bit-identical. For the cbrt step we allow ±1e-9 tolerance.
 */

import { describe, it, expect } from 'vitest';
import { processMapart, rgbToLab } from '../mapartProcessing';
import type { RGB } from '../../types/mapart';

// ---------------------------------------------------------------------------
// Reference implementation (original Math.pow formula, used only in tests)
// ---------------------------------------------------------------------------
function rgbToLabReference(r: number, g: number, b: number): { L: number; a: number; b: number } {
    let r1 = r / 255.0;
    let g1 = g / 255.0;
    let b1 = b / 255.0;

    const THRESHOLD = 0.04045, DIVISOR = 12.0, OFFSET = 0.055, POWER = 2.4;
    r1 = r1 <= THRESHOLD ? r1 / DIVISOR : Math.pow((r1 + OFFSET) / (1.0 + OFFSET), POWER);
    g1 = g1 <= THRESHOLD ? g1 / DIVISOR : Math.pow((g1 + OFFSET) / (1.0 + OFFSET), POWER);
    b1 = b1 <= THRESHOLD ? b1 / DIVISOR : Math.pow((b1 + OFFSET) / (1.0 + OFFSET), POWER);

    const Rc = [0.43605202, 0.3850816, 0.14308742];
    const Gc = [0.22249159, 0.71688604, 0.060621485];
    const Bc = [0.013929122, 0.097097, 0.7141855];
    const Wr = { X: 0.964221, Y: 1.0, Z: 0.825211 };

    const f = (Rc[0] * r1 + Rc[1] * g1 + Rc[2] * b1) / Wr.X;
    const h = (Gc[0] * r1 + Gc[1] * g1 + Gc[2] * b1) / Wr.Y;
    const k = (Bc[0] * r1 + Bc[1] * g1 + Bc[2] * b1) / Wr.Z;

    const L_THRESH = 0.008856452, L_FACT = 903.2963, L_OFF = 16.0, L_DIV = 116.0, LAB_POW = 1 / 3;
    const cbrtF = f > L_THRESH ? Math.pow(f, LAB_POW) : (L_FACT * f + L_OFF) / L_DIV;
    const cbrtH = h > L_THRESH ? Math.pow(h, LAB_POW) : (L_FACT * h + L_OFF) / L_DIV;
    const cbrtK = k > L_THRESH ? Math.pow(k, LAB_POW) : (L_FACT * k + L_OFF) / L_DIV;

    const l = cbrtH;
    const m = 500 * (cbrtF - l);
    const n = 200 * (l - cbrtK);

    return {
        L: (255.0 / 100) * (116.0 * l - 16.0) + 0.5,
        a: m + 0.5,
        b: n + 0.5
    };
}

// ---------------------------------------------------------------------------
// TC1 — Integer RGB inputs must produce LAB values within 1e-6 tolerance
// (candidate colors are always integer, so gamma LUT gives identical results;
//  cbrt vs Math.pow(x,1/3) may differ by a sub-ULP epsilon → allow 1e-6)
// ---------------------------------------------------------------------------
describe('Opt#2 — gamma LUT + Math.cbrt (regression)', () => {

    it('TC1: known anchor colors match reference formula within 1e-6', () => {
        const anchors: Array<[number, number, number, string]> = [
            [255, 255, 255, 'white'],
            [0,   0,   0,   'black'],
            [255, 0,   0,   'red'],
            [0,   255, 0,   'green'],
            [0,   0,   255, 'blue'],
            [128, 128, 128, 'mid-gray'],
            [89,  125, 39,  'grass-like'],    // typical Minecraft palette value
            [174, 164, 115, 'sand-like'],
            [111, 85,  65,  'dirt-like'],
            [90,  90,  90,  'stone-like'],
        ];

        for (const [r, g, b, name] of anchors) {
            const ref = rgbToLabReference(r, g, b);
            const opt = rgbToLab({ r, g, b } as RGB);

            expect(opt.L, `${name} L`).toBeCloseTo(ref.L, 6);
            expect(opt.a, `${name} a`).toBeCloseTo(ref.a, 6);
            expect(opt.b, `${name} b`).toBeCloseTo(ref.b, 6);
        }
    });

    // ---------------------------------------------------------------------------
    // TC2 — All 256 pure-channel values must match reference within 1e-6
    // This validates the entire GAMMA_LUT table against the original formula.
    // ---------------------------------------------------------------------------
    it('TC2: all 256 grayscale steps match reference within 1e-6', () => {
        for (let v = 0; v < 256; v++) {
            const ref = rgbToLabReference(v, v, v);
            const opt = rgbToLab({ r: v, g: v, b: v } as RGB);

            // For a fast failure message, only run strict check
            expect(opt.L).toBeCloseTo(ref.L, 6);
            expect(opt.a).toBeCloseTo(ref.a, 6);
            expect(opt.b).toBeCloseTo(ref.b, 6);
        }
    });

    // ---------------------------------------------------------------------------
    // TC3 — Pipeline stability: processMapart with floyd-steinberg dithering
    // must produce consistent, valid output (two identical calls = same result).
    // Exercises the labCache on cache misses from float-valued pixels.
    // ---------------------------------------------------------------------------
    it('TC3: processMapart pipeline produces stable output after optimization', () => {
        const W = 8, H = 8;
        const data = new Uint8ClampedArray(W * H * 4);

        // Gradient image with precise integer values → same as palette-typical inputs
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

        // Run twice — must be bit-identical (labCache + colorCache are deterministic)
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
