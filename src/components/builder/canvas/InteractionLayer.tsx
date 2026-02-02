import { useState, useCallback, useEffect, useRef } from 'react';
import { useMapart } from '../../../context/MapartContext';
import type { ManualEdit } from '../../../types/mapart';

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
    const applyBatchEdits = useMapart(s => s.applyBatchEdits);
    const addToHistory = useMapart(s => s.addToHistory);

    const [hoveredPixel, setHoveredPixel] = useState<{ x: number, y: number } | null>(null);

    // Pending edits during active stroke (not committed to store yet)
    const pendingEditsRef = useRef<Record<number, ManualEdit>>({});
    const pendingDeletionsRef = useRef<Set<number>>(new Set());
    const strokeCanvasRef = useRef<HTMLCanvasElement>(null);
    const isStrokingRef = useRef(false);
    const lastPaintedPixelRef = useRef<{ x: number, y: number } | null>(null);

    const getPixelCoords = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const relativeX = (e.clientX - rect.left) / rect.width;
        const relativeY = (e.clientY - rect.top) / rect.height;
        const pixelX = Math.floor(relativeX * width);
        const pixelY = Math.floor(relativeY * height);
        return { pixelX, pixelY };
    };

    // Draw a single pixel on the stroke preview canvas
    const drawPendingPixel = useCallback((x: number, y: number, rgb: { r: number, g: number, b: number } | null) => {
        const canvas = strokeCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        if (rgb) {
            ctx.fillStyle = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
            ctx.fillRect(x, y, 1, 1);
        } else {
            // Deletion - draw a "removed" indicator (semi-transparent red)
            ctx.fillStyle = 'rgba(255, 0, 255, 0.25)';
            ctx.fillRect(x, y, 1, 1);
        }
    }, []);

    // Clear the stroke preview canvas
    const clearStrokePreview = useCallback(() => {
        const canvas = strokeCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, width, height);
    }, [width, height]);

    const performPaintAction = useCallback((pixelX: number, pixelY: number, button: number) => {
        if (pixelX >= 0 && pixelX < width && pixelY >= 0 && pixelY < height) {
            const index = pixelY * width + pixelX;
            if (button === 0) { // Left Click: Paint
                if (brushBlock) {
                    pendingEditsRef.current[index] = brushBlock;
                    pendingDeletionsRef.current.delete(index); // Remove from deletions if was there
                    drawPendingPixel(pixelX, pixelY, brushBlock.rgb);
                }
            } else if (button === 2) { // Right Click: Erase
                delete pendingEditsRef.current[index]; // Remove from pending edits
                pendingDeletionsRef.current.add(index);
                drawPendingPixel(pixelX, pixelY, null);
            }
        }
    }, [width, height, brushBlock, drawPendingPixel]);

    // Bresenham's line algorithm for smooth strokes
    const paintLine = useCallback((x0: number, y0: number, x1: number, y1: number, button: number) => {
        const dx = Math.abs(x1 - x0);
        const dy = Math.abs(y1 - y0);
        const sx = (x0 < x1) ? 1 : -1;
        const sy = (y0 < y1) ? 1 : -1;
        let err = dx - dy;
        let cx = x0;
        let cy = y0;

        while (true) {
            performPaintAction(cx, cy, button);
            if ((cx === x1) && (cy === y1)) break;
            const e2 = 2 * err;
            if (e2 > -dy) { err -= dy; cx += sx; }
            if (e2 < dx) { err += dx; cy += sy; }
        }
    }, [performPaintAction]);

    // Commit all pending edits to the store
    const commitStroke = useCallback(() => {
        const hasPendingEdits = Object.keys(pendingEditsRef.current).length > 0;
        const hasPendingDeletions = pendingDeletionsRef.current.size > 0;

        if (hasPendingEdits || hasPendingDeletions) {
            applyBatchEdits(
                pendingEditsRef.current,
                Array.from(pendingDeletionsRef.current)
            );
            addToHistory();
        }

        // Reset pending state
        pendingEditsRef.current = {};
        pendingDeletionsRef.current.clear();
        clearStrokePreview();
        isStrokingRef.current = false;
        lastPaintedPixelRef.current = null;
    }, [applyBatchEdits, addToHistory, clearStrokePreview]);

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

        // Start a new stroke
        isStrokingRef.current = true;
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
        if ((e.buttons === 1 || e.buttons === 2) && isStrokingRef.current) {
            const button = e.buttons === 1 ? 0 : 2;
            if (lastPaintedPixelRef.current) {
                paintLine(lastPaintedPixelRef.current.x, lastPaintedPixelRef.current.y, pixelX, pixelY, button);
            } else {
                performPaintAction(pixelX, pixelY, button);
            }
            lastPaintedPixelRef.current = { x: pixelX, y: pixelY };
        }
    };

    const handleMouseUp = useCallback(() => {
        if (isStrokingRef.current) {
            commitStroke();
        }
    }, [commitStroke]);

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
        const handleGlobalMouseUp = () => {
            if (isStrokingRef.current) {
                commitStroke();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        window.addEventListener('mouseup', handleGlobalMouseUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('mouseup', handleGlobalMouseUp);
        };
    }, [commitStroke]);

    const isInteractive = !isCtrlPressed;

    if (!isPainting && !isPicking) return null;

    const cursorStyle = isPicking ? 'cursor-crosshair' : (isInteractive ? 'cursor-none' : 'pointer-events-none');

    return (
        <>
            {/* Stroke Preview Canvas - shows pending edits during active stroke */}
            <canvas
                ref={strokeCanvasRef}
                width={width}
                height={height}
                className="absolute inset-0 z-25 pointer-events-none"
                style={{
                    width,
                    height,
                    imageRendering: 'pixelated'
                }}
            />

            {/* Interactive Surface */}
            <div
                className={`absolute inset-0 z-30 ${cursorStyle}`}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
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
