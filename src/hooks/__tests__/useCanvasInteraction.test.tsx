
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useCanvasInteraction } from '../../hooks/useCanvasInteraction';

describe('useCanvasInteraction', () => {
    const mockFile = new File([''], 'test.png', { type: 'image/png' });

    it('should initialize with default values', () => {
        const mockRef = { current: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100, x: 0, y: 0, bottom: 100, right: 100, toJSON: () => { } }) } };
        const { result } = renderHook(() => useCanvasInteraction(mockFile, false, mockRef as any, { width: 100, height: 100 }));
        expect(result.current.scale).toBe(0.9);
        expect(result.current.position).toEqual({ x: 5, y: 5 });
        expect(result.current.isDragging).toBe(false);
    });

    it('should not respond to events if no image is uploaded', () => {
        const mockRef = { current: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100, x: 0, y: 0, bottom: 100, right: 100, toJSON: () => { } }) } };
        const { result } = renderHook(() => useCanvasInteraction(null, false, mockRef as any, { width: 100, height: 100 }));

        act(() => {
            // @ts-ignore - Mocking event
            result.current.handleWheel({ preventDefault: vi.fn(), deltaY: -100 });
        });
        expect(result.current.scale).toBe(1);
    });

    it('should handle wheel zoom', () => {
        const mockRef = { current: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100, x: 0, y: 0, bottom: 100, right: 100, toJSON: () => { } }) } };
        const { result } = renderHook(() => useCanvasInteraction(mockFile, false, mockRef as any, { width: 100, height: 100 }));
        const preventDefault = vi.fn();

        act(() => {
            // @ts-ignore
            result.current.handleWheel({
                preventDefault,
                deltaY: -200,
                clientX: 50,
                clientY: 50,
                currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100, x: 0, y: 0, bottom: 100, right: 100, toJSON: () => { } }) } as any
            } as React.WheelEvent);
        });

        expect(preventDefault).toHaveBeenCalled();
        expect(result.current.scale).toBeGreaterThan(0.9);
    });

    it('should clamp zoom scale', () => {
        const mockRef = { current: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100, x: 0, y: 0, bottom: 100, right: 100, toJSON: () => { } }) } };
        const { result } = renderHook(() => useCanvasInteraction(mockFile, false, mockRef as any, { width: 100, height: 100 }));

        // Try to zoom way out
        act(() => {
            // @ts-ignore
            result.current.handleWheel({
                preventDefault: () => { },
                deltaY: 10000,
                clientX: 50,
                clientY: 50,
                currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100, x: 0, y: 0, bottom: 100, right: 100, toJSON: () => { } }) } as any
            });
        });
        expect(result.current.scale).toBe(0.1);

        // Try to zoom way in
        act(() => {
            // @ts-ignore
            result.current.handleWheel({
                preventDefault: () => { },
                deltaY: -300000,
                clientX: 50,
                clientY: 50,
                currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100, x: 0, y: 0, bottom: 100, right: 100, toJSON: () => { } }) } as any
            });
        });
        expect(result.current.scale).toBe(25);
    });

    it('should handle dragging logic', () => {
        const mockRef = { current: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100, x: 0, y: 0, bottom: 100, right: 100, toJSON: () => { } }) } };
        const { result } = renderHook(() => useCanvasInteraction(mockFile, false, mockRef as any, { width: 100, height: 100 }));

        // Mouse Down
        act(() => {
            // @ts-ignore
            result.current.handleMouseDown({ button: 0, clientX: 100, clientY: 100 });
        });
        expect(result.current.isDragging).toBe(true);
        expect(result.current.position).toEqual({ x: 5, y: 5 });

        // Mouse Move
        act(() => {
            // @ts-ignore
            result.current.handleMouseMove({ clientX: 150, clientY: 150 });
        });
        // 150 - 100 = 50 delta. Pos = 5 + 50 = 55
        expect(result.current.position).toEqual({ x: 55, y: 55 });

        // Mouse Up
        act(() => {
            result.current.handleMouseUp();
        });
        expect(result.current.isDragging).toBe(false);
    });

    it('should reset when image changes', () => {
        const mockRef = { current: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100, x: 0, y: 0, bottom: 100, right: 100, toJSON: () => { } }) } };
        const { result, rerender } = renderHook(({ img }: { img: File | null }) => useCanvasInteraction(img, false, mockRef as any, { width: 100, height: 100 }), {
            initialProps: { img: mockFile }
        });

        // Initial check
        expect(result.current.scale).toBe(0.9);

        act(() => {
            // @ts-ignore
            result.current.handleWheel({
                preventDefault: () => { },
                deltaY: -200,
                clientX: 50,
                clientY: 50,
                currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100, x: 0, y: 0, bottom: 100, right: 100, toJSON: () => { } }) } as any
            }); // Zoom in
        });
        expect(result.current.scale).not.toBe(0.9);

        // Change prop 
        rerender({ img: new File([''], 'new.png') });

        // Should reset to fit scale
        expect(result.current.scale).toBe(0.9);
    });
});
