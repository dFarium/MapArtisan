import { describe, expect, it, vi } from 'vitest';

vi.mock('comlink', () => ({
    expose: vi.fn(),
    transfer: vi.fn((value) => value),
}));

import JSZip from 'jszip';
import { PROCESSING_PROTOCOL_VERSION, type ImageBufferV1, type ProcessingConfigV1 } from '../../engine';
import { mapartWorkerApi } from '../../workers/mapart.worker';
import type { ManualEdit } from '../../types/mapart';
import type { ConstructionSnapshot } from '../export';
import { litematicBlocks, vanillaBlocks } from './nbtTestReader';

/**
 * Stage 2 acceptance (docs/litematica-live-preview-spec.md, section 12.1): for the same
 * worker request, every exported file decodes to exactly the blocks of the snapshot of
 * its section.
 */

const PALETTE = {
    1: 'minecraft:grass_block',
    7: 'minecraft:oak_leaves',
    8: 'minecraft:white_concrete_powder',
    11: 'minecraft:gravel',
    13: 'minecraft:oak_planks',
};

// Grass, plant, snow, stone and wood map colors, so every palette entry gets used.
const TARGETS = [[109, 153, 48], [0, 124, 0], [255, 255, 255], [112, 112, 112], [143, 119, 72]];

const BASE_CONFIG: Omit<ProcessingConfigV1, 'width' | 'height'> = {
    buildMode: '3d_valley',
    selectedPaletteItems: PALETTE,
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

interface Case {
    name: string;
    width: number;
    height: number;
    config: Partial<ProcessingConfigV1>;
    edits?: Record<number, ManualEdit>;
}

function edit(blockId: string, brightness: ManualEdit['brightness']): ManualEdit {
    return { blockId, brightness, rgb: { r: 0, g: 124, b: 0 } };
}

const CASES: Case[] = [
    { name: '1x1 single file, 3D, full support', width: 128, height: 128, config: {} },
    {
        name: '1x1 multiple files, independent, 3D, gravity support',
        width: 128, height: 128,
        config: { exportMode: 'sections', independentMaps: true, blockSupport: 'gravity' },
    },
    { name: '1x1 single file, 2D, vanilla nbt', width: 128, height: 128, config: { buildMode: '2d', exportFormat: 'nbt' } },
    {
        name: '1x1 single file, height limit and manual edits',
        width: 128, height: 128,
        config: { heightLimit: 6, heightLimitStyle: 'lines' },
        edits: { [5 * 128 + 5]: edit('minecraft:oak_leaves', 'high'), [90 * 128 + 40]: edit('minecraft:gravel', 'low') },
    },
    { name: '2x2 multiple files, global, 3D', width: 256, height: 256, config: { exportMode: 'sections' } },
    {
        name: '2x2 multiple files, independent, no support',
        width: 256, height: 256,
        config: { exportMode: 'sections', independentMaps: true, blockSupport: 'needed' },
    },
    {
        name: '2x1 multiple files, independent, gravity support, vanilla nbt, manual edits',
        width: 256, height: 128,
        config: { exportMode: 'sections', independentMaps: true, blockSupport: 'gravity', exportFormat: 'nbt' },
        edits: {
            [10 * 256 + 10]: edit('minecraft:oak_leaves', 'low'),
            [127 * 256 + 200]: edit('minecraft:white_concrete_powder', 'high'),
        },
    },
];

function image(width: number, height: number): ImageBufferV1 {
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const target = TARGETS[Math.floor((x + 2 * y) / 23) % TARGETS.length];
            const shade = 0.75 + 0.35 * Math.sin(x / 7) * Math.cos(y / 11);
            rgba[i] = Math.min(255, target[0] * shade);
            rgba[i + 1] = Math.min(255, target[1] * shade);
            rgba[i + 2] = Math.min(255, target[2] * shade);
            rgba[i + 3] = 255;
        }
    }
    return { width, height, rgba: rgba.buffer };
}

function snapshotBlocks(snapshot: ConstructionSnapshot): Map<string, string> {
    const blocks = new Map<string, string>();
    for (let i = 0; i < snapshot.count; i++) {
        blocks.set(`${snapshot.x[i]},${snapshot.y[i]},${snapshot.z[i]}`, snapshot.palette[snapshot.paletteIndices[i]]);
    }
    return blocks;
}

/** Up to five differences, readable in a failure message. */
function differences(expected: Map<string, string>, actual: Map<string, string>): string[] {
    const found: string[] = [];
    for (const key of new Set([...expected.keys(), ...actual.keys()])) {
        if (expected.get(key) !== actual.get(key)) {
            found.push(`${key}: exported ${expected.get(key) ?? 'air'}, snapshot ${actual.get(key) ?? 'air'}`);
            if (found.length === 5) break;
        }
    }
    return found;
}

interface ExportedFile {
    blocks: Map<string, string>;
    size?: [number, number, number];
}

/** Decodes the export of a request into its files, keyed by "sX,sY". */
async function exportedFiles(config: ProcessingConfigV1, source: ImageBufferV1, edits: Record<number, ManualEdit>) {
    const result = await mapartWorkerApi.generateMapartExportV1({
        protocolVersion: PROCESSING_PROTOCOL_VERSION,
        requestId: 1,
        sourceVersion: 1,
        config,
        source,
        manualEdits: edits,
        filename: 'equivalence',
        metadata: {},
    });
    const decode = (bytes: Uint8Array): ExportedFile =>
        config.exportFormat === 'nbt' ? { blocks: vanillaBlocks(bytes) } : litematicBlocks(bytes);
    const bytes = new Uint8Array(await result.blob.arrayBuffer());
    const files = new Map<string, ExportedFile>();

    if (!result.filename.endsWith('.zip')) {
        files.set('0,0', decode(bytes));
        return files;
    }
    const zip = await JSZip.loadAsync(bytes);
    for (const name of Object.keys(zip.files)) {
        const match = /_(\d+)_(\d+)\.(litematic|nbt)$/.exec(name);
        if (!match) throw new Error(`Unexpected file in export: ${name}`);
        files.set(`${match[1]},${match[2]}`, decode(await zip.files[name].async('uint8array')));
    }
    return files;
}

describe('construction snapshot equivalence with exports', () => {
    it.each(CASES)('$name', { timeout: 60_000 }, async ({ width, height, config: overrides, edits = {} }) => {
        mapartWorkerApi.clearCache();
        const config: ProcessingConfigV1 = { ...BASE_CONFIG, ...overrides, width, height };
        const source = image(width, height);
        const files = await exportedFiles(config, { ...source, rgba: source.rgba.slice(0) }, edits);

        const mapsX = Math.ceil(width / 128);
        const mapsY = Math.ceil(height / 128);
        expect(files.size).toBe(mapsX * mapsY);

        for (const [key, file] of files) {
            const [x, y] = key.split(',').map(Number);
            const response = await mapartWorkerApi.generateConstructionSnapshotV1({
                protocolVersion: PROCESSING_PROTOCOL_VERSION,
                requestId: 2,
                sourceVersion: 1,
                config,
                source: { ...source, rgba: source.rgba.slice(0) },
                manualEdits: edits,
                section: config.exportMode === 'full' ? null : { x, y },
            });
            if (response.status !== 'completed') throw new Error(`section ${key} rejected: ${response.message}`);
            const { snapshot } = response;

            expect(file.blocks.size, `section ${key} has blocks`).toBeGreaterThan(0);
            expect(differences(file.blocks, snapshotBlocks(snapshot)), `section ${key}`).toEqual([]);
            expect(snapshot.count, `section ${key} block count`).toBe(file.blocks.size);
            if (file.size) {
                expect([snapshot.size.x, snapshot.size.y, snapshot.size.z], `section ${key} size`).toEqual(file.size);
            }
        }
    });

    it('exports every palette entry, including persistent leaves, in the 2x2 fixture', async () => {
        mapartWorkerApi.clearCache();
        const config: ProcessingConfigV1 = { ...BASE_CONFIG, exportMode: 'sections', width: 256, height: 256 };
        const files = await exportedFiles(config, image(256, 256), {});
        const states = new Set([...files.values()].flatMap(file => [...file.blocks.values()]));

        expect(states).toContain('minecraft:oak_leaves[persistent=true]');
        expect(states).not.toContain('minecraft:oak_leaves');
        for (const blockId of Object.values(PALETTE).filter(id => !id.endsWith('_leaves'))) {
            expect(states).toContain(blockId);
        }
    }, 60_000);
});
