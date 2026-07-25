import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useImagePreprocessing } from '../useImagePreprocessing';

describe('useImagePreprocessing', () => {
    const mockPreviewState = {
        setSourcePreviewImageData: vi.fn(),
        incrementSourceImageVersion: vi.fn(),
    };
    const defaultProps = {
        previewUrl: null,
        mapartResolution: { width: 128, height: 128 },
        imageFitMode: 'adjust' as const,
        cropSettings: { zoom: 1, offsetX: 0, offsetY: 0 },
        imageSettings: { brightness: 0, contrast: 0, saturation: 100 },
        previewState: mockPreviewState,
    };

    beforeEach(() => vi.clearAllMocks());
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('initializes and returns a mutable source ref', () => {
        const { result } = renderHook(() => useImagePreprocessing(defaultProps));
        expect(result.current.sourceImageDataRef.current).toBeNull();
        expect(Object.keys(result.current).sort()).toEqual(['sourceImageDataRef']);
    });

    it('decodes once, coalesces a burst and performs zero PNG encodings', async () => {
        vi.useFakeTimers();
        class MockImage {
            static instances: MockImage[] = [];
            onload: (() => void) | null = null;
            width = 2048;
            height = 2048;
            complete = true;
            src = '';
            constructor() { MockImage.instances.push(this); }
        }
        vi.stubGlobal('Image', MockImage);

        const toBlob = vi.fn();
        const context = {
            filter: '',
            imageSmoothingEnabled: true,
            drawImage: vi.fn(),
            getImageData: vi.fn((_x: number, _y: number, width: number, height: number) =>
                new ImageData(new Uint8ClampedArray(width * height * 4), width, height)
            ),
        };
        let canvasCreations = 0;
        const originalCreateElement = document.createElement.bind(document);
        vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
            if (tagName === 'canvas') {
                canvasCreations++;
                return { width: 0, height: 0, toBlob, getContext: () => context } as unknown as HTMLCanvasElement;
            }
            return originalCreateElement(tagName);
        }) as typeof document.createElement);

        const initialProps = { ...defaultProps, previewUrl: 'blob:source' };
        const { rerender, unmount } = renderHook(
            (props: typeof initialProps) => useImagePreprocessing(props),
            { initialProps }
        );
        act(() => MockImage.instances[0].onload?.());

        for (let value = 1; value <= 50; value++) {
            rerender({
                ...initialProps,
                imageSettings: { ...initialProps.imageSettings, brightness: value },
            });
        }
        await act(async () => vi.advanceTimersByTimeAsync(1000));

        expect(MockImage.instances).toHaveLength(1);
        expect(canvasCreations).toBe(1);
        expect(toBlob).not.toHaveBeenCalled();
        expect(context.drawImage).toHaveBeenCalledTimes(1);
        expect(context.filter).toBe('none');
        expect(mockPreviewState.setSourcePreviewImageData).toHaveBeenCalledTimes(1);
        expect(mockPreviewState.incrementSourceImageVersion).toHaveBeenCalledTimes(1);

        unmount();
    });

    it('reuses the same canvas across stabilized crop updates', async () => {
        vi.useFakeTimers();
        class MockImage {
            static instance: MockImage;
            onload: (() => void) | null = null;
            width = 2048;
            height = 2048;
            complete = true;
            src = '';
            constructor() { MockImage.instance = this; }
        }
        vi.stubGlobal('Image', MockImage);

        const context = {
            filter: '',
            imageSmoothingEnabled: true,
            drawImage: vi.fn(),
            getImageData: vi.fn((_x: number, _y: number, width: number, height: number) =>
                new ImageData(new Uint8ClampedArray(width * height * 4), width, height)
            ),
        };
        let canvasCreations = 0;
        const originalCreateElement = document.createElement.bind(document);
        vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
            if (tagName === 'canvas') {
                canvasCreations++;
                return { width: 0, height: 0, toBlob: vi.fn(), getContext: () => context } as unknown as HTMLCanvasElement;
            }
            return originalCreateElement(tagName);
        }) as typeof document.createElement);

        const initialProps = { ...defaultProps, previewUrl: 'blob:source', imageFitMode: 'crop' as const };
        const { rerender, unmount } = renderHook(
            (props: typeof initialProps) => useImagePreprocessing(props),
            { initialProps }
        );
        act(() => MockImage.instance.onload?.());

        for (let step = 0; step < 25; step++) {
            rerender({
                ...initialProps,
                cropSettings: { ...initialProps.cropSettings, zoom: 1 + step / 100 },
            });
            await act(async () => vi.advanceTimersByTimeAsync(100));
        }

        expect(canvasCreations).toBe(1);
        expect(context.drawImage).toHaveBeenCalledTimes(25);
        expect(mockPreviewState.setSourcePreviewImageData).toHaveBeenCalledTimes(25);
        unmount();
    });
});
