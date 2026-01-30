import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useCanvasInteraction } from '../../hooks/useCanvasInteraction';

describe('useCanvasInteraction', () => {
    const mockFile = new File([''], 'test.png', { type: 'image/png' });

    it('should initialize with default values', () => {
        const { result } = renderHook(() => useCanvasInteraction(mockFile));
        expect(result.current.scale).toBe(1);
        expect(result.current.position).toEqual({ x: 0, y: 0 });
        expect(result.current.isDragging).toBe(false);
    });

    it('should not respond to events if no image is uploaded', () => {
        const { result } = renderHook(() => useCanvasInteraction(null));

        act(() => {
            // @ts-ignore - Mocking event
            result.current.handleWheel({ preventDefault: vi.fn(), deltaY: -100 });
        });
        expect(result.current.scale).toBe(1); // Should stay 1
    });

    it('should handle wheel zoom', () => {
        const { result } = renderHook(() => useCanvasInteraction(mockFile));
        const preventDefault = vi.fn();

        act(() => {
            // @ts-ignore
            result.current.handleWheel({ preventDefault, deltaY: -200 } as React.WheelEvent);
        });

        expect(preventDefault).toHaveBeenCalled();
        expect(result.current.scale).toBeGreaterThan(1);
    });

    it('should clamp zoom scale', () => {
        const { result } = renderHook(() => useCanvasInteraction(mockFile));

        // Try to zoom way out
        act(() => {
            // @ts-ignore
            result.current.handleWheel({ preventDefault: () => { }, deltaY: 10000 });
        });
        expect(result.current.scale).toBe(0.1);

        // Try to zoom way in
        act(() => {
            // @ts-ignore
            result.current.handleWheel({ preventDefault: () => { }, deltaY: -10000 });
        });
        expect(result.current.scale).toBe(5);
    });

    it('should handle dragging logic', () => {
        const { result } = renderHook(() => useCanvasInteraction(mockFile));

        // Mouse Down
        act(() => {
            // @ts-ignore
            result.current.handleMouseDown({ button: 0, clientX: 100, clientY: 100 });
        });
        expect(result.current.isDragging).toBe(true);
        expect(result.current.position).toEqual({ x: 0, y: 0 }); // Drag start, position doesn't change yet

        // Mouse Move
        act(() => {
            // @ts-ignore
            result.current.handleMouseMove({ clientX: 150, clientY: 150 });
        });
        expect(result.current.position).toEqual({ x: 50, y: 50 });

        // Mouse Up
        act(() => {
            result.current.handleMouseUp();
        });
        expect(result.current.isDragging).toBe(false);
    });

    it('should reset when image changes', () => {
        const { result, rerender } = renderHook(({ img }: { img: File | null }) => useCanvasInteraction(img), {
            initialProps: { img: mockFile }
        });

        act(() => {
            // @ts-ignore
            result.current.handleWheel({ preventDefault: () => { }, deltaY: -200 }); // Zoom in
        });
        expect(result.current.scale).not.toBe(1);

        // Change prop (simulate new upload - referencing same file object might not trigger effect if dep is same, but here we pass new prop)
        rerender({ img: new File([''], 'new.png') });

        // Wait for effect? Standard useEffect runs after render.
        expect(result.current.scale).toBe(1);
    });
});
