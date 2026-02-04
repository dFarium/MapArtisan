import { describe, it, expect } from 'vitest';
import {
    isVersionLessOrEqual,
    isBlockAvailable,
    filterBlocksByVersion,
    filterPaletteByVersion,
    checkPresetCompatibility,
    applyReplacements,
} from '../filterPaletteByVersion';
import type { PaletteColor } from '../../types/palette';

describe('filterPaletteByVersion', () => {
    describe('isVersionLessOrEqual', () => {
        it('returns true for equal versions', () => {
            expect(isVersionLessOrEqual('1.16.0', '1.16.0')).toBe(true);
            expect(isVersionLessOrEqual('1.21.4', '1.21.4')).toBe(true);
        });

        it('returns true when first version is less', () => {
            expect(isVersionLessOrEqual('1.16.0', '1.17.0')).toBe(true);
            expect(isVersionLessOrEqual('1.16.0', '1.21.4')).toBe(true);
            expect(isVersionLessOrEqual('1.20.0', '1.21.0')).toBe(true);
        });

        it('returns false when first version is greater', () => {
            expect(isVersionLessOrEqual('1.21.4', '1.16.0')).toBe(false);
            expect(isVersionLessOrEqual('1.17.0', '1.16.0')).toBe(false);
            expect(isVersionLessOrEqual('1.21.0', '1.20.0')).toBe(false);
        });

        it('handles different version lengths', () => {
            expect(isVersionLessOrEqual('1.16', '1.16.0')).toBe(true);
            expect(isVersionLessOrEqual('1.16.0', '1.16')).toBe(true);
        });
    });

    describe('isBlockAvailable', () => {
        it('returns true for blocks introduced at or before target version', () => {
            expect(isBlockAvailable('1.16.0', '1.21.5')).toBe(true);
            expect(isBlockAvailable('1.17.0', '1.17.0')).toBe(true);
            expect(isBlockAvailable('1.0.0', '1.16.0')).toBe(true);
        });

        it('returns false for blocks introduced after target version', () => {
            expect(isBlockAvailable('1.21.4', '1.16.0')).toBe(false);
            expect(isBlockAvailable('1.20.0', '1.19.0')).toBe(false);
        });

        it('treats undefined introducedIn as 1.0.0', () => {
            expect(isBlockAvailable(undefined, '1.16.0')).toBe(true);
            expect(isBlockAvailable(undefined, '1.0.0')).toBe(true);
        });
    });

    describe('filterBlocksByVersion', () => {
        const blocks = [
            { id: 'minecraft:stone', introducedIn: '1.0.0' },
            { id: 'minecraft:deepslate', introducedIn: '1.17.0' },
            { id: 'minecraft:cherry_planks', introducedIn: '1.20.0' },
            { id: 'minecraft:pale_oak_planks', introducedIn: '1.21.4' },
        ];

        it('filters blocks by version', () => {
            const result = filterBlocksByVersion(blocks, '1.17.0');
            expect(result).toHaveLength(2);
            expect(result.map(b => b.id)).toEqual(['minecraft:stone', 'minecraft:deepslate']);
        });

        it('returns all blocks for latest version', () => {
            const result = filterBlocksByVersion(blocks, '1.21.5');
            expect(result).toHaveLength(4);
        });

        it('returns only legacy blocks for 1.0.0', () => {
            const result = filterBlocksByVersion(blocks, '1.0.0');
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('minecraft:stone');
        });
    });

    describe('filterPaletteByVersion', () => {
        const colors: PaletteColor[] = [
            {
                colorID: 1,
                colorName: 'grass',
                brightnessValues: {
                    lowest: { r: 0, g: 0, b: 0 },
                    low: { r: 0, g: 0, b: 0 },
                    normal: { r: 0, g: 128, b: 0 },
                    high: { r: 0, g: 255, b: 0 },
                },
                blocks: [
                    { id: 'minecraft:grass_block', needsSupport: false, introducedIn: '1.0.0' },
                    { id: 'minecraft:moss_block', needsSupport: false, introducedIn: '1.17.0' },
                ],
            },
            {
                colorID: 2,
                colorName: 'cherry',
                brightnessValues: {
                    lowest: { r: 0, g: 0, b: 0 },
                    low: { r: 0, g: 0, b: 0 },
                    normal: { r: 255, g: 182, b: 193 },
                    high: { r: 255, g: 200, b: 210 },
                },
                blocks: [
                    { id: 'minecraft:cherry_planks', needsSupport: false, introducedIn: '1.20.0' },
                ],
            },
        ];

        it('filters colors and their blocks by version', () => {
            const result = filterPaletteByVersion(colors, '1.17.0');
            expect(result).toHaveLength(1); // Only grass color has blocks
            expect(result[0].blocks).toHaveLength(2);
        });

        it('excludes colors with no available blocks', () => {
            const result = filterPaletteByVersion(colors, '1.16.0');
            expect(result).toHaveLength(1);
            expect(result[0].colorName).toBe('grass');
        });
    });

    describe('checkPresetCompatibility', () => {
        const colors: PaletteColor[] = [
            {
                colorID: 1,
                colorName: 'green',
                brightnessValues: {
                    lowest: { r: 0, g: 0, b: 0 },
                    low: { r: 0, g: 0, b: 0 },
                    normal: { r: 0, g: 128, b: 0 },
                    high: { r: 0, g: 255, b: 0 },
                },
                blocks: [
                    { id: 'minecraft:oak_planks', needsSupport: false, introducedIn: '1.0.0' },
                    { id: 'minecraft:cherry_planks', needsSupport: false, introducedIn: '1.20.0' },
                ],
            },
        ];

        it('returns empty array when all blocks are available', () => {
            const selection = { 1: 'minecraft:oak_planks' };
            const result = checkPresetCompatibility(selection, colors, '1.16.0');
            expect(result).toHaveLength(0);
        });

        it('returns replacements for unavailable blocks', () => {
            const selection = { 1: 'minecraft:cherry_planks' };
            const result = checkPresetCompatibility(selection, colors, '1.16.0');
            expect(result).toHaveLength(1);
            expect(result[0].original).toBe('minecraft:cherry_planks');
            expect(result[0].replacement).toBe('minecraft:oak_planks');
        });
    });

    describe('applyReplacements', () => {
        it('applies replacements to selection', () => {
            const selection = { 1: 'minecraft:cherry_planks', 2: 'minecraft:stone' };
            const replacements = [
                { colorId: 1, colorName: 'green', original: 'minecraft:cherry_planks', replacement: 'minecraft:oak_planks', originalVersion: '1.20.0' },
            ];
            const result = applyReplacements(selection, replacements);
            expect(result[1]).toBe('minecraft:oak_planks');
            expect(result[2]).toBe('minecraft:stone');
        });
    });
});
