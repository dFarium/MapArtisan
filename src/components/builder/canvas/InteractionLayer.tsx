import { useState, useCallback, useEffect, useRef } from 'react';
import { useMapart } from '../../../context/MapartContext';

interface InteractionLayerProps {
    width: number;
    height: number;
    scale: number;
    onPickBlock?: (x: number, y: number) => Promise<any>;
}

export const InteractionLayer = ({ width, height, scale, onPickBlock }: InteractionLayerProps) => {
    const isPainting = useMapart(s => s.isPainting);
    const isPicking = useMapart(s => s.isPicking);
    const setIsPicking = useMapart(s => s.setIsPicking);
    const brushBlock = useMapart(s => s.brushBlock);
    const setBrushBlock = useMapart(s => s.setBrushBlock);
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

    const lastPaintedPixelRef = useRef<{ x: number, y: number } | null>(null);

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

    // Bresenham's line algorithm for smooth strokes
    const paintLine = (x0: number, y0: number, x1: number, y1: number, button: number) => {
        const dx = Math.abs(x1 - x0);
        const dy = Math.abs(y1 - y0);
        const sx = (x0 < x1) ? 1 : -1;
        const sy = (y0 < y1) ? 1 : -1;
        let err = dx - dy;

        while (true) {
            performPaintAction(x0, y0, button);
            if ((x0 === x1) && (y0 === y1)) break;
            const e2 = 2 * err;
            if (e2 > -dy) { err -= dy; x0 += sx; }
            if (e2 < dx) { err += dx; y0 += sy; }
        }
    };

    const handleMouseDown = async (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isPainting && !isPicking) return;
        if (e.button === 1) {
            e.preventDefault();
            return;
        }

        const { pixelX, pixelY } = getPixelCoords(e);

        if (isPicking) {
            if (onPickBlock) {
                const block = await onPickBlock(pixelX, pixelY);
                if (block) {
                    setBrushBlock(block);
                    setIsPicking(false);
                }
            }
            return;
        }

        performPaintAction(pixelX, pixelY, e.button);
        lastPaintedPixelRef.current = { x: pixelX, y: pixelY };
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

        // Drag Paint with Interpolation
        if (e.buttons === 1 || e.buttons === 2) {
            const button = e.buttons === 1 ? 0 : 2;
            if (lastPaintedPixelRef.current) {
                paintLine(lastPaintedPixelRef.current.x, lastPaintedPixelRef.current.y, pixelX, pixelY, button);
            } else {
                performPaintAction(pixelX, pixelY, button);
            }
            lastPaintedPixelRef.current = { x: pixelX, y: pixelY };
        } else {
            lastPaintedPixelRef.current = null;
        }
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

    const isInteractive = !isCtrlPressed;

    if (!isPainting && !isPicking) return null;

    const cursorStyle = isPicking ? 'cursor-crosshair' : (isInteractive ? 'cursor-none' : 'pointer-events-none');

    return (
        <>
            {/* Interactive Surface */}
            <div
                className={`absolute inset-0 z-30 ${cursorStyle}`}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                onContextMenu={(e) => e.preventDefault()}
                style={{ width, height }}
            />

            {/* 3x3 Reticle Cursor */}
            {hoveredPixel && isInteractive && !isPicking && (
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
