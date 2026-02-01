import { useState, useCallback, useEffect } from 'react';
import { useMapart } from '../../../context/MapartContext';

interface InteractionLayerProps {
    width: number;
    height: number;
    scale: number;
}

export const InteractionLayer = ({ width, height, scale }: InteractionLayerProps) => {
    const isPainting = useMapart(s => s.isPainting);
    const brushBlock = useMapart(s => s.brushBlock);
    const setManualEdit = useMapart(s => s.setManualEdit);
    const deleteManualEdit = useMapart(s => s.deleteManualEdit);

    const [hoveredPixel, setHoveredPixel] = useState<{ x: number, y: number } | null>(null);

    const getPixelCoords = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        // Calculate relative position (0 to 1)
        const relativeX = (e.clientX - rect.left) / rect.width;
        const relativeY = (e.clientY - rect.top) / rect.height;

        // Map to texture coordinates
        const pixelX = Math.floor(relativeX * width);
        const pixelY = Math.floor(relativeY * height);

        return { pixelX, pixelY };
    };

    const performPaintAction = useCallback((pixelX: number, pixelY: number, button: number) => {
        if (pixelX >= 0 && pixelX < width && pixelY >= 0 && pixelY < height) {
            const index = pixelY * width + pixelX;
            if (button === 0) { // Left Click: Paint
                if (brushBlock) setManualEdit(index, brushBlock);
            } else if (button === 2) { // Right Click: Erase
                deleteManualEdit(index);
            }
        }
    }, [width, height, brushBlock, setManualEdit, deleteManualEdit]);

    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isPainting) return;
        if (e.button === 1) { // Middle click prevention/defer
            e.preventDefault();
            return;
        }
        const { pixelX, pixelY } = getPixelCoords(e);
        performPaintAction(pixelX, pixelY, e.button);
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isPainting) return;

        const { pixelX, pixelY } = getPixelCoords(e);

        // Update Hover (Local State - cheap render)
        if (pixelX >= 0 && pixelX < width && pixelY >= 0 && pixelY < height) {
            setHoveredPixel(prev => (prev?.x === pixelX && prev?.y === pixelY) ? prev : { x: pixelX, y: pixelY });
        } else {
            setHoveredPixel(null);
        }

        // Drag Paint
        if (e.buttons === 1) performPaintAction(pixelX, pixelY, 0);
        else if (e.buttons === 2) performPaintAction(pixelX, pixelY, 2);
    };

    const handleMouseLeave = () => setHoveredPixel(null);

    // Track Ctrl key for panning override
    const [isCtrlPressed, setIsCtrlPressed] = useState(false);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Control') setIsCtrlPressed(true);
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === 'Control') setIsCtrlPressed(false);
        };
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, []);

    if (!isPainting) return null;

    // If Ctrl is pressed, disable pointer events on this layer to allow panning (controlled by parent)
    // Also hide the reticle so it doesn't look confusing.
    const isInteractive = !isCtrlPressed;

    return (
        <>
            {/* Interactive Surface */}
            <div
                className={`absolute inset-0 z-30 ${isInteractive ? 'cursor-none' : 'pointer-events-none'}`}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                onContextMenu={(e) => e.preventDefault()}
                style={{ width, height }}
            />

            {/* 3x3 Reticle Cursor */}
            {hoveredPixel && isInteractive && (
                <div
                    className="absolute z-40 pointer-events-none"
                    style={{
                        left: hoveredPixel.x - 1,
                        top: hoveredPixel.y - 1,
                        width: 3,
                        height: 3,
                    }}
                >
                    {/* Inner Target Box (The actual pixel) */}
                    {/* Inner Target Box (The actual pixel) */}
                    <div
                        className="absolute inset-0 m-auto"
                        style={{
                            width: 1,
                            height: 1,
                            boxShadow: `0 0 0 ${1 / scale}px rgba(255, 255, 255, 0.9), 0 0 0 ${2 / scale}px rgba(0, 0, 0, 0.5)`
                        }}
                    />

                    {/* Outer 3x3 Frame (Corners) */}
                    <div
                        className="absolute inset-0 border border-white/50"
                        style={{
                            borderWidth: (1 / scale) + 'px'
                        }}
                    />
                </div>
            )}
        </>
    );
};
