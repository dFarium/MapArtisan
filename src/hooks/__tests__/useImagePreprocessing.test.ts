import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useImagePreprocessing } from '../useImagePreprocessing';

describe('useImagePreprocessing', () => {
    const mockPreviewState = {
        setScaledPreviewUrl: vi.fn(),
        setOriginalTransformedUrl: vi.fn(),
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

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('initialization', () => {
        it('inicializa sourceImageDataRef en null', () => {
            const { result } = renderHook(() => useImagePreprocessing(defaultProps));
            expect(result.current.sourceImageDataRef.current).toBeNull();
        });
    });

    describe('return structure', () => {
        it('retorna estructura consistente', () => {
            const { result } = renderHook(() => useImagePreprocessing(defaultProps));
            
            expect(result.current).toHaveProperty('sourceImageDataRef');
            expect(Object.keys(result.current).sort()).toMatchSnapshot();
        });

        it('retorna ref mutable', () => {
            const { result } = renderHook(() => useImagePreprocessing(defaultProps));
            
            expect(result.current.sourceImageDataRef).toHaveProperty('current');
        });
    });

    describe('snapshot regression', () => {
        it('mantiene estructura de retorno consistente', () => {
            const { result } = renderHook(() => useImagePreprocessing(defaultProps));
            
            expect({
                hasSourceImageDataRef: !!result.current.sourceImageDataRef,
                sourceImageDataValue: result.current.sourceImageDataRef.current,
            }).toMatchSnapshot();
        });
    });
});
