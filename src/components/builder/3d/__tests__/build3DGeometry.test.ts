/**
 * Tests de corrección para build3DGeometry.
 *
 * Verifican que la función produce la geometría correcta para todos
 * los escenarios importantes, sirviéndose como test de regresión
 * antes y después de las optimizaciones planificadas.
 */

import { describe, it, expect } from 'vitest';
import { build3DGeometry, type Build3DGeometryProps } from '../build3DGeometry';
import { packPixel } from '../../../../utils/mapartProcessing';
import type { RGB } from '../../../../types/mapart';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const GRAY_SUPPORT: RGB = { r: 128, g: 128, b: 128 };

/** Helper to construct packedResults from toneMap and needsSupportMap for testing */
function makePackedResults(width: number, height: number, toneMap?: Int8Array | null, needsSupportMap?: Uint8Array | null): Uint32Array {
    const packed = new Uint32Array(width * height);
    for (let i = 0; i < packed.length; i++) {
        const tone = toneMap ? toneMap[i] : 0;
        const support = needsSupportMap ? (needsSupportMap[i] === 1) : false;
        packed[i] = packPixel(0, tone, support);
    }
    return packed;
}

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
            const params: Build3DGeometryProps = {
                imageData,
                packedResults: new Uint32Array(width * height),
                candidateBlocks: ['minecraft:stone'],
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
            const params: Build3DGeometryProps = {
                imageData,
                packedResults: new Uint32Array(width * height),
                candidateBlocks: ['minecraft:stone'],
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

            const params: Build3DGeometryProps = {
                imageData,
                packedResults: makePackedResults(width, height, toneMap),
                candidateBlocks: ['minecraft:stone'],
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
            const params: Build3DGeometryProps = {
                imageData,
                packedResults: new Uint32Array(width * height),
                candidateBlocks: ['minecraft:stone'],
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

            const params: Build3DGeometryProps = {
                imageData,
                packedResults: makePackedResults(1, 1, new Int8Array([0])),
                candidateBlocks: ['minecraft:stone'],
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
            const params: Build3DGeometryProps = {
                imageData,
                packedResults: makePackedResults(1, 4, new Int8Array(4).fill(0)),
                candidateBlocks: ['minecraft:stone'],
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

        it('noobline height is correctly shifted relative to the first block in precomputed and slow path', () => {
            const imageData = makeImageData(1, 4);
            const toneMap = new Int8Array([1, 0, -1, 0]); // tone at y=0 is 1 (highlight)
            const packedResults = makePackedResults(1, 4, toneMap);

            // 1. Slow path test (precomputedHeightPath is not provided)
            const geoSlow = build3DGeometry({
                imageData,
                packedResults,
                candidateBlocks: ['minecraft:stone'],
                blockSupport: 'needed',
                supportColor: GRAY_SUPPORT,
            });

            // For slow path, toneMap[0] = 1, path[0] = 1.
            // minPathY is -1 (from y=2: tone -1, cumulative from path[0]=1, path[1]=1, path[2]=0, path[3]=0, minPathY is 0. But wait, optimizeColumnHeights outputs:
            // ref = [0, 1, 1, 0, 0]
            // Smart Drop outputs: path[0]=1, path[1]=1, path[2]=0, path[3]=0. min is 0. So shift = 0.
            // So y=0 is at height 1. Noobline should be at 0.
            let nooblineYSlow = -999;
            let firstBlockYSlow = -999;
            for (let i = 0; i < geoSlow.count; i++) {
                const pos = getPos(geoSlow.positions, i);
                if (Math.abs(pos.z - (-2.5)) < 0.01) { // noobline y=-1, worldZ = -1 - 1.5 = -2.5
                    nooblineYSlow = pos.y;
                } else if (Math.abs(pos.z - (-1.5)) < 0.01) { // block y=0, worldZ = 0 - 1.5 = -1.5
                    firstBlockYSlow = pos.y;
                }
            }
            expect(firstBlockYSlow - nooblineYSlow).toBe(1); // height difference should be toneMap[0] = 1

            // 2. Fast path test (precomputedHeightPath is provided)
            // Suppose precomputedHeightPath is [5, 5, 4, 4] (already shifted, toneMap[0] = 1)
            const precomputedHeightPath = new Int32Array([5, 5, 4, 4]);
            const geoFast = build3DGeometry({
                imageData,
                packedResults,
                candidateBlocks: ['minecraft:stone'],
                blockSupport: 'needed',
                supportColor: GRAY_SUPPORT,
                precomputedHeightPath,
            });

            let nooblineYFast = -999;
            let firstBlockYFast = -999;
            for (let i = 0; i < geoFast.count; i++) {
                const pos = getPos(geoFast.positions, i);
                if (Math.abs(pos.z - (-2.5)) < 0.01) {
                    nooblineYFast = pos.y;
                } else if (Math.abs(pos.z - (-1.5)) < 0.01) {
                    firstBlockYFast = pos.y;
                }
            }
            // First block height should be precomputedHeightPath[0] = 5
            expect(firstBlockYFast).toBe(5);
            // Height difference should be toneMap[0] = 1
            expect(firstBlockYFast - nooblineYFast).toBe(1);
            // Therefore, noobline height should be 4
            expect(nooblineYFast).toBe(4);
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
                packedResults: makePackedResults(1, 2, toneMap),
                candidateBlocks: ['minecraft:stone'],
                blockSupport: 'all',
                supportColor: GRAY_SUPPORT,
            });

            const withoutSupport = build3DGeometry({
                imageData,
                packedResults: makePackedResults(1, 2, toneMap),
                candidateBlocks: ['minecraft:stone'],
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
                packedResults: makePackedResults(2, 2, toneMap, needsSupportMap),
                candidateBlocks: ['minecraft:stone'],
                blockSupport: 'gravity',
                supportColor: GRAY_SUPPORT,
            });

            const geoWithAll = build3DGeometry({
                imageData,
                packedResults: makePackedResults(2, 2, toneMap),
                candidateBlocks: ['minecraft:stone'],
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
                packedResults: new Uint32Array(width * height),
                candidateBlocks: ['minecraft:stone'],
                blockSupport: 'needed',
                supportColor: GRAY_SUPPORT,
            });

            const sectionGeo = build3DGeometry({
                imageData,
                packedResults: new Uint32Array(width * height),
                candidateBlocks: ['minecraft:stone'],
                blockSupport: 'needed',
                supportColor: GRAY_SUPPORT,
                previewSection: { x: 0, y: 0 },
                exportMode: 'sections',
            });

            // Section should have roughly half the blocks
            expect(sectionGeo.count).toBeLessThan(fullGeo.count);
        });

        it('filters blocks outside previewSection Y range', () => {
            const width = 128, height = 256; // two 128-tall sections stacked vertically
            const imageData = makeImageData(width, height);

            const fullGeo = build3DGeometry({
                imageData,
                packedResults: new Uint32Array(width * height),
                candidateBlocks: ['minecraft:stone'],
                blockSupport: 'needed',
                supportColor: GRAY_SUPPORT,
            });

            const sectionGeo = build3DGeometry({
                imageData,
                packedResults: new Uint32Array(width * height),
                candidateBlocks: ['minecraft:stone'],
                blockSupport: 'needed',
                supportColor: GRAY_SUPPORT,
                previewSection: { x: 0, y: 1 },
                exportMode: 'sections',
            });

            // Section should have roughly half the blocks
            expect(sectionGeo.count).toBeLessThan(fullGeo.count);
            // Expected count: 128 columns * (128 blocks + 1 noobline) = 16512
            expect(sectionGeo.count).toBe(128 * 129);
        });
    });

    // ── Determinism ────────────────────────────────────────────────────────

    describe('determinism', () => {
        it('produces identical output on repeated calls with same input', () => {
            const width = 8, height = 8;
            const imageData = makeImageData(width, height, 120, 80, 40);
            const toneMap = makeMixedToneMap(width, height);

            const params: Build3DGeometryProps = {
                imageData,
                packedResults: makePackedResults(width, height, toneMap),
                candidateBlocks: ['minecraft:stone'],
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
                packedResults: makePackedResults(1, 2, toneMap),
                candidateBlocks: ['minecraft:stone'],
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
