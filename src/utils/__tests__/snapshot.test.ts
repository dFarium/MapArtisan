import { describe, expect, it } from 'vitest';
import {
    buildConstructionSnapshot,
    ConstructionSnapshotError,
    fnv1a64,
    resolveSnapshotSection,
    type BlockStatesBuffers,
    type ConstructionSections,
    type ConstructionSnapshot,
} from '../export';

const CONFIG: ConstructionSnapshot['config'] = {
    buildMode: '3d_valley',
    blockSupport: 'all',
    supportBlockId: 'minecraft:cobblestone',
    minecraftVersion: '26.3',
};

function bytes(text: string): Uint8Array {
    return new TextEncoder().encode(text);
}

function buffers(palette: string[], blocks: [number, number, number, number][]): BlockStatesBuffers {
    return {
        x: Int32Array.from(blocks, b => b[0]),
        y: Int32Array.from(blocks, b => b[1]),
        z: Int32Array.from(blocks, b => b[2]),
        palette,
        paletteIndices: Uint32Array.from(blocks, b => b[3]),
        count: blocks.length,
    };
}

function single(blocks: BlockStatesBuffers): ConstructionSections {
    return { multiFile: false, sections: [{ sX: 0, sY: 0, blocks }] };
}

const SECTION_0 = { x: 0, y: 0, mapsX: 1, mapsY: 1 };

function errorCode(action: () => unknown): string | undefined {
    try {
        action();
    } catch (e) {
        return e instanceof ConstructionSnapshotError ? e.code : `unexpected: ${String(e)}`;
    }
    return undefined;
}

describe('fnv1a64', () => {
    it('matches the reference FNV-1a 64-bit vectors', () => {
        expect(fnv1a64(bytes(''))).toBe('cbf29ce484222325');
        expect(fnv1a64(bytes('a'))).toBe('af63dc4c8601ec8c');
        expect(fnv1a64(bytes('foobar'))).toBe('85944171f73967e8');
    });

    it('hashes snapshot content like the connector mod', () => {
        // Same vector as MapartisanConnector's ContentHashTest.
        const snapshot = buildConstructionSnapshot(single(buffers(
            ['minecraft:stone', 'minecraft:oak_leaves'],
            [[0, 0, 0, 0], [1, 2, 3, 1], [127, 300, 128, 0]],
        )), SECTION_0, CONFIG);

        expect(snapshot.palette).toEqual(['minecraft:stone', 'minecraft:oak_leaves[persistent=true]']);
        expect(snapshot.contentHash).toBe('4647d62b64c2a609');
    });
});

describe('resolveSnapshotSection', () => {
    it('accepts Single File only for 1x1 maps', () => {
        expect(resolveSnapshotSection(128, 128, 'full', null)).toEqual(SECTION_0);
        expect(resolveSnapshotSection(64, 100, 'full', { x: 0, y: 0 })).toEqual(SECTION_0);
        expect(errorCode(() => resolveSnapshotSection(256, 128, 'full', null))).toBe('UNSUPPORTED_LAYOUT');
        expect(errorCode(() => resolveSnapshotSection(128, 129, 'full', null))).toBe('UNSUPPORTED_LAYOUT');
        expect(errorCode(() => resolveSnapshotSection(128, 128, 'full', { x: 1, y: 0 }))).toBe('SECTION_OUT_OF_RANGE');
    });

    it('accepts Multiple Files for any size with a section in range', () => {
        expect(resolveSnapshotSection(128, 128, 'sections', { x: 0, y: 0 })).toEqual(SECTION_0);
        expect(resolveSnapshotSection(384, 256, 'sections', { x: 2, y: 1 })).toEqual({ x: 2, y: 1, mapsX: 3, mapsY: 2 });
        expect(errorCode(() => resolveSnapshotSection(384, 256, 'sections', null))).toBe('SECTION_REQUIRED');
        expect(errorCode(() => resolveSnapshotSection(384, 256, 'sections', { x: 3, y: 0 }))).toBe('SECTION_OUT_OF_RANGE');
        expect(errorCode(() => resolveSnapshotSection(384, 256, 'sections', { x: -1, y: 0 }))).toBe('SECTION_OUT_OF_RANGE');
        expect(errorCode(() => resolveSnapshotSection(384, 256, 'sections', { x: 0.5, y: 0 }))).toBe('SECTION_OUT_OF_RANGE');
    });
});

describe('buildConstructionSnapshot', () => {
    it('keeps only the canonical states the section uses, in order of first use', () => {
        const blocks = buffers(
            ['minecraft:air', 'minecraft:cobblestone', 'minecraft:stone', 'minecraft:oak_leaves', 'minecraft:dirt'],
            [[0, 0, 0, 1], [0, 1, 1, 3], [1, 0, 1, 2]],
        );
        const snapshot = buildConstructionSnapshot(single(blocks), SECTION_0, CONFIG);

        expect(snapshot.palette).toEqual(['minecraft:cobblestone', 'minecraft:oak_leaves[persistent=true]', 'minecraft:stone']);
        expect(Array.from(snapshot.paletteIndices)).toEqual([0, 1, 2]);
        expect(snapshot.size).toEqual({ x: 2, y: 2, z: 2 });
        expect(snapshot.count).toBe(3);
        expect(snapshot.config).toBe(CONFIG);
    });

    it('keeps the last block written to a position, like the NBT writers', () => {
        const blocks = buffers(['minecraft:air', 'minecraft:stone', 'minecraft:dirt'], [[0, 0, 0, 1], [1, 0, 0, 1], [0, 0, 0, 2]]);
        const snapshot = buildConstructionSnapshot(single(blocks), SECTION_0, CONFIG);

        expect(snapshot.count).toBe(2);
        expect(Array.from(snapshot.x)).toEqual([1, 0]);
        expect(snapshot.palette[snapshot.paletteIndices[1]]).toBe('minecraft:dirt');
    });

    it('merges palette keys that canonicalize to the same state', () => {
        const blocks = buffers(['minecraft:oak_leaves', 'minecraft:oak_leaves[persistent=true]'], [[0, 0, 0, 0], [1, 0, 0, 1]]);
        const snapshot = buildConstructionSnapshot(single(blocks), SECTION_0, CONFIG);

        expect(snapshot.palette).toEqual(['minecraft:oak_leaves[persistent=true]']);
        expect(Array.from(snapshot.paletteIndices)).toEqual([0, 0]);
    });

    it('picks the requested section of a multi-file construction', () => {
        const construction: ConstructionSections = {
            multiFile: true,
            sections: [
                { sX: 0, sY: 0, blocks: buffers(['minecraft:stone'], [[0, 0, 0, 0]]) },
                { sX: 1, sY: 0, blocks: buffers(['minecraft:dirt'], [[5, 0, 3, 0]]) },
            ],
        };
        const snapshot = buildConstructionSnapshot(construction, { x: 1, y: 0, mapsX: 2, mapsY: 1 }, CONFIG);

        expect(snapshot.palette).toEqual(['minecraft:dirt']);
        expect(snapshot.section).toEqual({ x: 1, y: 0, mapsX: 2, mapsY: 1 });
        expect(errorCode(() => buildConstructionSnapshot(construction, { x: 0, y: 1, mapsX: 2, mapsY: 2 }, CONFIG)))
            .toBe('EMPTY_SECTION');
    });

    it('hashes content: equal for the same blocks, different for any block change', () => {
        const palette = ['minecraft:air', 'minecraft:stone', 'minecraft:dirt'];
        const base = buildConstructionSnapshot(single(buffers(palette, [[0, 0, 0, 1], [1, 2, 1, 2]])), SECTION_0, CONFIG);
        const same = buildConstructionSnapshot(
            single(buffers([...palette, 'minecraft:unused'], [[0, 0, 0, 1], [1, 2, 1, 2]])),
            { x: 0, y: 0, mapsX: 1, mapsY: 1 },
            { ...CONFIG, supportBlockId: 'minecraft:stone' },
        );
        const otherBlock = buildConstructionSnapshot(single(buffers(palette, [[0, 0, 0, 2], [1, 2, 1, 2]])), SECTION_0, CONFIG);
        const otherHeight = buildConstructionSnapshot(single(buffers(palette, [[0, 0, 0, 1], [1, 3, 1, 2]])), SECTION_0, CONFIG);
        const extraBlock = buildConstructionSnapshot(
            single(buffers(palette, [[0, 0, 0, 1], [1, 2, 1, 2], [1, 1, 1, 1]])), SECTION_0, CONFIG);

        expect(base.contentHash).toMatch(/^[0-9a-f]{16}$/);
        expect(same.contentHash).toBe(base.contentHash);
        expect(new Set([base, otherBlock, otherHeight, extraBlock].map(s => s.contentHash)).size).toBe(4);
    });
});
