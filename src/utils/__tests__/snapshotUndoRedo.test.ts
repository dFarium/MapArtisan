import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('comlink', () => ({
    expose: vi.fn(),
    transfer: vi.fn((value) => value),
}));

import { PROCESSING_PROTOCOL_VERSION, type ImageBufferV1, type ProcessingConfigV1 } from '../../engine';
import { mapartWorkerApi } from '../../workers/mapart.worker';
import { useMapartStore } from '../../store/useMapartStore';
import type { ManualEdit } from '../../types/mapart';

/**
 * Acceptance criterion 3 (docs/litematica-live-preview-spec.md, section 11): undo and redo
 * through the editor history converge to the same construction, so the connector sends
 * nothing new when the game already holds it.
 */

const CONFIG: ProcessingConfigV1 = {
    width: 128,
    height: 128,
    buildMode: '3d_valley',
    selectedPaletteItems: { 1: 'minecraft:grass_block', 7: 'minecraft:oak_leaves', 11: 'minecraft:gravel' },
    heightLimit: 0,
    heightLimitStyle: 'balanced',
    dithering: 'floyd-steinberg',
    usePerceptual: true,
    hybridStrength: 50,
    independentMaps: false,
    blockSupport: 'all',
    supportBlockId: 'minecraft:cobblestone',
    exportMode: 'full',
    exportFormat: 'litematic',
    paletteVersion: '26.3',
};

function image(): ImageBufferV1 {
    const rgba = new Uint8ClampedArray(128 * 128 * 4);
    for (let i = 0; i < 128 * 128; i++) {
        const shade = 0.8 + 0.3 * Math.sin(i / 97);
        rgba.set([109 * shade, 153 * shade, 48 * shade, 255], i * 4);
    }
    return { width: 128, height: 128, rgba: rgba.buffer };
}

function stroke(row: number, blockId: string, brightness: ManualEdit['brightness']): Record<number, ManualEdit> {
    const edits: Record<number, ManualEdit> = {};
    for (let x = 10; x < 40; x++) edits[row * 128 + x] = { blockId, brightness, rgb: { r: 0, g: 124, b: 0 } };
    return edits;
}

async function hash(): Promise<string> {
    const source = image();
    const response = await mapartWorkerApi.generateConstructionSnapshotV1({
        protocolVersion: PROCESSING_PROTOCOL_VERSION,
        requestId: 1,
        sourceVersion: 1,
        config: CONFIG,
        source,
        manualEdits: useMapartStore.getState().manualEdits,
        section: null,
    });
    if (response.status !== 'completed') throw new Error(response.message);
    return response.snapshot.contentHash;
}

describe('construction snapshots across undo and redo', () => {
    beforeEach(() => {
        mapartWorkerApi.clearCache();
        useMapartStore.setState({ manualEdits: {}, history: [], historyIndex: 0 });
    });

    it('return to the same content hash at every step of the history', { timeout: 60_000 }, async () => {
        const { applyStroke, undo, redo } = useMapartStore.getState();
        const original = await hash();

        applyStroke(stroke(20, 'minecraft:oak_leaves', 'high'));
        const first = await hash();
        applyStroke(stroke(60, 'minecraft:gravel', 'low'));
        const second = await hash();
        expect(new Set([original, first, second]).size).toBe(3);

        undo();
        expect(await hash()).toBe(first);
        undo();
        expect(await hash()).toBe(original);
        redo();
        expect(await hash()).toBe(first);
        redo();
        expect(await hash()).toBe(second);

        // A new stroke after undo drops the redo branch; undoing it lands on the same state again.
        undo();
        applyStroke(stroke(90, 'minecraft:oak_leaves', 'low'));
        expect(await hash()).not.toBe(second);
        undo();
        expect(await hash()).toBe(first);
    });
});
