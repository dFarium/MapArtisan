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
        resampling: 'sharp' as 'sharp' | 'smooth',
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

    describe('smooth resampling', () => {
        function setup(imageWidth: number, imageHeight: number) {
            class MockImage {
                static instance: MockImage;
                onload: (() => void) | null = null;
                width = imageWidth;
                height = imageHeight;
                complete = true;
                src = '';
                constructor() { MockImage.instance = this; }
            }
            vi.stubGlobal('Image', MockImage);

            const canvas = { width: 0, height: 0, toBlob: vi.fn(), getContext: () => context };
            const context = {
                filter: '',
                imageSmoothingEnabled: false,
                imageSmoothingQuality: 'low',
                drawImage: vi.fn(),
                // Decoded source: one-pixel black and white stripes.
                getImageData: vi.fn((_x: number, _y: number, width: number, height: number) => {
                    const data = new Uint8ClampedArray(width * height * 4);
                    for (let i = 0; i < width * height; i++) {
                        const value = (i % width) % 2 === 0 ? 0 : 255;
                        data.set([value, value, value, 255], i * 4);
                    }
                    return new ImageData(data, width, height);
                }),
            };
            const originalCreateElement = document.createElement.bind(document);
            vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) =>
                tagName === 'canvas' ? canvas as unknown as HTMLCanvasElement : originalCreateElement(tagName)
            ) as typeof document.createElement);
            return { MockImage, canvas, context };
        }

        it('decodes the source once and area-averages it in linear light', async () => {
            vi.useFakeTimers();
            const { MockImage, canvas, context } = setup(1024, 1024);
            const initialProps = { ...defaultProps, previewUrl: 'blob:source', resampling: 'smooth' as const, imageFitMode: 'crop' as const };
            const { rerender, unmount } = renderHook(
                (props: typeof initialProps) => useImagePreprocessing(props),
                { initialProps }
            );
            act(() => MockImage.instance.onload?.());

            for (let step = 0; step < 5; step++) {
                rerender({ ...initialProps, cropSettings: { ...initialProps.cropSettings, zoom: 1 + (4 - step) / 10 } });
                await act(async () => vi.advanceTimersByTimeAsync(100));
            }

            expect(context.drawImage).toHaveBeenCalledTimes(1);
            expect(context.getImageData).toHaveBeenCalledTimes(1);
            expect(context.getImageData).toHaveBeenCalledWith(0, 0, 1024, 1024);
            // The canvas backing store is released once the pixels are decoded.
            expect(canvas.width).toBe(0);
            const latest = mockPreviewState.setSourcePreviewImageData.mock.calls.at(-1)![0] as ImageData;
            expect(latest.width).toBe(128);
            expect([...latest.data.slice(0, 4)]).toEqual([188, 188, 188, 255]);
            unmount();
        });

        it('applies color filters without resampling again', async () => {
            vi.useFakeTimers();
            const { MockImage, context } = setup(512, 512);
            const initialProps = { ...defaultProps, previewUrl: 'blob:source', resampling: 'smooth' as const };
            const { rerender, unmount } = renderHook(
                (props: typeof initialProps) => useImagePreprocessing(props),
                { initialProps }
            );
            act(() => MockImage.instance.onload?.());
            await act(async () => vi.advanceTimersByTimeAsync(100));
            const first = mockPreviewState.setSourcePreviewImageData.mock.calls.at(-1)![0] as ImageData;

            rerender({ ...initialProps, imageSettings: { ...initialProps.imageSettings, brightness: 50 } });
            await act(async () => vi.advanceTimersByTimeAsync(100));
            rerender({ ...initialProps, imageSettings: { ...initialProps.imageSettings, brightness: 0 } });
            await act(async () => vi.advanceTimersByTimeAsync(100));

            const calls = mockPreviewState.setSourcePreviewImageData.mock.calls;
            const brighter = calls.at(-2)![0] as ImageData;
            const restored = calls.at(-1)![0] as ImageData;
            expect(context.drawImage).toHaveBeenCalledTimes(1);
            expect(brighter.data[0]).toBeGreaterThan(first.data[0]);
            // Filtering a copy leaves the cached resample untouched.
            expect([...restored.data]).toEqual([...first.data]);
            unmount();
        });

        it('bounds the memory of very large photos', async () => {
            vi.useFakeTimers();
            const { MockImage, context } = setup(8000, 6000);
            const initialProps = { ...defaultProps, previewUrl: 'blob:source', resampling: 'smooth' as const };
            const { unmount } = renderHook(() => useImagePreprocessing(initialProps));
            act(() => MockImage.instance.onload?.());
            await act(async () => vi.advanceTimersByTimeAsync(100));

            const [, , width, height] = context.getImageData.mock.calls[0];
            expect(width * height).toBeLessThanOrEqual(8 * 1024 * 1024);
            expect(width / height).toBeCloseTo(8000 / 6000, 2);
            expect(context.imageSmoothingEnabled).toBe(true);
            unmount();
        });
    });
});
