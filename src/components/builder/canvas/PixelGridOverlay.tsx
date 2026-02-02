import { memo, useState, useEffect, useRef } from 'react';

interface PixelGridOverlayProps {
    scale: number;
    isVisible: boolean;
}

export const PixelGridOverlay = memo(({ scale, isVisible }: PixelGridOverlayProps) => {
    // Debounce scale to avoid rapid re-renders during zoom gestures
    const [debouncedScale, setDebouncedScale] = useState(scale);
    const timeoutRef = useRef<number | null>(null);

    useEffect(() => {
        if (timeoutRef.current !== null) {
            clearTimeout(timeoutRef.current);
        }

        // Debounce scale updates by 30ms
        timeoutRef.current = window.setTimeout(() => {
            setDebouncedScale(scale);
        }, 30);

        return () => {
            if (timeoutRef.current !== null) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, [scale]);

    if (!isVisible) return null;

    const uniqueId = "pixel-grid-pattern";

    return (
        <svg
            className="absolute inset-0 pointer-events-none z-20 opacity-50"
            width="100%"
            height="100%"
            xmlns="http://www.w3.org/2000/svg"
            style={{
                imageRendering: 'pixelated',
                willChange: 'contents',
                contain: 'strict',
                transform: 'translateZ(0)',
            }}
        >
            <defs>
                <pattern
                    id={uniqueId}
                    width="1"
                    height="1"
                    patternUnits="userSpaceOnUse"
                >
                    <path
                        d="M 1 0 L 0 0 0 1"
                        fill="none"
                        stroke="white"
                        strokeWidth={1 / debouncedScale}
                        shapeRendering="crispEdges"
                        vectorEffect="non-scaling-stroke"
                    />
                </pattern>
            </defs>
            <rect width="100%" height="100%" fill={`url(#${uniqueId})`} />
        </svg>
    );
}, (prev, next) => {
    return prev.scale === next.scale && prev.isVisible === next.isVisible;
});
