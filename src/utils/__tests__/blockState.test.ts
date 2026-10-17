import { describe, it, expect } from 'vitest';
import { canonicalBlockState, formatBlockState } from '../export';

describe('canonicalBlockState', () => {
    it('keeps plain ids without properties', () => {
        expect(canonicalBlockState('minecraft:stone')).toEqual({ name: 'minecraft:stone', properties: [] });
    });

    it('sorts properties by name', () => {
        const state = canonicalBlockState('minecraft:chest[waterlogged=false,facing=north,type=single]');
        expect(state.properties).toEqual([['facing', 'north'], ['type', 'single'], ['waterlogged', 'false']]);
        expect(formatBlockState(state)).toBe('minecraft:chest[facing=north,type=single,waterlogged=false]');
    });

    it('makes leaves persistent so they do not decay once pasted', () => {
        expect(formatBlockState(canonicalBlockState('minecraft:oak_leaves'))).toBe('minecraft:oak_leaves[persistent=true]');
        expect(formatBlockState(canonicalBlockState('minecraft:yellow_poplar_leaves')))
            .toBe('minecraft:yellow_poplar_leaves[persistent=true]');
    });

    it('keeps an explicit persistent value on leaves', () => {
        expect(canonicalBlockState('minecraft:oak_leaves[persistent=false]').properties).toEqual([['persistent', 'false']]);
    });

    it('ignores malformed property pairs', () => {
        expect(canonicalBlockState('minecraft:stone[=x,y=,ok=1]').properties).toEqual([['ok', '1']]);
    });
});
