import { describe, it, expect } from 'vitest';
import { createLitematicaNBT, createVanillaNBT } from '../export/nbtBuilder';

describe('nbtBuilder', () => {
    it('should generate valid Vanilla NBT structure', () => {
        const blockStates = [
            { x: 0, y: 0, z: 0, blockId: 'minecraft:stone' },
            { x: 1, y: 0, z: 0, blockId: 'minecraft:dirt' },
        ];

        const nbt = createVanillaNBT(blockStates);

        expect(nbt.name).toBe('');
        // Check size
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const size = nbt.value.size.value as any;
        expect(size.value).toEqual([2, 1, 1]);

        // Check palette
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const palette = nbt.value.palette.value as any;
        expect(palette.value.length).toBe(3);
        expect(palette.value[0].Name.value).toBe('minecraft:air');
        expect(palette.value[1].Name.value).toBe('minecraft:stone');
        expect(palette.value[2].Name.value).toBe('minecraft:dirt');

        // Check blocks
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const blocks = nbt.value.blocks.value as any;
        expect(blocks.value.length).toBe(2);
        expect(blocks.value[0].state.value).toBe(1);
        expect(blocks.value[0].pos.value.value).toEqual([0, 0, 0]);
        expect(blocks.value[1].state.value).toBe(2);
        expect(blocks.value[1].pos.value.value).toEqual([1, 0, 0]);
    });
    it('should generate valid NBT structure', () => {
        const blockStates = [
            { x: 0, y: 0, z: 0, blockId: 'minecraft:stone' },
            { x: 1, y: 0, z: 0, blockId: 'minecraft:dirt' },
        ];

        const nbt = createLitematicaNBT(blockStates);

        expect(nbt.name).toBe('');
        // Check Metadata
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const metadata = nbt.value.Metadata.value as any;
        expect(metadata.TotalBlocks.value).toBe(2);

        // Check Regions
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const regions = nbt.value.Regions.value as any;
        const mapRegion = regions.map.value;
        expect(mapRegion.BlockStatePalette.value.value.length).toBeGreaterThan(0);
    });

    it('benchmark', () => {
        const size = 100;
        const blockStates = [];
        for (let x = 0; x < size; x++) {
            for (let z = 0; z < size; z++) {
                blockStates.push({
                    x, y: 0, z,
                    blockId: (x + z) % 2 === 0 ? 'minecraft:stone' : 'minecraft:dirt'
                });
            }
        }

        const start = performance.now();
        createLitematicaNBT(blockStates);
        const end = performance.now();
        console.log(`NBT Builder (Legacy) Time: ${(end - start).toFixed(2)}ms for ${blockStates.length} blocks`);
    });
});
