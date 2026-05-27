import { useState, useEffect, useCallback, type RefObject } from 'react';

/**
 * Hook to manage interactive canvas operations including zooming, panning, dragging, and automatic centering.
 * 
 * Zooming uses an exponential-like multiplier centered around the user's cursor position.
 * Centering measures container dimensions against actual image dimensions to fit and center the view.
 * 
 * @param uploadedImage The raw user uploaded file, used to enable/disable interaction.
 * @param isPainting State flag indicating if painting is currently active (suspends drag/pan).
 * @param containerRef Reference to the viewport container element used for boundary calculations.
 * @param imageDimensions Width and height of the target rendering layout for alignment.
 */
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
        const zoomIntensity = 0.001;
        const delta = -e.deltaY * zoomIntensity;

        // Exponential-like zoom: scale * (1 + delta)
        const newScale = Math.min(Math.max(0.1, scale * (1 + delta)), 50);

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
    const [currentImage, setCurrentImage] = useState<File | null>(uploadedImage);

    if (uploadedImage !== currentImage) {
        setCurrentImage(uploadedImage);
        setHasInteracted(false);
    }

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

    const imgWidth = imageDimensions?.width;
    const imgHeight = imageDimensions?.height;

    // Perform Centering logic
    useEffect(() => {
        // Centering should only run if user hasn't interacted or if image is brand new (and flag was just reset)
        if (uploadedImage && !hasInteracted && containerRef?.current && imgWidth && imgHeight) {
            const { width: containerWidth, height: containerHeight } = containerRef.current.getBoundingClientRect();

            if (containerWidth && containerHeight) {
                const padding = 0.9;
                const scaleX = (containerWidth * padding) / imgWidth;
                const scaleY = (containerHeight * padding) / imgHeight;
                const fitScale = Math.min(scaleX, scaleY);

                const newX = (containerWidth - (imgWidth * fitScale)) / 2;
                const newY = (containerHeight - (imgHeight * fitScale)) / 2;

                setScale(fitScale);
                setPosition({ x: newX, y: newY });
            }
        }
    }, [uploadedImage, imgWidth, imgHeight, hasInteracted, containerRef]);

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
