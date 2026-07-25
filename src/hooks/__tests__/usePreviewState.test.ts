import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { usePreviewState } from '../usePreviewState';

describe('usePreviewState', () => {
    it('initializes with empty ImageData and source version zero', () => {
        const { result } = renderHook(() => usePreviewState());

        expect(result.current.sourcePreviewImageData).toBeNull();
        expect(result.current.previewImageData).toBeNull();
        expect(result.current.sourceImageVersion).toBe(0);
    });

    it('stores source and processed ImageData independently', () => {
        const { result } = renderHook(() => usePreviewState());
        const source = new ImageData(new Uint8ClampedArray([1, 2, 3, 255]), 1, 1);
        const processed = new ImageData(new Uint8ClampedArray([4, 5, 6, 255]), 1, 1);

        act(() => {
            result.current.setSourcePreviewImageData(source);
            result.current.setPreviewImageData(processed);
        });

        expect(result.current.sourcePreviewImageData).toBe(source);
        expect(result.current.previewImageData).toBe(processed);
    });

    it('keeps the source version monotonic when clearing state', () => {
        const { result } = renderHook(() => usePreviewState());
        const image = new ImageData(new Uint8ClampedArray(4), 1, 1);

        act(() => {
            result.current.setSourcePreviewImageData(image);
            result.current.setPreviewImageData(image);
            result.current.incrementSourceImageVersion();
            result.current.clearAll();
        });

        expect(result.current.sourcePreviewImageData).toBeNull();
        expect(result.current.previewImageData).toBeNull();
        expect(result.current.sourceImageVersion).toBe(2);
    });
});
