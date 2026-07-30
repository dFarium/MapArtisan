import { describe, expect, it, vi } from 'vitest';

vi.mock('comlink', () => ({
    expose: vi.fn(),
    transfer: vi.fn((value) => value),
}));

import { PROCESSING_PROTOCOL_VERSION } from '../../engine';
import { mapartWorkerApi } from '../mapart.worker';

describe('mapart.worker processing contract', () => {
    it('processes and transfers a versioned request through the worker API', () => {
        mapartWorkerApi.clearCache();
        const rgba = new Uint8ClampedArray([32, 64, 96, 255]);
        const config = {
            width: 1,
            height: 1,
            buildMode: '2d' as const,
            selectedPaletteItems: { 1: 'minecraft:stone' },
            threeDPrecision: 50,
            dithering: 'none' as const,
            usePerceptual: false,
            hybridStrength: 50,
            independentMaps: false,
            blockSupport: 'all' as const,
            supportBlockId: 'minecraft:cobblestone',
            exportMode: 'sections' as const,
            exportFormat: 'litematic' as const,
            paletteVersion: 'test-v1',
        };

        const response = mapartWorkerApi.processV1({
            protocolVersion: PROCESSING_PROTOCOL_VERSION,
            requestId: 10,
            sourceVersion: 4,
            config,
            source: { width: 1, height: 1, rgba: rgba.buffer.slice(0) },
            manualEdits: {},
        });

        expect(response.status).toBe('completed');
        expect(response.requestId).toBe(10);
        expect(response.sourceVersion).toBe(4);
        expect(response.buffers.rgba.byteLength).toBe(4);
        expect(response.buffers.packedResults.byteLength).toBe(4);
        expect(response.stats.heightMap.byteLength).toBe(4);
    });

    it('uses the cached v1 base for manual edits', () => {
        const response = mapartWorkerApi.applyEditsV1({
            protocolVersion: PROCESSING_PROTOCOL_VERSION,
            requestId: 11,
            sourceVersion: 4,
            config: {
                width: 1,
                height: 1,
                buildMode: '2d',
                selectedPaletteItems: { 1: 'minecraft:stone' },
                threeDPrecision: 50,
                dithering: 'none',
                usePerceptual: false,
                hybridStrength: 50,
                independentMaps: false,
                blockSupport: 'all' as const,
                supportBlockId: 'minecraft:cobblestone',
                exportMode: 'sections' as const,
                exportFormat: 'litematic' as const,
                paletteVersion: 'test-v1',
            },
            manualEdits: {},
        });

        expect(response.status).toBe('completed');
        expect(response.requestId).toBe(11);
    });
});
