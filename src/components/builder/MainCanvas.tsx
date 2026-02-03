import { useState, useRef, useEffect } from 'react';
import { useMapart } from '../../context/MapartContext';
import { useCanvasInteraction } from '../../hooks/useCanvasInteraction';
import { type useMapartWorker } from '../../hooks/useMapartWorker';
import { CanvasStatusBar } from './canvas/CanvasStatusBar';
import { CanvasToolbar } from './canvas/CanvasToolbar';
import { ImageUploader } from './canvas/ImageUploader';
import { ManualEditsOverlay } from './canvas/ManualEditsOverlay';
import { PixelGridOverlay } from './canvas/PixelGridOverlay';
import { InteractionLayer } from './canvas/InteractionLayer';

// ... imports
import { Mapart3DPreview } from './3d/Mapart3DPreview';

interface MainCanvasProps {
    workerState: ReturnType<typeof useMapartWorker>;
}

export const MainCanvas = ({ workerState }: MainCanvasProps) => {
    const {
        uploadedImage, setUploadedImage, previewUrl, gridDimensions,
        selectedPaletteItems,
        mapartStats,
        blockSupport
    } = useMapart();

    // Use passed worker state
    const {
        isProcessing,
        scaledPreviewUrl,
        toneMap,
        originalTransformedUrl,
        mapartResolution,
        isExporting,
        exportMapart,
        pickBlock
    } = workerState;

    // We need access to imageData and toneMap for proper 3D preview.
    // workerState exposes specific things, let's see what we can use.
    // If workerState doesn't expose imageData, we might need to rely on the previewUrl (which is just an image).
    // But for 3D heights we need the raw data.
    // The worker *does* stick the result in `lastBaseResult` inside the worker, but we need it here.
    // `useMapartWorker` might need to expose the raw ImageData or at least the `stats` (which we have via store).
    // mapartStats has `heightMap` (Int32Array).

    // We also need the pixel data. `scaledPreviewUrl` is a blob URL.
    // We can load it into an ImageData object or ImageBitmap.

    // For now, let's assume we can get the necessary data.
    // The `useMapartWorker` likely needs to return the `rawImageData` if we want to be precise.
    // Or we can construct it from the image element?
    // Let's use a ref to the preview image to extract data if needed, or update useMapartWorker to expose it.

    // Actually, `Mapart3DPreview` expects `ImageData`.
    // Let's create a helper to extracting ImageData from the preview image when 3D mode is toggled?
    // Or just pass the stats?

    const [is3DMode, setIs3DMode] = useState(false);
    const [previewImageData, setPreviewImageData] = useState<ImageData | null>(null);

    // Sync preview image data when entering 3D mode
    // This is a bit hacky but avoids transfering huge data from worker if not needed.
    // We can read from the canvas or image element.

    const updatePreviewData = () => {
        // Create a temporary canvas to read pixel data from the preview URL
        if (!scaledPreviewUrl) return;
        const img = new Image();
        img.src = scaledPreviewUrl;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = mapartResolution.width;
            canvas.height = mapartResolution.height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(img, 0, 0);
                const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
                setPreviewImageData(data);
            }
        }
    };

    // Toggle handler
    const handleToggle3D = () => {
        if (!is3DMode) {
            updatePreviewData();
        }
        setIs3DMode(!is3DMode);
    };

    // Reactivity: If we are in 3D mode, and the preview URL changes (e.g. palette change),
    // we must update the imageData so the 3D model reflects the new state (e.g. cleared edits).
    // Debounced to avoid expensive geometry recalculation during rapid edits.
    const debounce3DRef = useRef<number | null>(null);

    useEffect(() => {
        if (is3DMode && scaledPreviewUrl) {
            // Clear previous timeout
            if (debounce3DRef.current !== null) {
                clearTimeout(debounce3DRef.current);
            }

            // Debounce by 150ms
            debounce3DRef.current = window.setTimeout(() => {
                updatePreviewData();
            }, 150);

            return () => {
                if (debounce3DRef.current !== null) {
                    clearTimeout(debounce3DRef.current);
                }
            };
        }
    }, [scaledPreviewUrl, is3DMode]);


    const isPainting = useMapart(s => s.isPainting);

    const containerRef = useRef<HTMLDivElement>(null);
    const imageRef = useRef<HTMLImageElement>(null);

    // UI State (Moved up for calc)
    const [showPreview, setShowPreview] = useState(true);

    // Calculate total layout dimensions for centering
    // We assume both will be shown if showPreview is true
    // Gap: 16px (gap-4)
    const contentWidth = showPreview ? (mapartResolution.width * 2 + 16) : mapartResolution.width;
    const contentHeight = mapartResolution.height;

    const {
        scale,
        setScale,
        position,
        isDragging,
        handleWheel,
        handleMouseDown: handleCanvasMouseDown,
        handleMouseMove: handleCanvasMouseMove,
        handleMouseUp
    } = useCanvasInteraction(
        uploadedImage,
        isPainting,
        containerRef as any,
        { width: contentWidth, height: contentHeight }
    );

    // Context Menu prevent
    const handleContextMenu = (e: React.MouseEvent) => {
        if (isPainting) {
            e.preventDefault();
        }
    };

    const handleExportSchematic = () => {
        if (!scaledPreviewUrl || isExporting) return;

        exportMapart(
            `mapart_${gridDimensions.x}x${gridDimensions.y}.litematic`,
            {
                author: 'mapart-creator',
                name: `MapArt ${gridDimensions.x}x${gridDimensions.y}`,
                description: `MapArt schematic generated by mapart-creator`
            }
        );
    };

    const handleDownloadPreview = () => {
        if (!scaledPreviewUrl) return;
        const link = document.createElement('a');
        link.href = scaledPreviewUrl;
        link.download = `mapart_preview_${gridDimensions.x}x${gridDimensions.y}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const hasSelection = Object.values(selectedPaletteItems).some(v => v !== null);

    return (
        <div
            className="flex-1 h-full relative bg-zinc-800 overflow-hidden flex flex-col"
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleMouseUp}
            onContextMenu={handleContextMenu}
        >
            {uploadedImage ? (
                <>
                    <CanvasToolbar
                        scale={scale}
                        setScale={setScale}
                        isDragging={isDragging}
                        showPreview={showPreview}
                        setShowPreview={setShowPreview}
                        onToggle3D={handleToggle3D}
                        is3DMode={is3DMode}
                        onExport={handleExportSchematic}
                        canExport={!!scaledPreviewUrl && hasSelection}
                        onClearImage={() => setUploadedImage(null)}
                        isProcessing={isProcessing}
                        isExporting={isExporting}
                        onDownloadPreview={handleDownloadPreview}
                        canDownloadPreview={!!scaledPreviewUrl}
                        isPainting={isPainting}
                    />

                    <CanvasStatusBar
                        mapartResolution={mapartResolution}
                        gridDimensions={gridDimensions}
                        mapartStats={mapartStats}
                    />

                    {is3DMode ? (
                        <div className="flex-1 relative z-10 w-full h-full">
                            <Mapart3DPreview
                                imageData={previewImageData}
                                blockSupport={blockSupport}
                                stats={mapartStats || undefined}
                                toneMap={toneMap || undefined}
                            // We are passing stats (which has heightMap) and imageData (colors).
                            // But note: stats.heightMap is column-based max range, NOT per-pixel Y.
                            // Mapart3DPreview currently re-calculates/estimates.
                            // Ideally we should pass the toneMap too if we want perfect 3D.
                            // But fetching toneMap from worker is heavy (Int8Array size of image).
                            // For now, let's see if Mapart3DPreview can work with what we have.
                            />
                        </div>
                    ) : (
                        /* Canvas Area */
                        <div
                            ref={containerRef}
                            className="flex-1 overflow-hidden cursor-move bg-zinc-800 bg-[radial-gradient(#333_1px,transparent_1px)] bg-[size:20px_20px]"
                            onWheel={handleWheel}
                            onMouseDown={handleCanvasMouseDown}
                        >
                            {/* ... Original Content in Canvas Area ... */}
                            <div
                                style={{
                                    transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                                    transition: isDragging ? 'none' : 'transform 0.1s ease-out'
                                }}
                                className="origin-top-left shadow-2xl flex gap-4 w-fit"
                            >
                                {/* Original Image */}
                                <div className="relative">
                                    <div className="absolute -top-6 left-0 text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Original</div>
                                    <img
                                        ref={imageRef}
                                        src={originalTransformedUrl || previewUrl!}
                                        alt="Original"
                                        className="max-w-none pointer-events-none select-none ring-1 ring-zinc-600 rendering-pixelated"
                                        draggable={false}
                                        style={{
                                            width: mapartResolution.width,
                                            height: mapartResolution.height,
                                            imageRendering: 'auto'
                                        }}
                                    />
                                </div>

                                {/* Mapart Preview */}
                                {showPreview && scaledPreviewUrl && (
                                    <div className="relative group">

                                        {/* Interaction Layer (Painting, Hover) - Isolated Render */}
                                        <InteractionLayer
                                            width={mapartResolution.width}
                                            height={mapartResolution.height}
                                            scale={scale}
                                            onPickBlock={pickBlock}
                                        />

                                        {/* Manual Edits Visual Layer */}
                                        <div className="absolute inset-0 z-20 pointer-events-none">
                                            <ManualEditsOverlay
                                                width={mapartResolution.width}
                                                height={mapartResolution.height}
                                            />
                                        </div>

                                        <div className="absolute -top-6 left-0 text-[10px] uppercase tracking-wider text-green-500 font-semibold">Mapart Preview</div>
                                        <img
                                            src={scaledPreviewUrl}
                                            alt="Mapart Preview"
                                            className="max-w-none pointer-events-none select-none ring-1 ring-green-600/50 rendering-pixelated"
                                            draggable={false}
                                            style={{
                                                width: mapartResolution.width,
                                                height: mapartResolution.height,
                                                imageRendering: 'pixelated'
                                            }}
                                        />

                                        {/* Optimized Pixel Grid */}
                                        <PixelGridOverlay
                                            scale={scale}
                                            isVisible={scale > 7 && isPainting}
                                        />

                                        {/* Chunk Grid Overlay (128x128) */}
                                        <div
                                            className="absolute inset-0 pointer-events-none select-none z-10"
                                            style={{
                                                backgroundImage: `
                                                    linear-gradient(to right, rgba(255,255,255,0.2) 1px, transparent 1px),
                                                    linear-gradient(to bottom, rgba(255,255,255,0.2) 1px, transparent 1px)
                                                `,
                                                backgroundSize: `${128}px ${128}px`
                                            }}
                                        />

                                        {/* Coordinates Overlay */}
                                        {(gridDimensions.x > 1 || gridDimensions.y > 1) && (
                                            <div className="absolute inset-0 pointer-events-none z-10">
                                                {Array.from({ length: gridDimensions.y }).map((_, y) => (
                                                    Array.from({ length: gridDimensions.x }).map((_, x) => (
                                                        <div
                                                            key={`${x}-${y}`}
                                                            className="absolute text-[10px] font-mono font-bold text-white/50 select-none flex items-start justify-start p-1"
                                                            style={{
                                                                left: x * 128,
                                                                top: y * 128,
                                                                width: 128,
                                                                height: 128,
                                                                textShadow: '0 1px 2px rgba(0,0,0,0.8)'
                                                            }}
                                                        >
                                                            {x},{y}
                                                        </div>
                                                    ))
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </>
            ) : (
                <ImageUploader
                    onUpload={setUploadedImage}
                    gridDimensions={gridDimensions}
                    mapartResolution={{
                        width: 128 * gridDimensions.x,
                        height: 128 * gridDimensions.y
                    }}
                />
            )}
        </div>
    );
};
