import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useMapartFields, useMapartStore } from '../useMapartStore';

describe('useMapartFields', () => {
    beforeEach(() => {
        useMapartStore.setState({ manualEdits: {}, history: [], historyIndex: 0, heightLimit: 0 });
    });

    it('returns the requested fields', () => {
        const { result } = renderHook(() => useMapartFields('heightLimit', 'setHeightLimit'));
        expect(result.current.heightLimit).toBe(0);
        act(() => result.current.setHeightLimit(12));
        expect(result.current.heightLimit).toBe(12);
    });

    it('ignores changes to fields it did not request', () => {
        let renders = 0;
        renderHook(() => {
            renders++;
            return useMapartFields('heightLimit');
        });
        const before = renders;

        act(() => useMapartStore.getState().applyStroke({
            0: { blockId: 'minecraft:stone', brightness: 'normal', rgb: { r: 1, g: 2, b: 3 } },
        }));
        expect(renders).toBe(before);

        act(() => useMapartStore.getState().setHeightLimit(5));
        expect(renders).toBe(before + 1);
    });
});
