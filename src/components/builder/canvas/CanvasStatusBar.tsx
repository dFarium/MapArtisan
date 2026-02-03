import { clsx } from 'clsx';
import type { GridDimensions } from '../../../store/useMapartStore';
import type { MapartStats } from '../../../types/mapart';

interface CanvasStatusBarProps {
    mapartResolution: { width: number; height: number };
    gridDimensions: GridDimensions;
    mapartStats: MapartStats | null;
}

export const CanvasStatusBar = ({ mapartResolution, gridDimensions, mapartStats }: CanvasStatusBarProps) => {
    return (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 bg-zinc-900/90 backdrop-blur-md px-4 py-2 rounded-full border border-zinc-700 text-xs text-zinc-400 flex items-center gap-4 shadow-xl whitespace-nowrap">
            <div className="flex items-center gap-2">
                <span className="text-zinc-500 font-bold uppercase tracking-wider text-xs">Target</span>
                <span className="text-zinc-200 font-mono font-bold text-xs">{mapartResolution.width} × {mapartResolution.height}</span>
            </div>

            <div className="w-px h-3 bg-zinc-700" />

            <div className="flex items-center gap-2">
                <span className="text-zinc-500 font-bold uppercase tracking-wider text-xs">Aspect</span>
                <span className="text-zinc-300 font-mono text-xs">{(mapartResolution.width / mapartResolution.height).toFixed(2)}</span>
            </div>

            <div className="w-px h-3 bg-zinc-700" />

            <div className="flex items-center gap-2">
                <span className="text-zinc-500 font-bold uppercase tracking-wider text-xs">Grid</span>
                <span className="text-zinc-300 font-mono text-xs">{gridDimensions.x} × {gridDimensions.y}</span>
            </div>

            {mapartStats && (
                <>
                    <div className="w-px h-3 bg-zinc-700" />
                    <div className="flex items-center gap-2">
                        <span className="text-zinc-500 font-bold uppercase tracking-wider text-xs">Height</span>
                        <span className="text-zinc-200 font-mono text-xs">
                            {mapartStats.minHeight} <span className="text-zinc-600">to</span> +{mapartStats.maxHeight}
                        </span>
                        <span className={clsx("font-bold ml-1", (mapartStats.maxHeight - mapartStats.minHeight) > 384 ? "text-red-400" : "text-emerald-400")}>
                            (Δ{mapartStats.maxHeight - mapartStats.minHeight})
                        </span>
                    </div>
                </>
            )}
        </div>
    );
};
