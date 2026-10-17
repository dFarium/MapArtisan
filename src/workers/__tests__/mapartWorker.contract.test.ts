import { describe, expect, it, vi } from 'vitest';

vi.mock('comlink', () => ({
    expose: vi.fn(),
    transfer: vi.fn((value) => value),
}));

import { PROCESSING_PROTOCOL_VERSION } from '../../engine';
import { mapartWorkerApi } from '../mapart.worker';

describe('mapart.worker processing contract', () => {
    it('processes and transfers a versioned request through the worker API', async () => {
        mapartWorkerApi.clearCache();
        const rgba = new Uint8ClampedArray([32, 64, 96, 255]);
        const config = {
            width: 1,
            height: 1,
            buildMode: '2d' as const,
            selectedPaletteItems: { 1: 'minecraft:stone' },
            heightLimit: 0,
            heightLimitStyle: 'balanced' as const,
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

        const response = await mapartWorkerApi.processV1({
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

        const materials = mapartWorkerApi.calculateMaterialCountsV1({
            protocolVersion: PROCESSING_PROTOCOL_VERSION,
            requestId: 12,
            sourceVersion: 4,
            config,
            source: null,
            manualEdits: {},
        });
        expect(materials.status).toBe('completed');
        expect(materials.counts.total).toBeDefined();
    });

    it('uses the cached v1 base for manual edits', async () => {
        const response = await mapartWorkerApi.applyEditsV1({
            protocolVersion: PROCESSING_PROTOCOL_VERSION,
            requestId: 11,
            sourceVersion: 4,
            config: {
                width: 1,
                height: 1,
                buildMode: '2d',
                selectedPaletteItems: { 1: 'minecraft:stone' },
                heightLimit: 0,
            heightLimitStyle: 'balanced' as const,
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

    it('generates an export through the versioned worker contract', async () => {
        mapartWorkerApi.clearCache();
        const config = {
            width: 1,
            height: 1,
            buildMode: '2d' as const,
            selectedPaletteItems: { 1: 'minecraft:stone' },
            heightLimit: 0,
            heightLimitStyle: 'balanced' as const,
            dithering: 'none' as const,
            usePerceptual: false,
            hybridStrength: 50,
            independentMaps: false,
            blockSupport: 'all' as const,
            supportBlockId: 'minecraft:cobblestone',
            exportMode: 'sections' as const,
            exportFormat: 'litematic' as const,
            paletteVersion: '1.21.5',
        };
        await mapartWorkerApi.processV1({
            protocolVersion: PROCESSING_PROTOCOL_VERSION,
            requestId: 20,
            sourceVersion: 1,
            config,
            source: { width: 1, height: 1, rgba: new Uint8Array([50, 50, 50, 255]).buffer },
            manualEdits: {},
        });

        const result = await mapartWorkerApi.generateMapartExportV1({
            protocolVersion: PROCESSING_PROTOCOL_VERSION,
            requestId: 21,
            sourceVersion: 1,
            config,
            source: null,
            manualEdits: {},
            filename: 'contract-test',
            metadata: {},
        });
        expect(result.status).toBe('completed');
        expect(result.blob).toBeInstanceOf(Blob);
        expect(result.filename).toContain('contract-test');
    });

    it('generates a construction snapshot through the versioned worker contract', async () => {
        mapartWorkerApi.clearCache();
        const config = {
            width: 1,
            height: 1,
            buildMode: '2d' as const,
            selectedPaletteItems: { 1: 'minecraft:stone' },
            heightLimit: 0,
            heightLimitStyle: 'balanced' as const,
            dithering: 'none' as const,
            usePerceptual: false,
            hybridStrength: 50,
            independentMaps: false,
            blockSupport: 'all' as const,
            supportBlockId: 'minecraft:cobblestone',
            exportMode: 'full' as const,
            exportFormat: 'litematic' as const,
            paletteVersion: '26.3',
        };
        const request = {
            protocolVersion: PROCESSING_PROTOCOL_VERSION,
            requestId: 30,
            sourceVersion: 1,
            config,
            source: { width: 1, height: 1, rgba: new Uint8Array([50, 50, 50, 255]).buffer },
            manualEdits: {},
            section: null,
        };

        const result = await mapartWorkerApi.generateConstructionSnapshotV1(request);
        if (result.status !== 'completed') throw new Error(`rejected: ${result.message}`);
        const { snapshot } = result;

        expect(result.requestId).toBe(30);
        // Noobline at z = 0 plus the single pixel at z = 1.
        expect(snapshot.count).toBe(2);
        expect(snapshot.x.buffer.byteLength).toBe(snapshot.count * 4);
        expect(snapshot.paletteIndices.buffer.byteLength).toBe(snapshot.count * 4);
        expect(snapshot.palette).toContain('minecraft:cobblestone');
        expect(snapshot.section).toEqual({ x: 0, y: 0, mapsX: 1, mapsY: 1 });
        expect(snapshot.config.minecraftVersion).toBe('26.3');
        expect(snapshot.contentHash).toMatch(/^[0-9a-f]{16}$/);

        // Rejected before processing, so no source or cached result is needed.
        const rejected = await mapartWorkerApi.generateConstructionSnapshotV1({
            ...request,
            requestId: 31,
            config: { ...config, width: 200 },
            source: null,
        });
        expect(rejected).toMatchObject({ status: 'rejected', requestId: 31, code: 'UNSUPPORTED_LAYOUT' });
    });
});
