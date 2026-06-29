import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePreviewState } from '../usePreviewState';

describe('usePreviewState', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('initialization', () => {
        it('returns null URLs and ImageData initially', () => {
            const { result } = renderHook(() => usePreviewState());
            
            expect(result.current.scaledPreviewUrl).toBeNull();
            expect(result.current.originalTransformedUrl).toBeNull();
            expect(result.current.previewImageData).toBeNull();
        });

        it('returns sourceImageVersion starting at 0', () => {
            const { result } = renderHook(() => usePreviewState());
            expect(result.current.sourceImageVersion).toBe(0);
        });
    });

    describe('setScaledPreviewUrl', () => {
        it('updates scaledPreviewUrl', () => {
            const { result } = renderHook(() => usePreviewState());
            
            act(() => {
                result.current.setScaledPreviewUrl('data:image/png;base64,test');
            });
            
            expect(result.current.scaledPreviewUrl).toBe('data:image/png;base64,test');
        });
    });

    describe('setOriginalTransformedUrl', () => {
        it('updates originalTransformedUrl', () => {
            const { result } = renderHook(() => usePreviewState());
            
            act(() => {
                result.current.setOriginalTransformedUrl('data:image/jpeg;base64,test');
            });
            
            expect(result.current.originalTransformedUrl).toBe('data:image/jpeg;base64,test');
        });
    });

    describe('setPreviewImageData', () => {
        it('updates previewImageData', () => {
            const { result } = renderHook(() => usePreviewState());
            const imageData = new ImageData(new Uint8ClampedArray([255, 0, 0, 255]), 1, 1);
            
            act(() => {
                result.current.setPreviewImageData(imageData);
            });
            
            expect(result.current.previewImageData).toBe(imageData);
        });
    });

    describe('incrementSourceImageVersion', () => {
        it('increments sourceImageVersion', () => {
            const { result } = renderHook(() => usePreviewState());
            
            act(() => {
                result.current.incrementSourceImageVersion();
            });
            
            expect(result.current.sourceImageVersion).toBe(1);
            
            act(() => {
                result.current.incrementSourceImageVersion();
            });
            
            expect(result.current.sourceImageVersion).toBe(2);
        });
    });

    describe('clearAll', () => {
        it('resets all state to initial values', () => {
            const { result } = renderHook(() => usePreviewState());
            const imageData = new ImageData(new Uint8ClampedArray([255, 0, 0, 255]), 1, 1);
            
            act(() => {
                result.current.setScaledPreviewUrl('data:image/png;base64,test');
                result.current.setOriginalTransformedUrl('data:image/jpeg;base64,test');
                result.current.setPreviewImageData(imageData);
                result.current.incrementSourceImageVersion();
            });
            
            act(() => {
                result.current.clearAll();
            });
            
            expect(result.current.scaledPreviewUrl).toBeNull();
            expect(result.current.originalTransformedUrl).toBeNull();
            expect(result.current.previewImageData).toBeNull();
            expect(result.current.sourceImageVersion).toBe(0);
        });
    });

    describe('clearUrls', () => {
        it('clears only URLs, keeping ImageData and version', () => {
            const { result } = renderHook(() => usePreviewState());
            const imageData = new ImageData(new Uint8ClampedArray([255, 0, 0, 255]), 1, 1);
            
            act(() => {
                result.current.setScaledPreviewUrl('data:image/png;base64,test');
                result.current.setOriginalTransformedUrl('data:image/jpeg;base64,test');
                result.current.setPreviewImageData(imageData);
                result.current.incrementSourceImageVersion();
            });
            
            act(() => {
                result.current.clearUrls();
            });
            
            expect(result.current.scaledPreviewUrl).toBeNull();
            expect(result.current.originalTransformedUrl).toBeNull();
            expect(result.current.previewImageData).toBe(imageData);
            expect(result.current.sourceImageVersion).toBe(1);
        });
    });

    describe('snapshot regression', () => {
        it('produces consistent state structure', () => {
            const { result } = renderHook(() => usePreviewState());
            const imageData = new ImageData(new Uint8ClampedArray([255, 0, 0, 255]), 1, 1);
            
            act(() => {
                result.current.setScaledPreviewUrl('data:image/png;base64,test');
                result.current.setOriginalTransformedUrl('data:image/jpeg;base64,test');
                result.current.setPreviewImageData(imageData);
                result.current.incrementSourceImageVersion();
            });
            
            expect({
                scaledPreviewUrl: result.current.scaledPreviewUrl,
                originalTransformedUrl: result.current.originalTransformedUrl,
                previewImageData: result.current.previewImageData ? {
                    width: result.current.previewImageData.width,
                    height: result.current.previewImageData.height,
                    dataLength: result.current.previewImageData.data.length
                } : null,
                sourceImageVersion: result.current.sourceImageVersion
            }).toMatchSnapshot();
        });
    });
});
