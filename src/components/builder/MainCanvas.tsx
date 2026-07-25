import { useState, useRef, lazy, Suspense } from 'react';
import { useMapartStore as useMapart } from '../../store/useMapartStore';
import { useCanvasInteraction } from '../../hooks/useCanvasInteraction';
import { useCanvasActions } from '../../hooks/useCanvasActions';
import { type useMapartWorker } from '../../hooks/useMapartWorker';
import { CanvasStatusBar } from './canvas/CanvasStatusBar';
import { CanvasToolbar } from './canvas/CanvasToolbar';
import { ImageUploader } from './canvas/ImageUploader';
import { ManualEditsOverlay } from './canvas/ManualEditsOverlay';
import { PixelGridOverlay } from './canvas/PixelGridOverlay';
import { InteractionLayer } from './canvas/InteractionLayer';
import { InteractionHints } from './canvas/InteractionHints';
import { ImageDataCanvas } from './canvas/ImageDataCanvas';

// Lazy load heavy 3D preview
const Mapart3DPreview = lazy(() => import('./3d/Mapart3DPreview').then(m => ({ default: m.Mapart3DPreview })));

interface MainCanvasProps {
    workerState: ReturnType<typeof useMapartWorker>;
}

export const MainCanvas = ({ workerState }: MainCanvasProps) => {
    const {
        uploadedImage, setUploadedImage, gridDimensions,
        selectedPaletteItems,
        mapartStats,
        blockSupport,
        supportBlockId,
        exportMode,
        exportFormat,
        previewSection,
        independentMaps
    } = useMapart();

    // Use passed worker state
    const {
        isProcessing,
        sourcePreviewImageData,
        previewImageData: workerImageData,
        packedResults,
        heightPath,
        mapartResolution,
        isExporting,
        exportMapart,
        pickBlock,
        build3DGeometryAsync
    } = workerState;

    // Canvas actions (export, download, 3D mode)
    const {
        is3DMode,
        debounced3DImageData,
        handleToggle3D,
        handleExportSchematic,
        handleDownloadPreview
    } = useCanvasActions({
        isExporting,
        exportFormat,
        gridDimensions,
        exportMode,
        exportMapart,
        workerImageData
    });


    const isPainting = useMapart(s => s.isPainting);

    const containerRef = useRef<HTMLDivElement>(null);

    // UI State (Moved up for calc)
    const [showOriginal, setShowOriginal] = useState(true);

    // Calculate total layout dimensions for centering
    // We assume both will be shown if showOriginal is true
    // Gap: 16px (gap-4)
    const contentWidth = showOriginal ? (mapartResolution.width * 2 + 16) : mapartResolution.width;
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
        containerRef as React.RefObject<HTMLElement>,
        { width: contentWidth, height: contentHeight }
    );

    // Context Menu prevent
    const handleContextMenu = (e: React.MouseEvent) => {
        if (isPainting) {
            e.preventDefault();
        }
    };

    const hasSelection = Object.values(selectedPaletteItems).some(v => v !== null);

    return (
        <main
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
                        showOriginal={showOriginal}
                        setShowOriginal={setShowOriginal}
                        onToggle3D={handleToggle3D}
                        is3DMode={is3DMode}
                        onExport={handleExportSchematic}
                        canExport={!!workerImageData && hasSelection}
                        onClearImage={() => setUploadedImage(null)}
                        isProcessing={isProcessing}
                        isExporting={isExporting}
                        onDownloadPreview={handleDownloadPreview}
                        canDownloadPreview={!!workerImageData}
                        isPainting={isPainting}
                        exportFormat={exportFormat}
                    />

                    <CanvasStatusBar
                        mapartResolution={mapartResolution}
                        gridDimensions={gridDimensions}
                        mapartStats={mapartStats}
                    />

                    {is3DMode ? (
                        <div className="flex-1 relative z-10 w-full h-full">
                            <Suspense fallback={
                                <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
                                    <div className="flex flex-col items-center gap-3">
                                        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                                        <span className="text-zinc-400 text-sm font-medium">Loading 3D Engine...</span>
                                    </div>
                                </div>
                            }>
                                <Mapart3DPreview
                                    imageData={debounced3DImageData}
                                    blockSupport={blockSupport}
                                    supportBlockId={supportBlockId}
                                    exportMode={exportMode}
                                    independentMaps={independentMaps}
                                    previewSection={previewSection || undefined}
                                    stats={mapartStats || undefined}
                                    packedResults={packedResults || undefined}
                                    heightPath={heightPath || undefined}
                                    build3DGeometryAsync={build3DGeometryAsync}
                                />
                            </Suspense>
                        </div>
                    ) : (
                        /* Canvas Area */
                        <div
                            ref={containerRef}
                            className="flex-1 overflow-hidden cursor-move bg-zinc-800 bg-[radial-gradient(#333_1px,transparent_1px)] bg-size-[20px_20px]"
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
                                {/* ... content ... */}
                                {/* Original Image */}
                                {showOriginal && sourcePreviewImageData && (
                                    <div className="relative">
                                        <div className="absolute -top-6 left-0 text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Original</div>
                                        <ImageDataCanvas
                                            imageData={sourcePreviewImageData}
                                            className="max-w-none pointer-events-none select-none ring-1 ring-zinc-600 rendering-pixelated"
                                            style={{
                                                width: mapartResolution.width,
                                                height: mapartResolution.height,
                                                imageRendering: 'auto'
                                            }}
                                        />
                                    </div>
                                )}

                                {/* Mapart Preview */}
                                {workerImageData && (
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

                                        <div className="absolute -top-6 left-0 text-[10px] uppercase tracking-wider text-green-500 font-semibold">Map Art Preview</div>
                                        <ImageDataCanvas
                                            imageData={workerImageData}
                                            className="max-w-none pointer-events-none select-none ring-1 ring-green-600/50 rendering-pixelated"
                                            style={{
                                                width: mapartResolution.width,
                                                height: mapartResolution.height,
                                                imageRendering: 'pixelated'
                                            }}
                                        />

                                        {/* Optimized Pixel Grid */}
                                        <PixelGridOverlay
                                            scale={scale}
                                            isVisible={scale >= 20 && isPainting}
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

                            {/* Interaction Hints Overlay */}
                            <InteractionHints />
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
        </main>
    );
};
