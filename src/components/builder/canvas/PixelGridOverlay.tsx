import { memo } from 'react';

interface PixelGridOverlayProps {
    scale: number;
    isVisible: boolean;
}

export const PixelGridOverlay = memo(({ scale, isVisible }: PixelGridOverlayProps) => {
    if (!isVisible) return null;

    // We use a pattern to draw the grid.
    // Stroke width is 1/scale to ensure it is always ~1px on screen.
    const uniqueId = "pixel-grid-pattern";

    return (
        <svg
            className="absolute inset-0 pointer-events-none z-20 opacity-50"
            width="100%"
            height="100%"
            xmlns="http://www.w3.org/2000/svg"
            style={{ imageRendering: 'pixelated' }} // Hint for crisp rendering
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
                        strokeWidth={1 / scale}
                        shapeRendering="crispEdges"
                        vectorEffect="non-scaling-stroke"
                    />
                </pattern>
            </defs>
            <rect width="100%" height="100%" fill={`url(#${uniqueId})`} />
        </svg>
    );
}, (prev, next) => {
    // Custom comparison
    return prev.scale === next.scale && prev.isVisible === next.isVisible;
});
