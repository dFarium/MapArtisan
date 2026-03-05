/**
 * Tests de corrección para build3DGeometry.
 *
 * Verifican que la función produce la geometría correcta para todos
 * los escenarios importantes, sirviéndose como test de regresión
 * antes y después de las optimizaciones planificadas.
 */

import { describe, it, expect } from 'vitest';
import { build3DGeometry, type GeometryParams, type BlockColorRGB } from '../build3DGeometry';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const GRAY_SUPPORT: BlockColorRGB = { r: 128, g: 128, b: 128 };

/** Creates a plain ImageData-like object filled with a single RGBA color */
function makeImageData(width: number, height: number, r = 100, g = 100, b = 100): ImageData {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
        data[i * 4] = r;
        data[i * 4 + 1] = g;
        data[i * 4 + 2] = b;
        data[i * 4 + 3] = 255;
    }
    return new ImageData(data, width, height);
}

/** Creates a deterministic mixed toneMap (no external deps) */
function makeMixedToneMap(width: number, height: number): Int8Array {
    const tones = new Int8Array(width * height);
    for (let i = 0; i < tones.length; i++) {
        tones[i] = (i % 3) - 1 as -1 | 0 | 1; // cycles: -1, 0, 1
    }
    return tones;
}

/** Returns (x, y, z) for instance i */
function getPos(positions: Float32Array, i: number) {
    return {
        x: positions[i * 3],
        y: positions[i * 3 + 1],
        z: positions[i * 3 + 2],
    };
}

/** Returns (r, g, b) normalized 0-1 for instance i */
function getColor(colors: Float32Array, i: number) {
    return {
        r: colors[i * 3],
        g: colors[i * 3 + 1],
        b: colors[i * 3 + 2],
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('build3DGeometry', () => {

    // ── Basic output shape ─────────────────────────────────────────────────

    describe('output shape', () => {
        it('returns Float32Array buffers with correct length', () => {
            const width = 4, height = 4;
            const imageData = makeImageData(width, height);
            const params: GeometryParams = {
                imageData,
                toneMap: null,
                blockSupport: 'none' as unknown as 'all',
                supportColor: GRAY_SUPPORT,
            };
            const geo = build3DGeometry(params);

            expect(geo.positions).toBeInstanceOf(Float32Array);
            expect(geo.colors).toBeInstanceOf(Float32Array);
            expect(geo.positions.length).toBe(geo.count * 3);
            expect(geo.colors.length).toBe(geo.count * 3);
        });

        it('produces at least width×height instances for a flat map (no supports)', () => {
            const width = 8, height = 8;
            const imageData = makeImageData(width, height);
            const params: GeometryParams = {
                imageData,
                toneMap: null,
                blockSupport: 'needed', // no extra blocks since all heights will be 0
                supportColor: GRAY_SUPPORT,
            };
            const geo = build3DGeometry(params);
            // 8×8 map + 8 noobline blocks = 72
            expect(geo.count).toBe(width * height + width); // noobline = 1 row × width
        });
    });

    // ── 2D mode (all tones = 0) ────────────────────────────────────────────

    describe('2D flat map', () => {
        it('all blocks at height 0 when tones are flat', () => {
            const width = 4, height = 4;
            const imageData = makeImageData(width, height);
            const toneMap = new Int8Array(width * height).fill(0);

            const params: GeometryParams = {
                imageData,
                toneMap,
                blockSupport: 'needed',
                supportColor: GRAY_SUPPORT,
            };
            const geo = build3DGeometry(params);

            // All non-noobline blocks should be at y=0
            // Use toBeCloseTo to handle -0 vs +0 float equality
            for (let i = 0; i < geo.count; i++) {
                expect(getPos(geo.positions, i).y).toBeCloseTo(0, 5);
            }
        });

        it('centers the map around (0, 0) on X and Z axes', () => {
            const width = 4, height = 4;
            const imageData = makeImageData(width, height);
            const params: GeometryParams = {
                imageData,
                toneMap: null,
                blockSupport: 'needed',
                supportColor: GRAY_SUPPORT,
            };
            const geo = build3DGeometry(params);

            // For a 4×4 map, X range is approximately [-1.5, 1.5]
            let minX = Infinity, maxX = -Infinity;
            for (let i = 0; i < geo.count; i++) {
                const x = getPos(geo.positions, i).x;
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
            }
            expect(minX).toBeCloseTo(-1.5, 1);
            expect(maxX).toBeCloseTo(1.5, 1);
        });
    });

    // ── Color fidelity ─────────────────────────────────────────────────────

    describe('color output', () => {
        it('copies pixel RGB to colors buffer (normalized to 0-1)', () => {
            // Single pixel image: pure red
            const data = new Uint8ClampedArray([255, 0, 0, 255]);
            const imageData = new ImageData(data, 1, 1);

            const params: GeometryParams = {
                imageData,
                toneMap: new Int8Array([0]),
                blockSupport: 'needed',
                supportColor: GRAY_SUPPORT,
            };
            const geo = build3DGeometry(params);

            // Find the non-noobline block (noobline will be support color)
            let foundRed = false;
            for (let i = 0; i < geo.count; i++) {
                const c = getColor(geo.colors, i);
                if (Math.abs(c.r - 1) < 0.01 && Math.abs(c.g) < 0.01 && Math.abs(c.b) < 0.01) {
                    foundRed = true;
                }
            }
            expect(foundRed).toBe(true);
        });

        it('noobline instances use support color', () => {
            // A single-column map — the noobline (y=-1) should use support color
            const imageData = makeImageData(1, 4, 200, 100, 50);
            const params: GeometryParams = {
                imageData,
                toneMap: new Int8Array(4).fill(0),
                blockSupport: 'needed',
                supportColor: { r: 255, g: 0, b: 255 }, // magenta support
            };
            const geo = build3DGeometry(params);

            // The instance with z = -2 (noobline: y=-1, worldZ = -1 - (4-1)/2 = -2.5)
            let foundSupportColor = false;
            for (let i = 0; i < geo.count; i++) {
                const pos = getPos(geo.positions, i);
                if (Math.abs(pos.z - (-2.5)) < 0.01) {
                    const c = getColor(geo.colors, i);
                    expect(c.r).toBeCloseTo(1, 2);   // magenta = (1, 0, 1)
                    expect(c.g).toBeCloseTo(0, 2);
                    expect(c.b).toBeCloseTo(1, 2);
                    foundSupportColor = true;
                }
            }
            expect(foundSupportColor).toBe(true);
        });
    });

    // ── Support blocks ─────────────────────────────────────────────────────

    describe('support block generation', () => {
        it('blockSupport="all" adds a support block below elevated blocks', () => {
            // Force a high tone to create elevation
            const imageData = makeImageData(1, 2);
            const toneMap = new Int8Array([1, 0]); // first row is 'high' → block goes up

            const withSupport = build3DGeometry({
                imageData,
                toneMap,
                blockSupport: 'all',
                supportColor: GRAY_SUPPORT,
            });

            const withoutSupport = build3DGeometry({
                imageData,
                toneMap,
                blockSupport: 'needed',
                supportColor: GRAY_SUPPORT,
            });

            expect(withSupport.count).toBeGreaterThan(withoutSupport.count);
        });

        it('blockSupport="gravity" uses needsSupportMap to decide per-block', () => {
            const imageData = makeImageData(2, 2);
            const toneMap = new Int8Array([1, 0, 0, 0]); // first block elevated

            // Only first block needs support
            const needsSupportMap = new Uint8Array([1, 0, 0, 0]);

            const geoWithGravity = build3DGeometry({
                imageData,
                toneMap,
                blockSupport: 'gravity',
                supportColor: GRAY_SUPPORT,
                needsSupportMap,
            });

            const geoWithAll = build3DGeometry({
                imageData,
                toneMap,
                blockSupport: 'all',
                supportColor: GRAY_SUPPORT,
            });

            // gravity mode should add fewer support blocks than "all"
            expect(geoWithGravity.count).toBeLessThan(geoWithAll.count);
        });
    });

    // ── Section preview filtering ──────────────────────────────────────────

    describe('section filtering', () => {
        it('filters blocks outside previewSection X range', () => {
            const width = 256, height = 128; // two 128-wide sections side by side
            const imageData = makeImageData(width, height);

            const fullGeo = build3DGeometry({
                imageData,
                toneMap: null,
                blockSupport: 'needed',
                supportColor: GRAY_SUPPORT,
            });

            const sectionGeo = build3DGeometry({
                imageData,
                toneMap: null,
                blockSupport: 'needed',
                supportColor: GRAY_SUPPORT,
                previewSection: { x: 0, y: 0 },
                exportMode: 'sections',
            });

            // Section should have roughly half the blocks
            expect(sectionGeo.count).toBeLessThan(fullGeo.count);
        });
    });

    // ── Determinism ────────────────────────────────────────────────────────

    describe('determinism', () => {
        it('produces identical output on repeated calls with same input', () => {
            const width = 8, height = 8;
            const imageData = makeImageData(width, height, 120, 80, 40);
            const toneMap = makeMixedToneMap(width, height);

            const params: GeometryParams = {
                imageData,
                toneMap,
                blockSupport: 'all',
                supportColor: GRAY_SUPPORT,
            };

            const geo1 = build3DGeometry(params);
            const geo2 = build3DGeometry(params);

            expect(geo1.count).toBe(geo2.count);
            expect(Array.from(geo1.positions)).toEqual(Array.from(geo2.positions));
            expect(Array.from(geo1.colors)).toEqual(Array.from(geo2.colors));
        });
    });

    // ── Snapshot (golden values) ───────────────────────────────────────────
    // These capture the exact output of the CURRENT algorithm so any future
    // refactoring that changes values will surface immediately.

    describe('snapshot / golden values', () => {
        it('1×2 map with tone [1, 0] matches expected positions and colors', () => {
            const data = new Uint8ClampedArray([
                255, 0, 0, 255,   // pixel (0,0) = red
                0, 255, 0, 255,   // pixel (0,1) = green
            ]);
            const imageData = new ImageData(data, 1, 2);
            const toneMap = new Int8Array([1, 0]); // first row high

            const geo = build3DGeometry({
                imageData,
                toneMap,
                blockSupport: 'needed',
                supportColor: { r: 128, g: 128, b: 128 },
            });

            // Snapshot the count and first few positions
            expect(geo.count).toMatchSnapshot();
            expect(Array.from(geo.positions.slice(0, 9))).toMatchSnapshot();
            expect(Array.from(geo.colors.slice(0, 9))).toMatchSnapshot();
        });
    });
});
