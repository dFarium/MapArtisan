import { useEffect, useRef } from 'react';
import { useMapart } from '../../../context/MapartContext';

interface ManualEditsOverlayProps {
    width: number;
    height: number;
}

export const ManualEditsOverlay = ({ width, height }: ManualEditsOverlayProps) => {
    const manualEdits = useMapart(s => s.manualEdits);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, width, height);

        // Draw each manual edit
        Object.entries(manualEdits).forEach(([key, edit]) => {
            const index = parseInt(key);
            const x = index % width;
            const y = Math.floor(index / width);

            // Draw the pixel color
            const { r, g, b } = edit.rgb;
            ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            ctx.fillRect(x, y, 1, 1);

            // Optional: Draw a highlight (e.g., small semi-transparent border or dot)
            // For now, let's just make sure the pixel is correct.
            // If we want to "Highlight" them distinctively:
            // ctx.fillStyle = 'rgba(255, 0, 255, 0.3)';
            // ctx.fillRect(x, y, 1, 1);
        });
    }, [manualEdits, width, height]);

    return (
        <canvas
            ref={canvasRef}
            width={width}
            height={height}
            className="absolute inset-0 pointer-events-none rendering-pixelated"
            style={{ width, height }}
        />
    );
};
