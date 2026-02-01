import { useState, useEffect, useCallback } from 'react';

export const useCanvasInteraction = (uploadedImage: File | null, isPainting: boolean = false) => {
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    const handleWheel = useCallback((e: React.WheelEvent) => {
        if (!uploadedImage) return;
        e.preventDefault();
        const delta = e.deltaY * -0.001;
        const newScale = Math.min(Math.max(0.1, scale + delta), 25);
        setScale(newScale);
    }, [uploadedImage, scale]);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (!uploadedImage || e.button !== 0) return;
        // Allow drag if NOT painting OR if Ctrl is held (override)
        if (isPainting && !e.ctrlKey) return;

        setIsDragging(true);
        setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }, [uploadedImage, position, isPainting]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!isDragging) return;
        setPosition({
            x: e.clientX - dragStart.x,
            y: e.clientY - dragStart.y
        });
    }, [isDragging, dragStart]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    // Reset when image changes
    useEffect(() => {
        if (uploadedImage) {
            setScale(1);
            setPosition({ x: 0, y: 0 });
        }
    }, [uploadedImage]);

    // Global mouse up to catch drags outside
    useEffect(() => {
        if (isDragging) {
            const up = () => setIsDragging(false);
            window.addEventListener('mouseup', up);
            return () => window.removeEventListener('mouseup', up);
        }
    }, [isDragging]);

    return {
        scale,
        setScale,
        position,
        isDragging,
        handleWheel,
        handleMouseDown,
        handleMouseMove,
        handleMouseUp
    };
};
