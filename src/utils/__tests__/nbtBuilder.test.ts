import { describe, it, expect } from 'vitest';
import { createLitematicaNBT } from '../export/nbtBuilder';

describe('nbtBuilder', () => {
    it('should generate valid NBT structure', () => {
        const blockStates = [
            { x: 0, y: 0, z: 0, blockId: 'minecraft:stone' },
            { x: 1, y: 0, z: 0, blockId: 'minecraft:dirt' },
        ];

        const nbt = createLitematicaNBT(blockStates);

        expect(nbt.name).toBe('');
        // Check Metadata
        const metadata = nbt.value.Metadata.value as any;
        expect(metadata.TotalBlocks.value).toBe(2);

        // Check Regions
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
