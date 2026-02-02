import { useEffect, useRef, memo } from 'react';
import { useMapart } from '../../../context/MapartContext';

interface ManualEditsOverlayProps {
    width: number;
    height: number;
}

export const ManualEditsOverlay = memo(({ width, height }: ManualEditsOverlayProps) => {
    const manualEdits = useMapart(s => s.manualEdits);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const prevEditsRef = useRef<Record<number, { r: number, g: number, b: number }>>({});

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const prevEdits = prevEditsRef.current;
        const currentEditKeys = new Set(Object.keys(manualEdits).map(Number));
        const prevEditKeys = new Set(Object.keys(prevEdits).map(Number));

        // Check if this is a full reset (empty manualEdits or dimension change)
        const isFullReset = Object.keys(manualEdits).length === 0 ||
            canvas.width !== width ||
            canvas.height !== height;

        if (isFullReset) {
            // Full clear and redraw
            canvas.width = width;
            canvas.height = height;
            ctx.clearRect(0, 0, width, height);

            // Draw all current edits
            Object.entries(manualEdits).forEach(([key, edit]) => {
                const index = parseInt(key);
                const x = index % width;
                const y = Math.floor(index / width);
                const { r, g, b } = edit.rgb;
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                ctx.fillRect(x, y, 1, 1);
            });

            // Update cache
            prevEditsRef.current = {};
            Object.entries(manualEdits).forEach(([key, edit]) => {
                prevEditsRef.current[parseInt(key)] = edit.rgb;
            });
            return;
        }

        // Incremental update: only draw changes

        // 1. Find deleted edits (in prev but not in current)
        for (const index of prevEditKeys) {
            if (!currentEditKeys.has(index)) {
                // Edit was deleted - clear that pixel
                const x = index % width;
                const y = Math.floor(index / width);
                ctx.clearRect(x, y, 1, 1);
                delete prevEditsRef.current[index];
            }
        }

        // 2. Find new or changed edits
        for (const [key, edit] of Object.entries(manualEdits)) {
            const index = parseInt(key);
            const prevRgb = prevEdits[index];
            const { r, g, b } = edit.rgb;

            // Only redraw if new or color changed
            if (!prevRgb || prevRgb.r !== r || prevRgb.g !== g || prevRgb.b !== b) {
                const x = index % width;
                const y = Math.floor(index / width);
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                ctx.fillRect(x, y, 1, 1);
                prevEditsRef.current[index] = { r, g, b };
            }
        }
    }, [manualEdits, width, height]);

    return (
        <canvas
            ref={canvasRef}
            width={width}
            height={height}
            className="absolute inset-0 pointer-events-none"
            style={{
                width,
                height,
                imageRendering: 'pixelated'
            }}
        />
    );
});
