import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { usePalettePresets } from '../usePalettePresets';

// Mock palette data
vi.mock('../../data/palette.json', () => ({
    default: {
        colors: [
            {
                colorID: 1,
                colorName: 'white',
                blocks: [{ id: 'minecraft:white_wool', needsSupport: false }, { id: 'minecraft:white_concrete', needsSupport: false }]
            },
            {
                colorID: 2,
                colorName: 'dirt',
                blocks: [{ id: 'minecraft:dirt', needsSupport: false }]
            },
            {
                colorID: 3,
                colorName: 'blue',
                blocks: [{ id: 'minecraft:blue_wool', needsSupport: false }]
            }
        ]
    }
}));

// Mock constants
vi.mock('../../data/constants', () => ({
    BASIC_COLORS: ['white', 'blue'],
    EASY_KEYWORDS: ['dirt']
}));

describe('usePalettePresets', () => {
    const setSelectedPaletteItems = vi.fn();
    const mockSelection = { 1: 'minecraft:white_wool', 2: null, 3: null };

    beforeEach(() => {
        vi.resetAllMocks();
        localStorage.clear();
    });

    it('should initialize with empty custom presets if localStorage is empty', () => {
        const { result } = renderHook(() => usePalettePresets(mockSelection, setSelectedPaletteItems));
        expect(result.current.customPresets).toEqual([]);
    });

    it('should save a new preset', () => {
        const { result } = renderHook(() => usePalettePresets(mockSelection, setSelectedPaletteItems));

        vi.spyOn(window, 'prompt').mockReturnValue('My Preset');

        act(() => {
            result.current.saveCurrentAsPreset();
        });

        expect(result.current.customPresets).toHaveLength(1);
        expect(result.current.customPresets[0].name).toBe('My Preset');
        expect(result.current.customPresets[0].selection).toEqual(mockSelection);
        expect(localStorage.getItem('mapart_custom_presets')).toContain('My Preset');
    });

    it('should delete a preset', () => {
        // Setup initial state with one preset
        localStorage.setItem('mapart_custom_presets', JSON.stringify([{ name: 'Test', selection: mockSelection }]));

        const { result } = renderHook(() => usePalettePresets(mockSelection, setSelectedPaletteItems));

        vi.spyOn(window, 'confirm').mockReturnValue(true);

        act(() => {
            result.current.deletePreset(0);
        });

        expect(result.current.customPresets).toHaveLength(0);
        expect(localStorage.getItem('mapart_custom_presets')).toBe('[]');
    });

    it('should apply "all" preset', () => {
        const { result } = renderHook(() => usePalettePresets(mockSelection, setSelectedPaletteItems));

        act(() => {
            result.current.applyPreset('all');
        });

        // Should select first block for all colors
        expect(setSelectedPaletteItems).toHaveBeenCalledWith({
            1: 'minecraft:white_wool',
            2: 'minecraft:dirt',
            3: 'minecraft:blue_wool'
        });
    });

    it('should apply "basic" preset', () => {
        const { result } = renderHook(() => usePalettePresets(mockSelection, setSelectedPaletteItems));

        act(() => {
            result.current.applyPreset('basic');
        });

        // Should select only basic colors (white, blue) and unselect dirt
        expect(setSelectedPaletteItems).toHaveBeenCalledWith({
            1: expect.stringMatching(/white/),
            2: null,
            3: expect.stringMatching(/blue/)
        });
    });

    it('should apply "custom" preset', () => {
        const { result } = renderHook(() => usePalettePresets(mockSelection, setSelectedPaletteItems));
        const customData = { 1: 'minecraft:white_concrete', 2: 'minecraft:dirt', 3: null };

        act(() => {
            result.current.applyPreset('custom', customData);
        });

        expect(setSelectedPaletteItems).toHaveBeenCalledWith(customData);
    });
});
