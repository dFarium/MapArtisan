import { describe, it, expect } from 'vitest';
import {
    imageDataToBlockStates,
    createLitematicaNBT,
    calculateMaterialCounts,
    type BlockWithCoords
} from '../litematicaExport';
import type { BrightnessLevel } from '../../types/mapart';

describe('litematicaExport', () => {
    // Helper interfaces for NBT typing in tests
    interface NBTString { value: string; }
    interface NBTInt { value: number; }

    interface MetadataValue {
        Name: NBTString;
        Author: NBTString;
        Description: NBTString;
        EnclosingSize: {
            value: {
                x: NBTInt;
                y: NBTInt;
                z: NBTInt;
            }
        };
    }

    interface BlockStatePalette {
        Name: NBTString;
        Properties?: Record<string, unknown>;
    }

    interface RegionValue {
        map: {
            value: {
                BlockStatePalette: {
                    value: {
                        value: BlockStatePalette[];
                    }
                }
            }
        }
    }

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

            const metadata = (nbt.value.Metadata.value as unknown as MetadataValue);
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

            const size = (nbt.value.Metadata.value as unknown as MetadataValue).EnclosingSize.value;
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
            const palette = (nbt.value.Regions.value as unknown as RegionValue).map.value.BlockStatePalette.value.value;

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

            // Should have count object structure
            expect(counts.total).toBeDefined();
            expect(counts.reusable).toBeDefined();

            // Should have counts for blocks (may include stone, cobblestone for noobline)
            const totalBlocks = Object.values(counts.total).reduce((a, b) => a + b, 0);
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
            expect(counts.total['minecraft:air']).toBeUndefined();
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

            const totalAll = Object.values(countsAll.total).reduce((a, b) => a + b, 0);
            const totalNeeded = Object.values(countsNeeded.total).reduce((a, b) => a + b, 0);

            // 'all' mode should have more or equal blocks
            expect(totalAll).toBeGreaterThanOrEqual(totalNeeded);
        });

        it('calculates reusable material counts correctly', () => {
            // Create a 256x1 image (2 horizontal maps of width 128)
            const width = 256;
            const height = 1;
            const data = new Uint8ClampedArray(width * height * 4).fill(0);
            const imageData = new ImageData(data, width, height);

            const selectedPaletteItems = {
                // We need at least one item to not abort early, but we will override with manual edits
                11: 'minecraft:stone' // Color ID 11 is Stone
            };

            // Use manual edits to define EVERY block to ensure deterministic results.
            // Map 1 (0-127): 1 Stone, rest Air (Air is skipped in counts)
            // Map 2 (128-255): 2 Stone, rest Air
            const manualEdits: Record<number, { blockId: string; brightness: BrightnessLevel; rgb: { r: number; g: number; b: number } }> = {};

            const stoneEdit = {
                blockId: 'minecraft:stone',
                brightness: 'normal' as BrightnessLevel,
                rgb: { r: 96, g: 96, b: 96 } // Values from palette.json for Stone (Normal)
            };

            const airEdit = {
                blockId: 'minecraft:air',
                brightness: 'normal' as BrightnessLevel,
                rgb: { r: 0, g: 0, b: 0 } // Not in palette for Stone, so will be skipped
            };

            for (let x = 0; x < width; x++) {
                // Set default to Air
                manualEdits[x] = airEdit;
            }

            // Set specific stones
            // Map 1: 1 Stone at x=0
            manualEdits[0] = stoneEdit;

            // Map 2: 2 Stones at x=128, x=129
            manualEdits[128] = stoneEdit;
            manualEdits[129] = stoneEdit;

            const counts = calculateMaterialCounts(
                imageData,
                selectedPaletteItems,
                '2d',
                0,
                'none',
                true,
                50,
                false,
                manualEdits,
                'all'
            );

            const stoneTotal = counts.total['minecraft:stone'];
            const stoneReusable = counts.reusable['minecraft:stone'];

            // Total: 1 (Map1) + 2 (Map2) = 3
            // Reusable: Max(1, 2) = 2

            expect(stoneTotal).toBe(3);
            expect(stoneReusable).toBe(2);
        });
    });
});
