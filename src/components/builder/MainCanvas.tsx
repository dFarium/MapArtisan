import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, ZoomIn, ZoomOut, Move, Grid3X3 } from 'lucide-react';
import { useMapart } from '../../context/MapartContext';
import { processMapart, processMapartExperimental, type DitheringMode } from '../../utils/mapartProcessing';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const MainCanvas = () => {
    const {
        uploadedImage, setUploadedImage, previewUrl, gridDimensions,
        imageFitMode, cropSettings, buildMode, selectedPaletteItems, threeDPrecision, dithering, useCielab
    } = useMapart();
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [showPreview, setShowPreview] = useState(true);
    const imageRef = useRef<HTMLImageElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [scaledPreviewUrl, setScaledPreviewUrl] = useState<string | null>(null);
    const [experimentalPreviewUrl, setExperimentalPreviewUrl] = useState<string | null>(null);
    const [showExperimental, setShowExperimental] = useState(true);

    // Calculate mapart resolution based on grid dimensions
    const mapartResolution = useMemo(() => ({
        width: 128 * gridDimensions.x,
        height: 128 * gridDimensions.y
    }), [gridDimensions]);

    // Generate scaled preview when image or grid changes
    useEffect(() => {
        if (!previewUrl) {
            setScaledPreviewUrl(null);
            return;
        }

        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = mapartResolution.width;
            canvas.height = mapartResolution.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            // Disable smoothing for pixelated effect
            ctx.imageSmoothingEnabled = false;

            if (imageFitMode === 'adjust') {
                // Stretch to fit (may distort aspect ratio)
                ctx.drawImage(img, 0, 0, mapartResolution.width, mapartResolution.height);
            } else {
                // Crop mode with custom zoom and offset
                const { zoom, offsetX, offsetY } = cropSettings;

                // Calculate base crop region (what fits at zoom=1)
                const imgAspect = img.width / img.height;
                const canvasAspect = mapartResolution.width / mapartResolution.height;

                let baseWidth, baseHeight;
                if (imgAspect > canvasAspect) {
                    baseHeight = img.height;
                    baseWidth = img.height * canvasAspect;
                } else {
                    baseWidth = img.width;
                    baseHeight = img.width / canvasAspect;
                }

                // Apply zoom (smaller region = more zoom)
                const zoomedWidth = baseWidth / zoom;
                const zoomedHeight = baseHeight / zoom;

                // Calculate offset range and apply offset
                const maxOffsetX = (img.width - zoomedWidth) / 2;
                const maxOffsetY = (img.height - zoomedHeight) / 2;
                const finalOffsetX = (img.width - zoomedWidth) / 2 + offsetX * maxOffsetX;
                const finalOffsetY = (img.height - zoomedHeight) / 2 + offsetY * maxOffsetY;

                ctx.drawImage(
                    img,
                    finalOffsetX, finalOffsetY, zoomedWidth, zoomedHeight,
                    0, 0, mapartResolution.width, mapartResolution.height
                );
            }

            // Apply color mapping if any colors are selected
            const hasSelection = Object.values(selectedPaletteItems).some(v => v !== null);
            if (hasSelection) {
                const imageData = ctx.getImageData(0, 0, mapartResolution.width, mapartResolution.height);
                const processedData = processMapart(
                    imageData,
                    buildMode,
                    selectedPaletteItems,
                    threeDPrecision,
                    dithering as DitheringMode,
                    useCielab
                );
                ctx.putImageData(processedData, 0, 0);
            }

            setScaledPreviewUrl(canvas.toDataURL('image/png'));

            // Also generate experimental preview
            if (hasSelection) {
                const canvas2 = document.createElement('canvas');
                canvas2.width = mapartResolution.width;
                canvas2.height = mapartResolution.height;
                const ctx2 = canvas2.getContext('2d');
                if (ctx2) {
                    ctx2.imageSmoothingEnabled = false;
                    if (imageFitMode === 'adjust') {
                        ctx2.drawImage(img, 0, 0, mapartResolution.width, mapartResolution.height);
                    } else {
                        const { zoom, offsetX, offsetY } = cropSettings;
                        const imgAspect = img.width / img.height;
                        const canvasAspect = mapartResolution.width / mapartResolution.height;
                        let baseWidth, baseHeight;
                        if (imgAspect > canvasAspect) {
                            baseHeight = img.height;
                            baseWidth = img.height * canvasAspect;
                        } else {
                            baseWidth = img.width;
                            baseHeight = img.width / canvasAspect;
                        }
                        const zoomedWidth = baseWidth / zoom;
                        const zoomedHeight = baseHeight / zoom;
                        const maxOffsetX = (img.width - zoomedWidth) / 2;
                        const maxOffsetY = (img.height - zoomedHeight) / 2;
                        const finalOffsetX = (img.width - zoomedWidth) / 2 + offsetX * maxOffsetX;
                        const finalOffsetY = (img.height - zoomedHeight) / 2 + offsetY * maxOffsetY;
                        ctx2.drawImage(img, finalOffsetX, finalOffsetY, zoomedWidth, zoomedHeight, 0, 0, mapartResolution.width, mapartResolution.height);
                    }
                    const imageData2 = ctx2.getImageData(0, 0, mapartResolution.width, mapartResolution.height);
                    const experimentalData = processMapartExperimental(
                        imageData2,
                        buildMode,
                        selectedPaletteItems,
                        threeDPrecision,
                        dithering as DitheringMode,
                        useCielab
                    );
                    ctx2.putImageData(experimentalData, 0, 0);
                    setExperimentalPreviewUrl(canvas2.toDataURL('image/png'));
                }
            } else {
                setExperimentalPreviewUrl(null);
            }
        };
        img.src = previewUrl;
    }, [previewUrl, mapartResolution, imageFitMode, cropSettings, buildMode, selectedPaletteItems, threeDPrecision, dithering, useCielab]);

    const onDrop = useCallback((acceptedFiles: File[]) => {
        if (acceptedFiles.length > 0) {
            const file = acceptedFiles[0];
            setUploadedImage(file);
            // Reset transforms
            setScale(1);
            setPosition({ x: 0, y: 0 });
        }
    }, [setUploadedImage]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'image/png': [],
            'image/jpeg': [],
            'image/webp': []
        },
        maxFiles: 1,
        multiple: false
    });

    const handleWheel = (e: React.WheelEvent) => {
        if (!uploadedImage) return;
        e.preventDefault();
        const delta = e.deltaY * -0.001;
        const newScale = Math.min(Math.max(.1, scale + delta), 5);
        setScale(newScale);
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!uploadedImage || e.button !== 0) return; // Only left click
        setIsDragging(true);
        setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging) return;
        setPosition({
            x: e.clientX - dragStart.x,
            y: e.clientY - dragStart.y
        });
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    // Add styles for dragging when mouse leaves component
    useEffect(() => {
        if (isDragging) {
            const up = () => setIsDragging(false);
            window.addEventListener('mouseup', up);
            return () => window.removeEventListener('mouseup', up);
        }
    }, [isDragging]);

    return (
        <div
            className="flex-1 h-full relative bg-zinc-800 overflow-hidden flex flex-col"
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
        >
            {uploadedImage ? (
                <>
                    {/* Toolbar */}
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
                        <button onClick={() => setUploadedImage(null)} className="p-2 hover:bg-red-900/50 hover:text-red-400 rounded text-zinc-300 ml-2">
                            X
                        </button>
                    </div>

                    {/* Resolution Info */}
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 bg-zinc-900/80 backdrop-blur-sm px-3 py-1.5 rounded-full border border-zinc-700 text-xs text-zinc-400">
                        Mapart: <span className="text-zinc-200 font-mono">{mapartResolution.width} × {mapartResolution.height}</span> px
                        <span className="mx-2 text-zinc-600">|</span>
                        Grid: <span className="text-zinc-200 font-mono">{gridDimensions.x} × {gridDimensions.y}</span> maps
                        {imageFitMode === 'crop' && <span className="ml-2 text-green-400 font-medium">Crop</span>}
                    </div>

                    {/* Canvas Area */}
                    <div
                        ref={containerRef}
                        className="flex-1 flex items-center justify-center overflow-hidden cursor-move bg-zinc-800 bg-[radial-gradient(#333_1px,transparent_1px)] bg-[size:20px_20px]"
                        onWheel={handleWheel}
                        onMouseDown={handleMouseDown}
                    >
                        <div
                            style={{
                                transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                                transition: isDragging ? 'none' : 'transform 0.1s ease-out'
                            }}
                            className="origin-center shadow-2xl flex gap-4"
                        >
                            {/* Original Image */}
                            <div className="relative">
                                <div className="absolute -top-6 left-0 text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Original</div>
                                <img
                                    ref={imageRef}
                                    src={previewUrl!}
                                    alt="Original"
                                    className="max-w-none pointer-events-none select-none border border-zinc-600"
                                    draggable={false}
                                    style={{
                                        width: mapartResolution.width,
                                        height: mapartResolution.height,
                                        objectFit: 'cover'
                                    }}
                                />
                            </div>

                            {/* Mapart Preview */}
                            {showPreview && scaledPreviewUrl && (
                                <div className="relative">
                                    <div className="absolute -top-6 left-0 text-[10px] uppercase tracking-wider text-green-500 font-semibold">Mapart Preview</div>
                                    <img
                                        src={scaledPreviewUrl}
                                        alt="Mapart Preview"
                                        className="max-w-none pointer-events-none select-none border border-green-600/50 rendering-pixelated"
                                        draggable={false}
                                        style={{
                                            width: mapartResolution.width,
                                            height: mapartResolution.height,
                                            imageRendering: 'pixelated'
                                        }}
                                    />
                                    {/* Grid Overlay */}
                                    <div
                                        className="absolute inset-0 pointer-events-none"
                                        style={{
                                            backgroundImage: `
                                                linear-gradient(to right, rgba(255,255,255,0.1) 1px, transparent 1px),
                                                linear-gradient(to bottom, rgba(255,255,255,0.1) 1px, transparent 1px)
                                            `,
                                            backgroundSize: `${128}px ${128}px`
                                        }}
                                    />
                                </div>
                            )}

                            {/* Experimental Preview */}
                            {showExperimental && experimentalPreviewUrl && (
                                <div className="relative">
                                    <div className="absolute -top-6 left-0 text-[10px] uppercase tracking-wider text-orange-500 font-semibold">Experimental</div>
                                    <img
                                        src={experimentalPreviewUrl}
                                        alt="Experimental Preview"
                                        className="max-w-none pointer-events-none select-none border border-orange-600/50 rendering-pixelated"
                                        draggable={false}
                                        style={{
                                            width: mapartResolution.width,
                                            height: mapartResolution.height,
                                            imageRendering: 'pixelated'
                                        }}
                                    />
                                    {/* Grid Overlay */}
                                    <div
                                        className="absolute inset-0 pointer-events-none"
                                        style={{
                                            backgroundImage: `
                                                linear-gradient(to right, rgba(255,150,0,0.15) 1px, transparent 1px),
                                                linear-gradient(to bottom, rgba(255,150,0,0.15) 1px, transparent 1px)
                                            `,
                                            backgroundSize: `${128}px ${128}px`
                                        }}
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Hidden canvas for processing */}
                    <canvas ref={canvasRef} className="hidden" />
                </>
            ) : (
                <div className="flex-1 flex items-center justify-center p-8">
                    <div
                        {...getRootProps()}
                        className={twMerge(
                            "w-full max-w-2xl aspect-square max-h-[600px] border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all",
                            isDragActive
                                ? "border-blue-500 bg-blue-500/10 scale-[1.02]"
                                : "border-zinc-600 hover:border-zinc-500 hover:bg-zinc-700/30"
                        )}
                    >
                        <input {...getInputProps()} />
                        <div className="bg-zinc-700/50 p-6 rounded-full mb-6">
                            <Upload className="w-12 h-12 text-zinc-400" />
                        </div>
                        <h3 className="text-xl font-medium text-zinc-200 mb-2">
                            {isDragActive ? "Drop image here" : "Upload Image"}
                        </h3>
                        <p className="text-zinc-400 text-sm max-w-xs text-center">
                            Drag & drop or click to select.
                            <br />
                            <span className="opacity-70 mt-2 block">Supports PNG, JPG, WEBP</span>
                        </p>
                        <div className="mt-4 text-xs text-zinc-500">
                            Current grid: <span className="text-zinc-300 font-mono">{gridDimensions.x} × {gridDimensions.y}</span> =
                            <span className="text-zinc-300 font-mono ml-1">{mapartResolution.width} × {mapartResolution.height}</span> px
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
