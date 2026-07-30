import { describe, expect, it } from 'vitest';
import manifestJson from '../../utils/__tests__/fixtures/processing-goldens.json';
import {
    GOLDEN_HYBRID_STRENGTH,
    GOLDEN_PALETTE,
    GOLDEN_THREE_D_PRECISION,
    createGoldenConfigs,
    hashGoldenView,
    makeGoldenManualEdits,
    makeGoldenSource,
    type GoldenManifest,
} from '../../utils/__tests__/goldenFixtures';
import { processMapart } from '../../utils/processing';
import {
    PROCESSING_PROTOCOL_VERSION,
    ProcessingEngineError,
    TypeScriptEngine,
    createProcessingConfigKey,
    type ProcessingConfigV1,
} from '../index';

const manifest = manifestJson as unknown as GoldenManifest;

function configFor(config: ReturnType<typeof createGoldenConfigs>[number], width: number, height: number): ProcessingConfigV1 {
    return {
        width,
        height,
        buildMode: config.buildMode,
        selectedPaletteItems: GOLDEN_PALETTE,
        threeDPrecision: GOLDEN_THREE_D_PRECISION,
        dithering: config.dithering,
        usePerceptual: config.usePerceptual,
        hybridStrength: GOLDEN_HYBRID_STRENGTH,
        independentMaps: config.independentMaps,
        blockSupport: 'all',
        supportBlockId: 'minecraft:cobblestone',
        exportMode: 'sections',
        exportFormat: 'litematic',
        paletteVersion: 'golden-v1',
    };
}

describe('TypeScriptEngine protocol facade', () => {
    it('invalidates the cache key for every operational export parameter', () => {
        const base = configFor(createGoldenConfigs()[0], 128, 128);
        const fields = [
            ['blockSupport', { blockSupport: 'needed' as const }],
            ['supportBlockId', { supportBlockId: 'minecraft:glass' }],
            ['exportMode', { exportMode: 'full' as const }],
            ['exportFormat', { exportFormat: 'nbt' as const }],
            ['paletteVersion', { paletteVersion: 'golden-v2' }],
        ] as const;

        for (const [field, change] of fields) {
            expect(createProcessingConfigKey(1, base), field).not.toBe(
                createProcessingConfigKey(1, { ...base, ...change }),
            );
        }
    });

    it('matches every programmatically generated golden case', () => {
        const engine = new TypeScriptEngine();

        for (const goldenCase of manifest.cases) {
            const { config } = goldenCase;
            const width = config.gridX * 128;
            const height = config.gridY * 128;
            const source = makeGoldenSource(width, height);
            const base = processMapart(
                source,
                config.buildMode,
                GOLDEN_PALETTE,
                GOLDEN_THREE_D_PRECISION,
                config.dithering,
                config.usePerceptual,
                GOLDEN_HYBRID_STRENGTH,
                config.independentMaps,
            );
            const manualEdits = config.withEdits ? makeGoldenManualEdits(width, height, base.candidates) : {};
            const response = engine.process({
                protocolVersion: PROCESSING_PROTOCOL_VERSION,
                requestId: 1,
                sourceVersion: 1,
                config: configFor(config, width, height),
                source: { width, height, rgba: source.data.buffer.slice(0) },
                manualEdits,
            });
            const expected = goldenCase.expected;

            expect(hashGoldenView(new Uint8Array(response.buffers.rgba)), goldenCase.id).toBe(expected.processedRgba);
            expect(hashGoldenView(new Uint32Array(response.buffers.packedResults)), goldenCase.id).toBe(expected.packedResults);
            expect(hashGoldenView(response.buffers.toneMap ? new Int8Array(response.buffers.toneMap) : null), goldenCase.id).toBe(expected.toneMap);
            expect(hashGoldenView(response.buffers.heightPath ? new Int32Array(response.buffers.heightPath) : null), goldenCase.id).toBe(expected.heightPath);
            expect(hashGoldenView(new Int32Array(response.stats.heightMap)), goldenCase.id).toBe(expected.heightMap);
            expect(response.stats.minHeight, goldenCase.id).toBe(expected.minHeight);
            expect(response.stats.maxHeight, goldenCase.id).toBe(expected.maxHeight);
            expect(response.width).toBe(width);
            expect(response.height).toBe(height);
        }
    }, 120_000);

    it('applies manual edits from the cached base result', () => {
        const goldenCase = manifest.cases.find(item => item.id.includes('__2d__none__rgb__edits__continuous'))!;
        const config = goldenCase.config;
        const width = config.gridX * 128;
        const height = config.gridY * 128;
        const source = makeGoldenSource(width, height);
        const base = processMapart(source, config.buildMode, GOLDEN_PALETTE, GOLDEN_THREE_D_PRECISION, config.dithering, config.usePerceptual, GOLDEN_HYBRID_STRENGTH, config.independentMaps);
        const requestConfig = configFor(config, width, height);
        const engine = new TypeScriptEngine();
        engine.process({ protocolVersion: 1, requestId: 1, sourceVersion: 7, config: requestConfig, source: { width, height, rgba: source.data.buffer.slice(0) }, manualEdits: {} });
        const response = engine.applyEdits({ protocolVersion: 1, requestId: 2, sourceVersion: 7, config: requestConfig, manualEdits: makeGoldenManualEdits(width, height, base.candidates) });

        expect(hashGoldenView(new Uint8Array(response.buffers.rgba))).toBe(goldenCase.expected.processedRgba);
        expect(response.requestId).toBe(2);
        expect(response.sourceVersion).toBe(7);
    });

    it('rejects invalid protocol, missing source and cache misses', () => {
        const engine = new TypeScriptEngine();
        const config: ProcessingConfigV1 = { width: 1, height: 1, buildMode: '2d', selectedPaletteItems: GOLDEN_PALETTE, threeDPrecision: 1, dithering: 'none', usePerceptual: false, hybridStrength: 0, independentMaps: false, blockSupport: 'all', supportBlockId: 'minecraft:cobblestone', exportMode: 'sections', exportFormat: 'litematic', paletteVersion: 'golden-v1' };
        expect(() => engine.process({ protocolVersion: 99 as 1, requestId: 1, sourceVersion: 1, config, source: null, manualEdits: {} })).toThrowError(ProcessingEngineError);
        expect(() => engine.process({ protocolVersion: 1, requestId: 1, sourceVersion: 1, config, source: null, manualEdits: {} })).toThrowError(/source image/i);
        expect(() => engine.applyEdits({ protocolVersion: 1, requestId: 1, sourceVersion: 1, config, manualEdits: {} })).toThrowError(/matching base/i);
    });
});
