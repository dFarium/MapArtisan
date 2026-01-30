import { ZoomIn, ZoomOut, Move, Grid3X3, Download, X } from 'lucide-react';
import { clsx } from 'clsx';

interface CanvasToolbarProps {
    scale: number;
    setScale: (cb: (s: number) => number) => void;
    isDragging: boolean;
    showPreview: boolean;
    setShowPreview: (show: boolean) => void;
    onExport: () => void;
    canExport: boolean;
    onClearImage: () => void;
    isProcessing?: boolean;
}

export const CanvasToolbar = ({
    scale,
    setScale,
    isDragging,
    showPreview,
    setShowPreview,
    onExport,
    canExport,
    onClearImage,
    isProcessing
}: CanvasToolbarProps) => {
    return (
        <>
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-zinc-900/90 backdrop-blur-sm p-2 rounded-lg border border-zinc-700 shadow-xl">
                <button onClick={() => setScale(s => Math.max(0.1, s - 0.1))} className="p-2 hover:bg-zinc-700 rounded text-zinc-300">
                    <ZoomOut size={18} />
                </button>
                <span className="text-xs w-12 text-center font-mono text-zinc-400">{Math.round(scale * 100)}%</span>
                <button onClick={() => setScale(s => Math.min(5, s + 0.1))} className="p-2 hover:bg-zinc-700 rounded text-zinc-300">
                    <ZoomIn size={18} />
                </button>
                <div className="w-px h-6 bg-zinc-700 mx-1" />
                <button
                    className={clsx("p-2 hover:bg-zinc-700 rounded text-zinc-300", isDragging && "text-blue-400 bg-zinc-800")}
                    title="Drag to Pan"
                >
                    <Move size={18} />
                </button>
                <div className="w-px h-6 bg-zinc-700 mx-1" />
                <button
                    onClick={() => setShowPreview(!showPreview)}
                    className={clsx("p-2 hover:bg-zinc-700 rounded", showPreview ? "text-green-400 bg-zinc-800" : "text-zinc-300")}
                    title="Toggle Mapart Preview"
                >
                    <Grid3X3 size={18} />
                </button>

                <div className="w-px h-6 bg-zinc-700 mx-1" />

                <button
                    onClick={onExport}
                    disabled={!canExport}
                    className={clsx(
                        "p-2 hover:bg-green-900/50 hover:text-green-400 rounded transition-colors",
                        canExport
                            ? "text-green-400"
                            : "text-zinc-600 cursor-not-allowed"
                    )}
                    title="Download Litematica Schematic"
                >
                    <Download size={18} />
                </button>

                <button onClick={onClearImage} className="p-2 hover:bg-red-900/50 hover:text-red-400 rounded text-zinc-300 ml-2">
                    <X size={18} />
                </button>
            </div>

            {isProcessing && (
                <div className="absolute top-4 right-4 z-30 bg-zinc-900/90 backdrop-blur-md px-3 py-1.5 rounded-full border border-yellow-500/30 flex items-center gap-2 shadow-lg animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="animate-spin rounded-full h-3 w-3 border-2 border-yellow-500 border-t-transparent"></div>
                    <span className="text-yellow-500 text-xs font-medium">Processing...</span>
                </div>
            )}
        </>
    );
};
