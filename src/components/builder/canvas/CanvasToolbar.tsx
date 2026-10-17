import { ZoomIn, ZoomOut, Download, ImageDown, Box, Image as ImageIcon, Trash2, Loader2 } from 'lucide-react';

import { ToolbarButton } from '@/components/controls/ToolbarButton';
import { Separator } from '@/components/ui/separator';
import { PixelEditor } from '../PixelEditor';

interface CanvasToolbarProps {
    scale: number;
    setScale: (cb: (s: number) => number) => void;
    isDragging: boolean;
    showOriginal: boolean;
    setShowOriginal: (show: boolean) => void;
    onToggle3D: () => void;
    is3DMode: boolean;
    onExport: () => void;
    canExport: boolean;
    onClearImage: () => void;
    isProcessing?: boolean;
    isExporting?: boolean;
    onDownloadPreview: () => void;
    canDownloadPreview: boolean;
    isPainting: boolean;
    exportFormat: 'litematic' | 'nbt';
}

const panelClass = 'flex w-11 flex-col items-center gap-1 rounded-lg border bg-popover p-1.5 shadow-lg';

export const CanvasToolbar = ({
    scale,
    setScale,
    showOriginal,
    setShowOriginal,
    onToggle3D,
    is3DMode,
    onExport,
    canExport,
    onClearImage,
    isProcessing,
    isExporting,
    onDownloadPreview,
    canDownloadPreview,
    isPainting,
    exportFormat
}: CanvasToolbarProps) => {
    return (
        <>
            {/* LEFT SIDEBAR - Pixel Editor */}
            <div className="absolute top-1/2 left-4 -translate-y-1/2 z-20">
                <div className={panelClass}>
                    <PixelEditor disabled={is3DMode} />
                </div>
            </div>

            {/* RIGHT SIDEBAR - Basic Controls */}
            <div className="absolute top-1/2 right-4 -translate-y-1/2 z-20">
                <div className={panelClass}>
                    <ToolbarButton label="Zoom In" tooltipSide="left" onClick={() => setScale(s => Math.min(5, s + 0.1))}>
                        <ZoomIn />
                    </ToolbarButton>
                    <span className="py-0.5 text-center font-mono text-xs text-muted-foreground">{Math.round(scale * 100)}%</span>
                    <ToolbarButton label="Zoom Out" tooltipSide="left" onClick={() => setScale(s => Math.max(0.1, s - 0.1))}>
                        <ZoomOut />
                    </ToolbarButton>

                    <Separator className="my-1" />

                    <ToolbarButton
                        label="Toggle Original Image"
                        tooltipSide="left"
                        pressed={showOriginal}
                        onClick={() => setShowOriginal(!showOriginal)}
                    >
                        <ImageIcon />
                    </ToolbarButton>
                    <ToolbarButton
                        label="Toggle 3D View"
                        tooltip={isPainting ? "Close Pixel Editor first" : undefined}
                        tooltipSide="left"
                        pressed={is3DMode}
                        onClick={onToggle3D}
                        disabled={isPainting}
                    >
                        <Box />
                    </ToolbarButton>

                    <Separator className="my-1" />

                    <ToolbarButton
                        label="Download Preview as PNG"
                        tooltipSide="left"
                        onClick={onDownloadPreview}
                        disabled={!canDownloadPreview}
                    >
                        <ImageDown />
                    </ToolbarButton>
                    <ToolbarButton
                        label={exportFormat === 'nbt' ? "Download Vanilla NBT Schematic" : "Download Litematica Schematic"}
                        tooltipSide="left"
                        variant="default"
                        onClick={onExport}
                        disabled={!canExport || isExporting}
                        aria-busy={isExporting}
                    >
                        {isExporting ? <Loader2 className="animate-spin" /> : <Download />}
                    </ToolbarButton>

                    <Separator className="my-1" />

                    <ToolbarButton label="Discard Image" tooltipSide="left" variant="destructive" onClick={onClearImage}>
                        <Trash2 />
                    </ToolbarButton>
                </div>
            </div>

            {isProcessing && (
                <div
                    role="status"
                    className="absolute top-20 right-4 z-30 flex items-center gap-2 rounded-full border border-warning/30 bg-popover/90 px-3 py-1.5 shadow-lg backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-200"
                >
                    <Loader2 className="size-3 animate-spin text-warning" />
                    <span className="text-xs font-medium text-warning">Processing...</span>
                </div>
            )}
        </>
    );
};
