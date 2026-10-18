import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { usePalettePresets } from '../usePalettePresets';
import { BASIC_WOOL_BLOCKS } from '../../data/presetConstants';
import { SUPPORTED_VERSIONS } from '../../data/supportedVersions';

/**
 * Presets against the real palette.json, without mocks: the Basic preset broke once when the
 * palette's color names changed and the mocked tests kept passing.
 */
describe('palette presets with the real palette', () => {
    it.each(SUPPORTED_VERSIONS.map(v => v.value))('Basic selects the 16 wool blocks and nothing else in %s', (version) => {
        const setSelection = vi.fn();
        const { result } = renderHook(() => usePalettePresets({}, setSelection, version));

        act(() => {
            result.current.applyPreset('basic');
        });

        const selection: Record<number, string | null> = setSelection.mock.calls[0][0];
        const selected = Object.values(selection).filter((id): id is string => id !== null);
        expect(selected.sort()).toEqual([...BASIC_WOOL_BLOCKS].sort());
    });
});
