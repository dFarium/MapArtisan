import { describe, it, expect, vi, beforeEach } from 'vitest';
import { unpackTone } from '../../utils/processing';
import { PROCESSING_PROTOCOL_VERSION, type ProcessingConfigV1 } from '../../engine';
import type { ManualEdit } from '../../types/mapart';

// Mock comlink to avoid side effects during import
vi.mock('comlink', () => ({
    expose: vi.fn(),
    wrap: vi.fn(),
    transfer: vi.fn((obj) => obj), // Passthrough
}));

// Import the worker API AFTER mocking
import { mapartWorkerApi } from '../mapart.worker';

function makeConfig(overrides: Partial<ProcessingConfigV1> = {}): ProcessingConfigV1 {
    return {
        width: 128,
        height: 128,
        buildMode: '3d_valley',
        selectedPaletteItems: { 1: 'minecraft:stone', 2: 'minecraft:dirt' },
        heightLimit: 0,
        heightLimitStyle: 'balanced',
        dithering: 'floyd-steinberg',
        usePerceptual: true,
        hybridStrength: 50,
        independentMaps: false,
        blockSupport: 'all',
        supportBlockId: 'minecraft:cobblestone',
        exportMode: 'sections',
        exportFormat: 'litematic',
        paletteVersion: '1.21.5',
        ...overrides,
    };
}

/** Config for tiny flat images with a single candidate block. */
function flatConfig(width: number, height: number, blockId = 'minecraft:stone'): ProcessingConfigV1 {
    return makeConfig({ width, height, buildMode: '2d', selectedPaletteItems: { 4: blockId }, dithering: 'none' });
}

function solidImage(width: number, height: number, value = 128): ArrayBuffer {
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
        pixels[i * 4] = value;
        pixels[i * 4 + 1] = value;
        pixels[i * 4 + 2] = value;
        pixels[i * 4 + 3] = 255;
    }
    return pixels.buffer;
}

function process(config: ProcessingConfigV1, rgba: ArrayBuffer, sourceVersion = 1) {
    return mapartWorkerApi.processV1({
        protocolVersion: PROCESSING_PROTOCOL_VERSION,
        requestId: 1,
        sourceVersion,
        config,
        source: { width: config.width, height: config.height, rgba },
        manualEdits: {},
    });
}

function applyEdits(config: ProcessingConfigV1, sourceVersion: number, manualEdits: Record<number, ManualEdit>) {
    return mapartWorkerApi.applyEditsV1({
        protocolVersion: PROCESSING_PROTOCOL_VERSION,
        requestId: 2,
        sourceVersion,
        config,
        manualEdits,
    });
}

describe('mapart.worker idempotency', () => {
    beforeEach(() => {
        mapartWorkerApi.clearCache();
    });

    it('should produce identical results for the same input', async () => {
        const config = makeConfig();
        const buffer = new Uint8ClampedArray(config.width * config.height * 4);
        for (let i = 0; i < config.width * config.height; i++) {
            buffer[i * 4] = i % 255;
            buffer[i * 4 + 1] = 100;
            buffer[i * 4 + 2] = 200;
            buffer[i * 4 + 3] = 255;
        }

        const result1 = await process(config, buffer.buffer.slice(0), 1);
        mapartWorkerApi.clearCache();
        const result2 = await process(config, buffer.buffer.slice(0), 1);

        expect(result1.stats.minHeight).toBe(result2.stats.minHeight);
        expect(result1.stats.maxHeight).toBe(result2.stats.maxHeight);
        expect(new Int32Array(result1.stats.heightMap)).toEqual(new Int32Array(result2.stats.heightMap));
        expect(new Uint32Array(result1.buffers.packedResults)).toEqual(new Uint32Array(result2.buffers.packedResults));
    });

    it('keeps the base tone map immutable when an edit is removed', async () => {
        const config = makeConfig({
            width: 1,
            height: 4,
            selectedPaletteItems: { 4: 'minecraft:stone' },
            heightLimit: 0,
            dithering: 'none',
        });

        const base = await process(config, solidImage(1, 4), 99);
        const baseTone = unpackTone(new Uint32Array(base.buffers.packedResults)[0]);
        const editedBrightness = baseTone === 1 ? 'low' : 'high';

        await applyEdits(config, 99, {
            0: {
                blockId: 'minecraft:stone',
                brightness: editedBrightness,
                rgb: { r: 128, g: 128, b: 128 },
            },
        });
        const reverted = await applyEdits(config, 99, {});

        expect(reverted.stats.minHeight).toBe(base.stats.minHeight);
        expect(reverted.stats.maxHeight).toBe(base.stats.maxHeight);
        expect(new Int32Array(reverted.stats.heightMap)).toEqual(new Int32Array(base.stats.heightMap));
        expect(reverted.buffers.heightPath && new Int32Array(reverted.buffers.heightPath))
            .toEqual(base.buffers.heightPath && new Int32Array(base.buffers.heightPath));
        expect(unpackTone(new Uint32Array(reverted.buffers.packedResults)[0])).toBe(baseTone);
    });

    it('releases the cached base when clearCache is requested', async () => {
        const config = flatConfig(1, 1);
        await process(config, solidImage(1, 1), 123);

        mapartWorkerApi.clearCache();

        await expect(applyEdits(config, 123, {})).rejects.toThrow(/base result/i);
    });
});

describe('mapart.worker block picker', () => {
    beforeEach(() => {
        mapartWorkerApi.clearCache();
    });

    it('returns null before anything was processed', () => {
        expect(mapartWorkerApi.getBlockAt(0, 0, {})).toBeNull();
    });

    it('reads the quantized base block from the latest v1 result', async () => {
        await process(flatConfig(2, 2), solidImage(2, 2));

        expect(mapartWorkerApi.getBlockAt(1, 1, {})).toMatchObject({
            blockId: 'minecraft:stone',
            brightness: 'normal',
        });
    });

    it('follows the palette of the most recent result', async () => {
        await process(flatConfig(2, 2, 'minecraft:stone'), solidImage(2, 2));
        await process(flatConfig(2, 2, 'minecraft:dirt'), solidImage(2, 2));

        expect(mapartWorkerApi.getBlockAt(0, 0, {})?.blockId).toBe('minecraft:dirt');
    });

    it('prefers manual edits and rejects out-of-range coordinates', async () => {
        await process(flatConfig(2, 2), solidImage(2, 2));
        const edit: ManualEdit = { blockId: 'minecraft:glass', brightness: 'high', rgb: { r: 1, g: 2, b: 3 } };

        expect(mapartWorkerApi.getBlockAt(1, 0, { 1: edit })).toEqual(edit);
        expect(mapartWorkerApi.getBlockAt(2, 0, {})).toBeNull();
        expect(mapartWorkerApi.getBlockAt(0, -1, {})).toBeNull();
    });

    it('forgets the picked result after clearCache', async () => {
        await process(flatConfig(1, 1), solidImage(1, 1));

        mapartWorkerApi.clearCache();

        expect(mapartWorkerApi.getBlockAt(0, 0, {})).toBeNull();
    });
});
