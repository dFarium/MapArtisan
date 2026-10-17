import type { ConstructionSnapshot } from '../../utils/export';

/** A snapshot with the given [x, y, z, paletteIndex] blocks; the hash is a placeholder. */
export function testSnapshot(blocks: [number, number, number, number][], palette = ['minecraft:stone']): ConstructionSnapshot {
    return {
        section: { x: 1, y: 0, mapsX: 2, mapsY: 1 },
        size: {
            x: Math.max(...blocks.map(b => b[0])) + 1,
            y: Math.max(...blocks.map(b => b[1])) + 1,
            z: Math.max(...blocks.map(b => b[2])) + 1,
        },
        palette,
        x: Int32Array.from(blocks, b => b[0]),
        y: Int32Array.from(blocks, b => b[1]),
        z: Int32Array.from(blocks, b => b[2]),
        paletteIndices: Uint32Array.from(blocks, b => b[3]),
        count: blocks.length,
        config: { buildMode: '3d_valley', blockSupport: 'all', supportBlockId: 'minecraft:cobblestone', minecraftVersion: '26.3' },
        contentHash: '0123456789abcdef',
    };
}
