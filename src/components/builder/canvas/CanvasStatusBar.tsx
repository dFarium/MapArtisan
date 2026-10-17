import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { GridDimensions } from '../../../store/useMapartStore';
import type { MapartStats } from '../../../types/mapart';

interface CanvasStatusBarProps {
    mapartResolution: { width: number; height: number };
    gridDimensions: GridDimensions;
    mapartStats: MapartStats | null;
    /** Height limit in blocks, 0 when there is none. */
    heightLimit: number;
}

/**
 * Vertical blocks needed by the tallest column. Exports ground every column
 * on its own, so this is the real build height; the global min/max stats mix
 * columns measured against different north reference blocks.
 */
function buildHeight(stats: MapartStats): number {
    let tallest = 0;
    for (const range of stats.heightMap) {
        if (range > tallest) tallest = range;
    }
    return tallest + 1;
}

export const CanvasStatusBar = ({ mapartResolution, gridDimensions, mapartStats, heightLimit }: CanvasStatusBarProps) => {
    const height = mapartStats ? buildHeight(mapartStats) : 0;
    // Manual edits win over the limit, so a painted column may still exceed it.
    const overLimit = height > 384 || (heightLimit > 0 && height > heightLimit);

    return (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 bg-popover/90 backdrop-blur-md px-4 py-2 rounded-full border text-xs text-muted-foreground flex items-center gap-4 shadow-xl whitespace-nowrap">
            <div className="flex items-center gap-2">
                <span className="font-bold uppercase tracking-wider">Target</span>
                <span className="text-foreground font-mono font-bold">{mapartResolution.width} × {mapartResolution.height}</span>
            </div>

            <Separator orientation="vertical" className="h-3" />

            <div className="flex items-center gap-2">
                <span className="font-bold uppercase tracking-wider">Aspect</span>
                <span className="text-foreground font-mono">{(mapartResolution.width / mapartResolution.height).toFixed(2)}</span>
            </div>

            <Separator orientation="vertical" className="h-3" />

            <div className="flex items-center gap-2">
                <span className="font-bold uppercase tracking-wider">Grid</span>
                <span className="text-foreground font-mono">{gridDimensions.x} × {gridDimensions.y}</span>
            </div>

            {mapartStats && (
                <>
                    <Separator orientation="vertical" className="h-3" />
                    <div className="flex items-center gap-2">
                        <span className="font-bold uppercase tracking-wider">Height</span>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span
                                    tabIndex={0}
                                    className={cn("rounded-sm font-mono font-bold outline-none focus-visible:ring-2 focus-visible:ring-ring/30", overLimit ? "text-destructive" : "text-success")}
                                >
                                    {height}{heightLimit > 0 ? ` / ${heightLimit}` : ''} blocks
                                </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                                {heightLimit > 0 && height > heightLimit
                                    ? "Manual edits push this column over the height limit"
                                    : "Tallest column, including its north reference block"}
                            </TooltipContent>
                        </Tooltip>
                    </div>
                </>
            )}
        </div>
    );
};
