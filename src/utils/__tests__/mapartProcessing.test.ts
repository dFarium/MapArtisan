import { describe, it, expect } from 'vitest';
import {
    rgbToLab,
    deltaE,
    optimizeColumnHeights,
    getValidColors,
    processMapart,
    applyManualEdits,
    type LAB
} from '../mapartProcessing';
import type { BrightnessLevel, RGB } from '../../types/mapart';

describe('mapartProcessing', () => {
    describe('rgbToLab', () => {
        it('converts pure white correctly', () => {
            const white: RGB = { r: 255, g: 255, b: 255 };
            const lab = rgbToLab(white);

            // White should have high L value (close to 255.5)
            expect(lab.L).toBeCloseTo(255.5, 1);
            // a and b should be close to 0.5 (neutral + offset)
            expect(lab.a).toBeCloseTo(0.5, 1);
            expect(lab.b).toBeCloseTo(0.5, 1);
        });

        it('converts pure black correctly', () => {
            const black: RGB = { r: 0, g: 0, b: 0 };
            const lab = rgbToLab(black);

            // Black should have low L value (close to 0.5 due to offset)
            expect(lab.L).toBeCloseTo(0.5, 1);
        });

        it('is deterministic and uses cache', () => {
            const color: RGB = { r: 128, g: 64, b: 192 };
            const lab1 = rgbToLab(color);
            const lab2 = rgbToLab(color);

            // Should return same reference (cache)
            expect(lab1).toBe(lab2);
        });

        it('converts pure red correctly', () => {
            const red: RGB = { r: 255, g: 0, b: 0 };
            const lab = rgbToLab(red);

            // Red should have positive a value
            expect(lab.a).toBeGreaterThan(50);
        });
    });

    describe('deltaE', () => {
        it('returns 0 for identical colors', () => {
            const lab1: LAB = { L: 128, a: 10, b: -5 };
            const lab2: LAB = { L: 128, a: 10, b: -5 };

            expect(deltaE(lab1, lab2)).toBe(0);
        });

        it('returns positive distance for different colors', () => {
            const lab1: LAB = { L: 100, a: 0, b: 0 };
            const lab2: LAB = { L: 200, a: 50, b: -50 };

            const distance = deltaE(lab1, lab2);
            expect(distance).toBeGreaterThan(0);
        });

        it('is symmetric', () => {
            const lab1: LAB = { L: 100, a: 20, b: -10 };
            const lab2: LAB = { L: 150, a: -30, b: 40 };

            expect(deltaE(lab1, lab2)).toBeCloseTo(deltaE(lab2, lab1), 5);
        });
    });

    describe('optimizeColumnHeights (Smart Drop)', () => {
        it('handles empty array', () => {
            const result = optimizeColumnHeights([]);
            expect(result.path).toEqual([]);
            expect(result.min).toBe(0);
            expect(result.max).toBe(0);
        });

        it('handles flat column (all normal)', () => {
            const tones = [0, 0, 0, 0];
            const result = optimizeColumnHeights(tones);

            expect(result.path).toEqual([0, 0, 0, 0]);
            expect(result.min).toBe(0);
            expect(result.max).toBe(0);
        });

        it('handles simple climb (all high)', () => {
            const tones = [1, 1, 1];
            const result = optimizeColumnHeights(tones);

            expect(result.path).toEqual([1, 2, 3]);
            expect(result.min).toBe(0); // Algorithm starts at 0
            expect(result.max).toBe(3);
        });

        it('handles simple descent (all low)', () => {
            const tones = [-1, -1, -1];
            const result = optimizeColumnHeights(tones);

            expect(result.path.length).toBe(3);
            // Smart drop should optimize depth
            expect(result.path[2]).toBeLessThan(result.path[0]);
        });

        it('optimizes mixed column with smart drop', () => {
            // Pattern: climb, normal, drop, climb again
            const tones = [1, 0, -1, 1];
            const result = optimizeColumnHeights(tones);

            expect(result.path.length).toBe(4);
            // Path should respect tone changes
            expect(result.path[0]).toBeLessThanOrEqual(result.path[1]);
            expect(result.path[2]).toBeLessThan(result.path[1]);
        });

        it('produces smaller range than naive implementation', () => {
            // Complex pattern where Smart Drop helps
            const tones = [1, 1, -1, -1, 1, 1, -1, -1];
            const result = optimizeColumnHeights(tones);

            // Naive implementation (simple cumulative)
            let refHeight = 0;
            let refMax = 0;
            let refMin = 0;
            for (const t of tones) {
                refHeight += t;
                if (refHeight > refMax) refMax = refHeight;
                if (refHeight < refMin) refMin = refHeight;
            }

            const refRange = refMax - refMin;
            const optRange = result.max - result.min;

            // Optimized should be equal or better
            expect(optRange).toBeLessThanOrEqual(refRange);
        });
    });

    describe('getValidColors', () => {
        it('returns empty array when no palette selected', () => {
            const selectedPaletteItems = {};
            const result = getValidColors(selectedPaletteItems, '2d');

            expect(result).toEqual([]);
        });

        it('returns only normal brightness for 2d mode', () => {
            const selectedPaletteItems = {
                4: 'minecraft:stone' // Grass (ID 4 in palette)
            };
            const result = getValidColors(selectedPaletteItems, '2d');

            expect(result.length).toBeGreaterThan(0);
            expect(result.every(c => c.brightness === 'normal')).toBe(true);
        });

        it('returns only high brightness for staircase mode', () => {
            const selectedPaletteItems = {
                4: 'minecraft:stone'
            };
            const result = getValidColors(selectedPaletteItems, 'staircase');

            expect(result.length).toBeGreaterThan(0);
            expect(result.every(c => c.brightness === 'high')).toBe(true);
        });

        it('returns all brightness levels for 3d_valley mode', () => {
            const selectedPaletteItems = {
                4: 'minecraft:stone'
            };
            const result = getValidColors(selectedPaletteItems, '3d_valley');

            const brightnesses = new Set(result.map(c => c.brightness));
            expect(brightnesses.has('low')).toBe(true);
            expect(brightnesses.has('normal')).toBe(true);
            expect(brightnesses.has('high')).toBe(true);
        });

        it('includes blockId for each candidate', () => {
            const selectedPaletteItems = {
                4: 'minecraft:stone'
            };
            const result = getValidColors(selectedPaletteItems, '2d');

            expect(result.every(c => c.blockId === 'minecraft:stone')).toBe(true);
        });
    });

    describe('processMapart', () => {
        it('processes simple 2x2 image', () => {
            const data = new Uint8ClampedArray([
                255, 0, 0, 255,    // Red
                0, 255, 0, 255,    // Green
                0, 0, 255, 255,    // Blue
                255, 255, 0, 255   // Yellow
            ]);
            const imageData = new ImageData(data, 2, 2);

            const selectedPaletteItems = {
                4: 'minecraft:stone',
                8: 'minecraft:dirt'
            };

            const result = processMapart(
                imageData,
                '2d',
                selectedPaletteItems,
                50,
                'none',
                true,
                50,
                false
            );

            expect(result.imageData.width).toBe(2);
            expect(result.imageData.height).toBe(2);
            expect(result.stats).toBeDefined();
            expect(result.toneMap).toBeInstanceOf(Int8Array);
            expect(result.blockIndices).toBeInstanceOf(Int32Array);
            expect(result.candidates.length).toBeGreaterThan(0);
        });

        it('returns original image when no palette selected', () => {
            const data = new Uint8ClampedArray([255, 0, 0, 255]);
            const imageData = new ImageData(data, 1, 1);

            const result = processMapart(
                imageData,
                '2d',
                {},
                50,
                'none',
                true,
                50,
                false
            );

            expect(result.imageData.data).toEqual(data);
            expect(result.stats.minHeight).toBe(0);
            expect(result.stats.maxHeight).toBe(0);
            expect(result.candidates).toEqual([]);
        });

        it('generates valid tone map for 3d_valley mode', () => {
            const data = new Uint8ClampedArray(4 * 4);
            for (let i = 0; i < data.length; i += 4) {
                data[i] = 128;
                data[i + 1] = 128;
                data[i + 2] = 128;
                data[i + 3] = 255;
            }
            const imageData = new ImageData(data, 2, 2);

            const selectedPaletteItems = {
                4: 'minecraft:stone'
            };

            const result = processMapart(
                imageData,
                '3d_valley',
                selectedPaletteItems,
                50,
                'none',
                true,
                50,
                false
            );

            expect(result.toneMap.length).toBe(4);
            // Tones should be -1, 0, or 1
            for (const tone of result.toneMap) {
                expect(tone).toBeGreaterThanOrEqual(-1);
                expect(tone).toBeLessThanOrEqual(1);
            }
        });

        it('maintains 2D mode stats correctly', () => {
            const data = new Uint8ClampedArray(16); // 2x2 pixels
            for (let i = 0; i < data.length; i += 4) {
                data[i] = 100;
                data[i + 1] = 100;
                data[i + 2] = 100;
                data[i + 3] = 255;
            }
            const imageData = new ImageData(data, 2, 2);

            const selectedPaletteItems = {
                4: 'minecraft:stone'
            };

            const result = processMapart(
                imageData,
                '2d',
                selectedPaletteItems,
                50,
                'none',
                true,
                50,
                false
            );

            // 2D mode should have no height variation
            expect(result.stats.minHeight).toBe(0);
            expect(result.stats.maxHeight).toBe(0);
        });
    });

    describe('applyManualEdits', () => {
        it('applies edits to image data', () => {
            const data = new Uint8ClampedArray([
                100, 100, 100, 255,
                150, 150, 150, 255
            ]);
            const baseImageData = new ImageData(data, 2, 1);
            const baseToneMap = new Int8Array([0, 0]);

            const manualEdits = {
                0: {
                    blockId: 'minecraft:stone',
                    brightness: 'high' as BrightnessLevel,
                    rgb: { r: 255, g: 0, b: 0 }
                }
            };

            const baseNeedsSupportMap = new Uint8Array([0, 0]);

            const result = applyManualEdits(
                baseImageData,
                baseToneMap,
                baseNeedsSupportMap,
                manualEdits,
                '3d_valley'
            );

            // First pixel should be red now
            expect(result.imageData.data[0]).toBe(255);
            expect(result.imageData.data[1]).toBe(0);
            expect(result.imageData.data[2]).toBe(0);

            // Second pixel unchanged
            expect(result.imageData.data[4]).toBe(150);

            // Tone map updated for 3d_valley
            expect(result.toneMap[0]).toBe(1); // high brightness
        });

        it('does not mutate base image data', () => {
            const data = new Uint8ClampedArray([100, 100, 100, 255]);
            const baseImageData = new ImageData(data, 1, 1);
            const baseToneMap = new Int8Array([0]);

            const manualEdits = {
                0: {
                    blockId: 'minecraft:stone',
                    brightness: 'normal' as BrightnessLevel,
                    rgb: { r: 255, g: 255, b: 255 }
                }
            };

            const baseNeedsSupportMap = new Uint8Array([0]);

            applyManualEdits(baseImageData, baseToneMap, baseNeedsSupportMap, manualEdits, '2d');

            // Original should be unchanged
            expect(baseImageData.data[0]).toBe(100);
            expect(baseToneMap[0]).toBe(0);
        });

        it('handles multiple edits correctly', () => {
            const data = new Uint8ClampedArray([
                100, 100, 100, 255,
                100, 100, 100, 255,
                100, 100, 100, 255
            ]);
            const baseImageData = new ImageData(data, 3, 1);
            const baseToneMap = new Int8Array([0, 0, 0]);

            const manualEdits = {
                0: {
                    blockId: 'minecraft:stone',
                    brightness: 'high' as BrightnessLevel,
                    rgb: { r: 255, g: 0, b: 0 }
                },
                2: {
                    blockId: 'minecraft:dirt',
                    brightness: 'low' as BrightnessLevel,
                    rgb: { r: 0, g: 0, b: 255 }
                }
            };

            const baseNeedsSupportMap = new Uint8Array([0, 0, 0]);

            const result = applyManualEdits(
                baseImageData,
                baseToneMap,
                baseNeedsSupportMap,
                manualEdits,
                '3d_valley'
            );

            // First pixel red
            expect(result.imageData.data[0]).toBe(255);
            expect(result.imageData.data[1]).toBe(0);
            expect(result.imageData.data[2]).toBe(0);

            // Second pixel unchanged
            expect(result.imageData.data[4]).toBe(100);

            // Third pixel blue
            expect(result.imageData.data[8]).toBe(0);
            expect(result.imageData.data[9]).toBe(0);
            expect(result.imageData.data[10]).toBe(255);

            // Tone map updated
            expect(result.toneMap[0]).toBe(1);  // high
            expect(result.toneMap[1]).toBe(0);  // unchanged
            expect(result.toneMap[2]).toBe(-1); // low
        });
    });
});
