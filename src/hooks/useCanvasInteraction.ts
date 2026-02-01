import { useState, useEffect, useCallback, useRef, type RefObject } from 'react';

export const useCanvasInteraction = (
    uploadedImage: File | null,
    isPainting: boolean = false,
    containerRef?: RefObject<HTMLElement>,
    imageDimensions?: { width: number; height: number }
) => {
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

    // Reset or Center when image changes
    const [hasInteracted, setHasInteracted] = useState(false);
    // Better to use a Ref for previous image to detect "new image upload" vs "dimension change"
    const prevImageRef = useRef<File | null>(null);

    const handleWheelWithInteraction = useCallback((e: React.WheelEvent) => {
        setHasInteracted(true);
        handleWheel(e);
    }, [handleWheel]);

    const handleMouseDownWithInteraction = useCallback((e: React.MouseEvent) => {
        if (!uploadedImage || e.button !== 0) return;
        // Check conditions before setting interacted
        if (!isPainting || e.ctrlKey) {
            setHasInteracted(true);
        }
        handleMouseDown(e);
    }, [handleMouseDown, uploadedImage, isPainting]);

    // Reset or Center when image changes
    useEffect(() => {
        if (uploadedImage) {
            const isNewImage = uploadedImage !== prevImageRef.current;

            // If it's a new image, always reset interaction flag and center
            if (isNewImage) {
                prevImageRef.current = uploadedImage;
                setHasInteracted(false);
            }

            // Perform Centering if:
            // 1. New Image
            // 2. OR Dimensions changed AND User hasn't interacted yet (e.g. preview appeared)
            if ((isNewImage || !hasInteracted) && containerRef?.current && imageDimensions) {
                const { width: containerWidth, height: containerHeight } = containerRef.current.getBoundingClientRect();
                const { width: imgWidth, height: imgHeight } = imageDimensions;

                if (containerWidth && containerHeight && imgWidth && imgHeight) {
                    const padding = 0.9;
                    const scaleX = (containerWidth * padding) / imgWidth;
                    const scaleY = (containerHeight * padding) / imgHeight;
                    const fitScale = Math.min(scaleX, scaleY);

                    const newX = (containerWidth - (imgWidth * fitScale)) / 2;
                    const newY = (containerHeight - (imgHeight * fitScale)) / 2;

                    setScale(fitScale);
                    setPosition({ x: newX, y: newY });
                } else if (isNewImage) {
                    // Fallbacks for new image only
                    setScale(1);
                    setPosition({ x: 0, y: 0 });
                }
            }
        }
    }, [uploadedImage, imageDimensions?.width, imageDimensions?.height, hasInteracted]);

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
        handleWheel: handleWheelWithInteraction,
        handleMouseDown: handleMouseDownWithInteraction,
        handleMouseMove,
        handleMouseUp
    };
};
