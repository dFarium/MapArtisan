import { useState, useEffect, useCallback, useRef, type RefObject } from 'react';

/** The parts of a wheel event the zoom uses; both native and React events fit. */
type WheelInput = Pick<WheelEvent, 'deltaY' | 'clientX' | 'clientY' | 'preventDefault'> & {
    currentTarget: EventTarget | null;
};

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

    const handleWheel = useCallback((e: WheelInput) => {
        if (!uploadedImage) return;
        e.preventDefault();

        // Use multiplicative zoom for better feel at high scales
        const zoomIntensity = 0.001;
        const delta = -e.deltaY * zoomIntensity;

        // Exponential-like zoom: scale * (1 + delta)
        const newScale = Math.min(Math.max(0.1, scale * (1 + delta)), 50);

        if (newScale === scale) return;

        // Calculate Mouse Position relative to the container (viewport)
        const rect = (e.currentTarget as Element).getBoundingClientRect();
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
    const previousImageRef = useRef<File | null>(uploadedImage);

    useEffect(() => {
        if (uploadedImage !== previousImageRef.current) {
            previousImageRef.current = uploadedImage;
            setHasInteracted(false);
        }
    }, [uploadedImage]);

    const handleWheelWithInteraction = useCallback((e: WheelInput) => {
        setHasInteracted(true);
        handleWheel(e);
    }, [handleWheel]);

    // React registers onWheel as a passive listener, so preventDefault() there
    // is ignored and Ctrl+wheel or a trackpad pinch also zooms the whole page.
    // attachWheel adds a non-passive listener to the canvas container instead.
    const wheelHandlerRef = useRef(handleWheelWithInteraction);
    useEffect(() => {
        wheelHandlerRef.current = handleWheelWithInteraction;
    }, [handleWheelWithInteraction]);

    const attachWheel = useCallback((node: HTMLElement) => {
        const listener = (e: WheelEvent) => wheelHandlerRef.current(e);
        node.addEventListener('wheel', listener, { passive: false });
        return () => node.removeEventListener('wheel', listener);
    }, []);

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
        attachWheel,
        handleMouseDown: handleMouseDownWithInteraction,
        handleMouseMove,
        handleMouseUp
    };
};
