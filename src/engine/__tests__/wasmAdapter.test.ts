import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { NO_HEIGHT_LIMIT, getValidColors, processMapart, type HeightLimit } from '../../utils/processing';
import { GOLDEN_HYBRID_STRENGTH, GOLDEN_PALETTE, makeGoldenSource } from '../../utils/__tests__/goldenFixtures';
import { initSync, process_v1 } from '../../wasm/processing/processing_wasm';

beforeAll(() => {
    const bytes = readFileSync(resolve(process.cwd(), 'src/wasm/processing/processing_wasm_bg.wasm'));
    initSync({ module: bytes });
});

describe('WASM processing adapter', () => {
    it.each([
        ['2d', 'none', false, false, NO_HEIGHT_LIMIT] as const,
        ['2d', 'floyd-steinberg', true, false, NO_HEIGHT_LIMIT] as const,
        ['3d_valley', 'hybrid', true, false, NO_HEIGHT_LIMIT] as const,
        ['3d_valley', 'hybrid-v2', false, false, NO_HEIGHT_LIMIT] as const,
        ['3d_valley', 'hybrid-v2', true, true, NO_HEIGHT_LIMIT] as const,
        ['3d_valley', 'hybrid', true, true, { blocks: 3, style: 'lines' } as HeightLimit] as const,
        ['3d_valley', 'ordered', true, false, { blocks: 5, style: 'balanced' } as HeightLimit] as const,
        ['3d_valley', 'hybrid-v2', true, true, { blocks: 4, style: 'noise' } as HeightLimit] as const,
    ])('matches TypeScript for %s / %s / perceptual=%s / independent=%s / limit=%o', (buildMode, dithering, usePerceptual, independentMaps, heightLimit) => {
        const source = makeGoldenSource(128, 128);
        const candidates = getValidColors(GOLDEN_PALETTE, buildMode);
        const expected = processMapart(source, buildMode, GOLDEN_PALETTE, heightLimit,
            dithering, usePerceptual, GOLDEN_HYBRID_STRENGTH, independentMaps);
        const sourceBytes = new Uint8Array(source.data.buffer, source.data.byteOffset, source.data.byteLength);
        const result = process_v1(sourceBytes, {
            protocolVersion: 1, requestId: 7, sourceVersion: 3, width: 128, height: 128,
            buildMode, heightLimit: heightLimit.blocks, heightLimitStyle: heightLimit.style, dithering, usePerceptual,
            hybridStrength: GOLDEN_HYBRID_STRENGTH, independentMaps,
            blockSupport: 'all', supportBlockId: 'minecraft:cobblestone', exportMode: 'sections',
            exportFormat: 'litematic', paletteVersion: 'golden-v1',
        }, candidates.map(candidate => ({
            colorId: candidate.colorID, blockId: candidate.blockId,
            rgb: [candidate.rgb.r, candidate.rgb.g, candidate.rgb.b],
            brightness: candidate.brightness === 'low' ? -1 : candidate.brightness === 'high' ? 1 : 0,
            needsSupport: candidate.needsSupport,
        })), []);
        try {
            expect([...result.rgba()]).toEqual([...expected.imageData.data]);
            expect([...result.packed_results()]).toEqual([...expected.packedResults]);
            expect(result.tone_map() ? [...result.tone_map()!] : null).toEqual(expected.toneMap ? [...expected.toneMap] : null);
            expect(result.height_path() ? [...result.height_path()!] : null).toEqual(expected.heightPath ? [...expected.heightPath] : null);
            expect([...result.height_map()]).toEqual([...expected.stats.heightMap]);
            expect(result.min_height).toBe(expected.stats.minHeight);
            expect(result.max_height).toBe(expected.stats.maxHeight);
        } finally {
            result.free();
        }
    });
});
