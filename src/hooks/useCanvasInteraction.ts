import { useState, useEffect, useCallback } from 'react';

export const useCanvasInteraction = (uploadedImage: File | null, isPainting: boolean = false) => {
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    const handleWheel = useCallback((e: React.WheelEvent) => {
        if (!uploadedImage) return;
        e.preventDefault();

        // Use multiplicative zoom for better feel at high scales
        // e.deltaY is usually +/- 100
        const zoomIntensity = 0.001;
        const delta = -e.deltaY * zoomIntensity;

        // Exponential-like zoom: scale * (1 + delta)
        const newScale = Math.min(Math.max(0.1, scale * (1 + delta)), 25);

        if (newScale === scale) return;

        // Calculate Mouse Position relative to the container (viewport)
        const rect = e.currentTarget.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Current position
        const px = position.x;
        const py = position.y;

        // Calculate new position to keep the point under mouse stationary
        const newX = mouseX - (mouseX - px) * (newScale / scale);
        const newY = mouseY - (mouseY - py) * (newScale / scale);

        setScale(newScale);
        setPosition({ x: newX, y: newY });
    }, [uploadedImage, scale, position]);

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
