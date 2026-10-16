import { describe, expect, it } from 'vitest';
import paletteData from '../../../data/palette.json';
import type { PaletteColor } from '../../../types/mapart';
import {
    ColumnRunLimiter,
    DITHERING_MODES,
    HEIGHT_LIMIT_STYLES,
    NO_HEIGHT_LIMIT,
    applyManualEdits,
    hash01,
    processMapart,
    type HeightLimit,
} from '..';

const FULL_PALETTE: Record<number, string> = {};
for (const color of paletteData.colors as unknown as PaletteColor[]) {
    if (color.blocks.length > 0) FULL_PALETTE[color.colorID] = color.blocks[0].id;
}

/** White strip (always wants highlights), a vertical gradient and noise; crosses one map boundary. */
function makeSource(width: number, height: number): ImageData {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            let r: number, g: number, b: number;
            if (x < 8) {
                r = g = b = 255;
            } else if (x < 20) {
                r = g = b = Math.round((y / (height - 1)) * 255);
            } else {
                r = Math.floor(hash01(x, y) * 256);
                g = Math.floor(hash01(x + 1000, y) * 256);
                b = Math.floor(hash01(x + 2000, y) * 256);
            }
            data[i] = r;
            data[i + 1] = g;
            data[i + 2] = b;
            data[i + 3] = 255;
        }
    }
    return new ImageData(data, width, height);
}

function buildHeight(heightMap: Int32Array): number {
    let tallest = 0;
    for (const range of heightMap) tallest = Math.max(tallest, range);
    return tallest + 1;
}

describe('height limit', () => {
    const source = makeSource(32, 160);

    it('hashes positions deterministically into [0, 1)', () => {
        // Pinned values: a change here changes every limited map.
        expect(hash01(0, 0)).toBe(0);
        expect(hash01(7, 3)).toBe(0.6220613436307758);
        expect(hash01(-5, 123456)).toBe(0.6503004196565598);
        for (let i = 0; i < 1000; i++) {
            const value = hash01(i * 7919, i);
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThan(1);
        }
    });

    it('needs a tall build without a limit', () => {
        const free = processMapart(source, '3d_valley', FULL_PALETTE, NO_HEIGHT_LIMIT, 'hybrid', true, 50, true);
        expect(buildHeight(free.stats.heightMap)).toBeGreaterThan(64);
    });

    describe.each(DITHERING_MODES)('%s', (dithering) => {
        it.each(HEIGHT_LIMIT_STYLES)('keeps every column within the limit with %s resets', (style) => {
            for (const blocks of [1, 2, 3, 5, 9, 24]) {
                for (const independentMaps of [false, true]) {
                    for (const usePerceptual of [true, false]) {
                        const result = processMapart(source, '3d_valley', FULL_PALETTE, { blocks, style }, dithering, usePerceptual, 50, independentMaps);
                        expect(buildHeight(result.stats.heightMap), `${blocks} ${independentMaps} ${usePerceptual}`).toBeLessThanOrEqual(blocks);
                    }
                }
            }
        });
    });

    it('builds a flat map at one block', () => {
        const result = processMapart(source, '3d_valley', FULL_PALETTE, { blocks: 1, style: 'lines' }, 'floyd-steinberg', true, 50, true);
        expect(result.toneMap!.every(tone => tone === 0)).toBe(true);
    });

    it('matches the unlimited result when the limit never binds', () => {
        const free = processMapart(source, '3d_valley', FULL_PALETTE, NO_HEIGHT_LIMIT, 'hybrid-v2', true, 50, true);
        const loose = processMapart(source, '3d_valley', FULL_PALETTE, { blocks: 10_000, style: 'noise' }, 'hybrid-v2', true, 50, true);
        expect(loose.imageData.data).toEqual(free.imageData.data);
        expect(loose.packedResults).toEqual(free.packedResults);
    });

    it('ignores the limit in 2D mode', () => {
        const free = processMapart(source, '2d', FULL_PALETTE, NO_HEIGHT_LIMIT, 'hybrid', true, 50, true);
        const limited = processMapart(source, '2d', FULL_PALETTE, { blocks: 2, style: 'lines' }, 'hybrid', true, 50, true);
        expect(limited.packedResults).toEqual(free.packedResults);
    });

    it('gives each style its own reset pattern and keeps fidelity close', () => {
        const results = HEIGHT_LIMIT_STYLES.map(style =>
            processMapart(source, '3d_valley', FULL_PALETTE, { blocks: 9, style }, 'hybrid', true, 50, true));
        expect(results[0].packedResults).not.toEqual(results[1].packedResults);
        expect(results[1].packedResults).not.toEqual(results[2].packedResults);
    });

    it('lets manual edits exceed the limit', () => {
        const limit: HeightLimit = { blocks: 3, style: 'lines' };
        const width = source.width;
        const base = processMapart(source, '3d_valley', FULL_PALETTE, limit, 'none', true, 50, true);
        const white = base.candidates.find(candidate => candidate.brightness === 'high')!;
        const edits: Parameters<typeof applyManualEdits>[2] = {};
        for (let y = 0; y < 12; y++) {
            edits[y * width + 5] = { blockId: white.blockId, brightness: 'high', rgb: white.rgb };
        }
        const edited = applyManualEdits(base.imageData, base.packedResults, edits, '3d_valley', base.candidates, base.toneMap, true);
        expect(buildHeight(edited.stats.heightMap)).toBeGreaterThan(limit.blocks);
    });
});

describe('ColumnRunLimiter', () => {
    function runLengths(style: HeightLimit['style'], blocks: number, rows: number): number[] {
        // One column that always wants highlights; record the run reached before each reset.
        const limiter = new ColumnRunLimiter(1, { blocks, style });
        limiter.resetSegment(0);
        const runs: number[] = [];
        let run = 0;
        for (let y = 0; y < rows; y++) {
            const tone = limiter.allowedTone(0, y, 1);
            if (tone === 1) {
                run++;
            } else {
                runs.push(run);
                run = 0;
            }
            limiter.commit(0, y, tone);
        }
        return runs;
    }

    it('cuts every run at the limit with lines', () => {
        const runs = runLengths('lines', 9, 200);
        expect(runs.length).toBeGreaterThan(10);
        // After the first reset, each run resumes after one shadow pixel.
        expect(runs.every(run => run === 8)).toBe(true);
    });

    it('draws each run between half the limit and the limit with noise', () => {
        const runs = runLengths('noise', 17, 2000);
        expect(Math.min(...runs)).toBeGreaterThanOrEqual(8);
        expect(Math.max(...runs)).toBeLessThanOrEqual(16);
        expect(new Set(runs).size).toBeGreaterThan(4);
    });

    it('resets past half the limit with balanced', () => {
        const runs = runLengths('balanced', 17, 2000);
        expect(Math.min(...runs)).toBeGreaterThanOrEqual(8);
        expect(Math.max(...runs)).toBeLessThanOrEqual(16);
        expect(new Set(runs).size).toBeGreaterThan(3);
    });

    it('turns every non-normal tone into normal at one block', () => {
        const limiter = new ColumnRunLimiter(1, { blocks: 1, style: 'noise' });
        limiter.resetSegment(0);
        expect(limiter.allowedTone(0, 0, 1)).toBe(0);
        expect(limiter.allowedTone(0, 0, -1)).toBe(0);
        expect(limiter.allowedTone(0, 0, 0)).toBe(0);
    });
});
