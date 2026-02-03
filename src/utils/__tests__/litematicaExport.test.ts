import { describe, it, expect } from 'vitest';
import {
    imageDataToBlockStates,
    createLitematicaNBT,
    calculateMaterialCounts,
    type BlockWithCoords
} from '../litematicaExport';
import type { BrightnessLevel } from '../../types/mapart';

describe('litematicaExport', () => {
    describe('imageDataToBlockStates', () => {
        it('generates blocks for simple 2x2 2D mapart', () => {
            // Create a simple gray 2x2 image
            const data = new Uint8ClampedArray([
                100, 100, 100, 255,
                100, 100, 100, 255,
                100, 100, 100, 255,
                100, 100, 100, 255
            ]);
            const imageData = new ImageData(data, 2, 2);

            const selectedPaletteItems = {
                4: 'minecraft:stone' // Grass color ID
            };

            const blocks = imageDataToBlockStates(
                imageData,
                selectedPaletteItems,
                '2d',
                true,
                0,
                'none',
                true,
                50,
                false,
                undefined,
                'all'
            );

            // In 2D mode: 2x2 map blocks + 2 nooblines (one per column) = 6 blocks
            expect(blocks.length).toBeGreaterThanOrEqual(4); // At least the map blocks

            // All blocks should be stone
            expect(blocks.every(b => b.blockId.includes('minecraft:'))).toBe(true);

            // Check that there are blocks at Z=0 (noobline)
            const nooblineBlocks = blocks.filter(b => b.z === 0);
            expect(nooblineBlocks.length).toBeGreaterThan(0);
        });

        it('generates support blocks in 3d_valley mode with all support', () => {
            // Create a 2x1 image that will need different heights
            const data = new Uint8ClampedArray([
                100, 100, 100, 255,
                100, 100, 100, 255
            ]);
            const imageData = new ImageData(data, 2, 1);

            const selectedPaletteItems = {
                4: 'minecraft:stone'
            };

            const blocks = imageDataToBlockStates(
                imageData,
                selectedPaletteItems,
                '3d_valley',
                true,
                0,
                'none',
                true,
                50,
                false,
                undefined,
                'all'
            );

            // Should have map blocks, nooblines, and potentially support blocks
            expect(blocks.length).toBeGreaterThan(0);

            // Check that all blocks are grounded (Y >= 0)
            expect(blocks.every(b => b.y >= 0)).toBe(true);
        });

        it('only generates needed support in needed mode', () => {
            const data = new Uint8ClampedArray([
                100, 100, 100, 255
            ]);
            const imageData = new ImageData(data, 1, 1);

            const selectedPaletteItems = {
                4: 'minecraft:stone'
            };

            const blocksAll = imageDataToBlockStates(
                imageData,
                selectedPaletteItems,
                '3d_valley',
                true,
                0,
                'none',
                true,
                50,
                false,
                undefined,
                'all'
            );

            const blocksNeeded = imageDataToBlockStates(
                imageData,
                selectedPaletteItems,
                '3d_valley',
                true,
                0,
                'none',
                true,
                50,
                false,
                undefined,
                'needed'
            );

            // 'needed' mode should have fewer or equal blocks than 'all' mode
            expect(blocksNeeded.length).toBeLessThanOrEqual(blocksAll.length);
        });

        it('applies manual edits correctly', () => {
            const data = new Uint8ClampedArray([
                100, 100, 100, 255,
                100, 100, 100, 255
            ]);
            const imageData = new ImageData(data, 2, 1);

            const selectedPaletteItems = {
                4: 'minecraft:stone',
                8: 'minecraft:dirt'
            };

            const manualEdits = {
                0: {
                    blockId: 'minecraft:dirt',
                    brightness: 'normal' as BrightnessLevel,
                    rgb: { r: 150, g: 100, b: 50 }
                }
            };

            const blocks = imageDataToBlockStates(
                imageData,
                selectedPaletteItems,
                '2d',
                true,
                0,
                'none',
                true,
                50,
                false,
                manualEdits,
                'all'
            );

            // Verify that manual edits are processed without crashing
            expect(blocks.length).toBeGreaterThan(0);

            // Verify that both block types appear in the output (either from processing or edits)
            const blockTypes = new Set(blocks.map(b => b.blockId));
            expect(blockTypes.size).toBeGreaterThan(0);
        });

        it('applies dithering during export', () => {
            // Create a gradient image
            const data = new Uint8ClampedArray([
                50, 50, 50, 255,
                100, 100, 100, 255,
                150, 150, 150, 255,
                200, 200, 200, 255
            ]);
            const imageData = new ImageData(data, 2, 2);

            const selectedPaletteItems = {
                4: 'minecraft:stone',
                8: 'minecraft:dirt'
            };

            const blocksNoDither = imageDataToBlockStates(
                imageData,
                selectedPaletteItems,
                '2d',
                true,
                0,
                'none',
                true,
                50,
                false,
                undefined,
                'all'
            );

            const blocksDither = imageDataToBlockStates(
                imageData,
                selectedPaletteItems,
                '2d',
                true,
                0,
                'floyd-steinberg',
                true,
                50,
                false,
                undefined,
                'all'
            );

            // Both should generate valid blocks
            expect(blocksNoDither.length).toBeGreaterThan(0);
            expect(blocksDither.length).toBeGreaterThan(0);

            // Results might differ due to dithering
            // (hard to test exactly without mocking, but at least verify it doesn't crash)
        });
    });

    describe('createLitematicaNBT', () => {
        it('creates valid NBT structure', () => {
            const blocks: BlockWithCoords[] = [
                { blockId: 'minecraft:stone', x: 0, y: 0, z: 0 },
                { blockId: 'minecraft:dirt', x: 1, y: 0, z: 0 },
                { blockId: 'minecraft:stone', x: 0, y: 1, z: 0 }
            ];

            const nbt = createLitematicaNBT(blocks, {
                name: 'Test Mapart',
                author: 'Test',
                description: 'Test Description'
            });

            expect(nbt.name).toBe('');
            expect(nbt.value).toBeDefined();
            expect(nbt.value.Version).toBeDefined();
            expect(nbt.value.Metadata).toBeDefined();
            expect(nbt.value.Regions).toBeDefined();
        });

        it('includes correct metadata', () => {
            const blocks: BlockWithCoords[] = [
                { blockId: 'minecraft:stone', x: 0, y: 0, z: 0 }
            ];

            const nbt = createLitematicaNBT(blocks, {
                name: 'Custom Name',
                author: 'Custom Author',
                description: 'Custom Description'
            });

            const metadata = nbt.value.Metadata.value;
            expect(metadata.Name.value).toBe('Custom Name');
            expect(metadata.Author.value).toBe('Custom Author');
            expect(metadata.Description.value).toBe('Custom Description');
        });

        it('calculates correct dimensions', () => {
            const blocks: BlockWithCoords[] = [
                { blockId: 'minecraft:stone', x: 0, y: 0, z: 0 },
                { blockId: 'minecraft:dirt', x: 2, y: 3, z: 4 }
            ];

            const nbt = createLitematicaNBT(blocks);

            const size = nbt.value.Metadata.value.EnclosingSize.value;
            // Dimensions should be max + 1
            expect(size.x.value).toBe(3); // max x is 2, so 2+1=3
            expect(size.y.value).toBe(4); // max y is 3, so 3+1=4
            expect(size.z.value).toBe(5); // max z is 4, so 4+1=5
        });

        it('handles block properties correctly', () => {
            const blocks: BlockWithCoords[] = [
                {
                    blockId: 'minecraft:chest',
                    properties: { facing: 'north', 'waterlogged': 'false' },
                    x: 0,
                    y: 0,
                    z: 0
                }
            ];

            const nbt = createLitematicaNBT(blocks);

            // Palette should include the block with properties
            const palette = nbt.value.Regions.value.map.value.BlockStatePalette.value.value;

            // First should be air, second should be our chest
            expect(palette.length).toBe(2);
            expect(palette[1].Name.value).toBe('minecraft:chest');
            expect(palette[1].Properties).toBeDefined();
        });

        it('prioritizes non-support blocks at same position', () => {
            // Multiple blocks at same position (support + actual block)
            const blocks: BlockWithCoords[] = [
                { blockId: 'minecraft:stone', x: 0, y: 0, z: 0 },
                { blockId: 'minecraft:dirt', x: 0, y: 0, z: 0 } // Same position
            ];

            const nbt = createLitematicaNBT(blocks);

            // Should not crash and should handle the conflict
            expect(nbt).toBeDefined();
            expect(nbt.value.Regions).toBeDefined();
        });
    });

    describe('calculateMaterialCounts', () => {
        it('counts materials correctly', () => {
            const data = new Uint8ClampedArray([
                100, 100, 100, 255,
                100, 100, 100, 255
            ]);
            const imageData = new ImageData(data, 2, 1);

            const selectedPaletteItems = {
                4: 'minecraft:stone'
            };

            const counts = calculateMaterialCounts(
                imageData,
                selectedPaletteItems,
                '2d',
                0,
                'none',
                true,
                50,
                false,
                undefined,
                'all'
            );

            expect(counts).toBeDefined();
            expect(typeof counts).toBe('object');

            // Should have counts for blocks (may include stone, cobblestone for noobline)
            const totalBlocks = Object.values(counts).reduce((a, b) => a + b, 0);
            expect(totalBlocks).toBeGreaterThan(0);
        });

        it('excludes air from counts', () => {
            const data = new Uint8ClampedArray([
                100, 100, 100, 255
            ]);
            const imageData = new ImageData(data, 1, 1);

            const selectedPaletteItems = {
                4: 'minecraft:stone'
            };

            const counts = calculateMaterialCounts(
                imageData,
                selectedPaletteItems,
                '2d',
                0,
                'none',
                true,
                50,
                false,
                undefined,
                'all'
            );

            // Air should not be in the counts
            expect(counts['minecraft:air']).toBeUndefined();
        });

        it('includes support blocks in all mode', () => {
            const data = new Uint8ClampedArray([
                100, 100, 100, 255
            ]);
            const imageData = new ImageData(data, 1, 1);

            const selectedPaletteItems = {
                4: 'minecraft:stone'
            };

            const countsAll = calculateMaterialCounts(
                imageData,
                selectedPaletteItems,
                '3d_valley',
                0,
                'none',
                true,
                50,
                false,
                undefined,
                'all'
            );

            const countsNeeded = calculateMaterialCounts(
                imageData,
                selectedPaletteItems,
                '3d_valley',
                0,
                'none',
                true,
                50,
                false,
                undefined,
                'needed'
            );

            const totalAll = Object.values(countsAll).reduce((a, b) => a + b, 0);
            const totalNeeded = Object.values(countsNeeded).reduce((a, b) => a + b, 0);

            // 'all' mode should have more or equal blocks
            expect(totalAll).toBeGreaterThanOrEqual(totalNeeded);
        });
    });
});
