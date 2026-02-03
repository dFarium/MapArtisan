import { ZoomIn, ZoomOut, Download, ImageDown, Box, Image as ImageIcon, Trash2 } from 'lucide-react';

import { clsx } from 'clsx';
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
}

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
    isPainting
}: CanvasToolbarProps) => {
    return (
        <>
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-stretch gap-2">
                {/* Standard Toolbar */}
                <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-700 rounded-lg p-1.5 shadow-lg">

                    {/* Zoom Controls */}
                    <div className="flex bg-zinc-900/50 p-1 rounded-lg border border-zinc-800 gap-1">
                        <button onClick={() => setScale(s => Math.max(0.1, s - 0.1))} className="p-2 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200 transition-colors" title="Zoom Out">
                            <ZoomOut size={16} />
                        </button>
                        <span className="text-xs w-10 text-center font-mono text-zinc-400 self-center">{Math.round(scale * 100)}%</span>
                        <button onClick={() => setScale(s => Math.min(5, s + 0.1))} className="p-2 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200 transition-colors" title="Zoom In">
                            <ZoomIn size={16} />
                        </button>
                    </div>

                    {/* View/Interaction Controls */}
                    <div className="flex bg-zinc-900/50 p-1 rounded-lg border border-zinc-800 gap-1">
                        <button
                            onClick={() => setShowOriginal(!showOriginal)}
                            className={clsx("p-2 rounded transition-colors", showOriginal ? "bg-zinc-700 text-white ring-1 ring-zinc-500" : "hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200")}
                            title="Toggle Original Image"
                        >
                            <ImageIcon size={16} />
                        </button>
                        <button
                            onClick={onToggle3D}
                            disabled={isPainting}
                            className={clsx(
                                "p-2 rounded transition-colors",
                                is3DMode ? "bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/50" : "hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200",
                                isPainting && "opacity-50 cursor-not-allowed text-zinc-600"
                            )}
                            title={isPainting ? "Close Pixel Editor first" : "Toggle 3D View"}
                        >
                            <Box size={16} />
                        </button>
                    </div>

                    {/* Actions */}
                    <div className="flex bg-zinc-900/50 p-1 rounded-lg border border-zinc-800 gap-1">
                        <button
                            onClick={onDownloadPreview}
                            disabled={!canDownloadPreview}
                            className={clsx(
                                "p-2 rounded transition-colors",
                                canDownloadPreview ? "hover:bg-blue-900/50 hover:text-blue-400 text-zinc-400 hover:text-zinc-200" : "text-zinc-700 cursor-not-allowed"
                            )}
                            title="Save Preview as PNG"
                        >
                            <ImageDown size={16} />
                        </button>

                        <button
                            onClick={onExport}
                            disabled={!canExport || isExporting}
                            className={clsx(
                                "p-2 rounded transition-colors relative flex items-center justify-center",
                                (canExport && !isExporting)
                                    ? "bg-green-500/10 text-green-400 ring-1 ring-green-500/50 hover:bg-green-500/20 hover:text-green-300 shadow-[0_0_10px_rgba(34,197,94,0.1)]"
                                    : "text-zinc-700 cursor-not-allowed"
                            )}
                            title="Download Litematica Schematic"
                        >
                            {isExporting ? (
                                <div className="animate-spin rounded-full h-4 w-4 border-2 border-green-500 border-t-transparent"></div>
                            ) : (
                                <Download size={16} />
                            )}
                        </button>
                    </div>

                </div>

                {/* Pixel Editor Controls (Separate block but inline) */}
                <PixelEditor disabled={is3DMode} />
            </div>

            <div className="absolute top-4 right-4 z-20">
                <button
                    onClick={onClearImage}
                    className="p-2 bg-zinc-900 border border-red-500/20 text-red-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg shadow-lg transition-colors flex items-center justify-center"
                    title="Discard Image"
                >
                    <Trash2 size={18} />
                </button>
            </div>

            {isProcessing && (
                <div className="absolute top-16 right-4 z-30 bg-zinc-900/90 backdrop-blur-md px-3 py-1.5 rounded-full border border-yellow-500/30 flex items-center gap-2 shadow-lg animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="animate-spin rounded-full h-3 w-3 border-2 border-yellow-500 border-t-transparent"></div>
                    <span className="text-yellow-500 text-xs font-medium">Processing...</span>
                </div>
            )}
        </>
    );
};
