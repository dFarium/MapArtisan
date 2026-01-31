import { wrap, type Remote } from 'comlink';
import { useState, useRef, useEffect, useCallback } from 'react';
import type { MapartWorkerApi } from '../workers/mapart.worker';
import type { MapartState, CropSettings, BuildMode, GridDimensions, ImageSettings } from '../store/useMapartStore';
import { type DitheringMode, type MapartStats } from '../utils/mapartProcessing';

interface UseMapartWorkerProps {
    uploadedImage: File | null;
    previewUrl: string | null;
    gridDimensions: GridDimensions;
    imageFitMode: MapartState['imageFitMode'];
    cropSettings: CropSettings;
    buildMode: BuildMode;
    selectedPaletteItems: Record<number, string | null>;
    threeDPrecision: number;
    dithering: string;
    useCielab: boolean;
    hybridStrength: number;
    independentMaps: boolean;
    setMapartStats: (stats: MapartStats | null) => void;
    imageSettings: ImageSettings;
}

export const useMapartWorker = ({
    previewUrl,
    gridDimensions,
    imageFitMode,
    cropSettings,
    buildMode,
    selectedPaletteItems,
    threeDPrecision,
    dithering,
    useCielab,
    hybridStrength,
    independentMaps,
    setMapartStats,
    imageSettings
}: UseMapartWorkerProps) => {
    const workerRef = useRef<Worker | null>(null);
    const workerApiRef = useRef<Remote<MapartWorkerApi> | null>(null);
    const sourceImageDataRef = useRef<ImageData | null>(null);

    const [isProcessing, setIsProcessing] = useState(false);
    const [scaledPreviewUrl, setScaledPreviewUrl] = useState<string | null>(null);
    const [originalTransformedUrl, setOriginalTransformedUrl] = useState<string | null>(null);
    const [sourceImageVersion, setSourceImageVersion] = useState(0);

    const mapartResolution = {
        width: 128 * gridDimensions.x,
        height: 128 * gridDimensions.y
    };

    // Initialize worker
    const initWorker = useCallback(() => {
        if (workerRef.current) workerRef.current.terminate();
        workerRef.current = new Worker(new URL('../workers/mapart.worker.ts', import.meta.url), {
            type: 'module'
        });
        workerApiRef.current = wrap<MapartWorkerApi>(workerRef.current);
    }, []);

    useEffect(() => {
        initWorker();
        return () => {
            workerRef.current?.terminate();
        };
    }, [initWorker]);

    // 1. Prepare Image
    useEffect(() => {
        if (!previewUrl) {
            setScaledPreviewUrl(null);
            setOriginalTransformedUrl(null);
            sourceImageDataRef.current = null;
            return;
        }

        const img = new Image();
        img.onload = async () => {
            const canvas = document.createElement('canvas');
            canvas.width = mapartResolution.width;
            canvas.height = mapartResolution.height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) return;

            const filterString = `brightness(${100 + imageSettings.brightness}%) contrast(${100 + imageSettings.contrast}%) saturate(${imageSettings.saturation}%)`;
            ctx.filter = filterString;
            ctx.imageSmoothingEnabled = false;

            if (imageFitMode === 'adjust') {
                ctx.drawImage(img, 0, 0, mapartResolution.width, mapartResolution.height);

                // High res original for display
                const targetAspect = mapartResolution.width / mapartResolution.height;
                const highResWidth = Math.min(img.width, 2048);
                const highResHeight = highResWidth / targetAspect;

                const highResCanvas = document.createElement('canvas');
                highResCanvas.width = highResWidth;
                highResCanvas.height = highResHeight;
                const highResCtx = highResCanvas.getContext('2d');
                if (highResCtx) {
                    highResCtx.filter = filterString;
                    highResCtx.drawImage(img, 0, 0, highResWidth, highResHeight);
                }
                setOriginalTransformedUrl(highResCanvas.toDataURL('image/jpeg', 0.9));

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

                ctx.drawImage(
                    img,
                    finalOffsetX, finalOffsetY, zoomedWidth, zoomedHeight,
                    0, 0, mapartResolution.width, mapartResolution.height
                );

                // High res original logic
                const highResCanvas = document.createElement('canvas');
                highResCanvas.width = zoomedWidth;
                highResCanvas.height = zoomedHeight;
                const highResCtx = highResCanvas.getContext('2d');
                if (highResCtx) {
                    highResCtx.filter = filterString;
                    highResCtx.drawImage(
                        img,
                        finalOffsetX, finalOffsetY, zoomedWidth, zoomedHeight,
                        0, 0, zoomedWidth, zoomedHeight
                    );
                }
                setOriginalTransformedUrl(highResCanvas.toDataURL('image/jpeg', 0.9));
            }

            sourceImageDataRef.current = ctx.getImageData(0, 0, mapartResolution.width, mapartResolution.height);
            setScaledPreviewUrl(canvas.toDataURL('image/png'));
            setSourceImageVersion(v => v + 1);
        };
        img.src = previewUrl;
    }, [previewUrl, mapartResolution.width, mapartResolution.height, imageFitMode, cropSettings, imageSettings]);

    // 2. Process Mapart
    useEffect(() => {
        if (!sourceImageDataRef.current || !workerApiRef.current) return;

        const hasSelection = Object.values(selectedPaletteItems).some(v => v !== null);
        if (!hasSelection) return;

        if (isProcessing) {
            console.debug("Cancelling stale processing task...");
            initWorker();
        }

        setIsProcessing(true);

        const process = async () => {
            try {
                const api = workerApiRef.current;
                if (!api) return;

                const { imageData: processedData, stats } = await api.processMapart(
                    sourceImageDataRef.current!,
                    buildMode,
                    selectedPaletteItems,
                    threeDPrecision,
                    dithering as DitheringMode,
                    useCielab,
                    hybridStrength,
                    independentMaps
                );

                const canvas = document.createElement('canvas');
                canvas.width = mapartResolution.width;
                canvas.height = mapartResolution.height;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.putImageData(processedData, 0, 0);
                    setScaledPreviewUrl(canvas.toDataURL('image/png'));
                    setMapartStats(stats);
                }
            } catch (err) {
                // Ignore errors
            } finally {
                setIsProcessing(false);
            }
        };

        process();
    }, [
        sourceImageVersion,
        buildMode, selectedPaletteItems, threeDPrecision, dithering, useCielab, hybridStrength, independentMaps,
        initWorker, mapartResolution.width, mapartResolution.height
    ]);

    const [isExporting, setIsExporting] = useState(false);

    // ... existing initialization code ...

    const exportMapart = async (
        filename: string,
        metadata: any
    ) => {
        if (!sourceImageDataRef.current || !workerApiRef.current || isExporting) return;

        setIsExporting(true);
        try {
            const api = workerApiRef.current;

            // We need to pass the CURRENT settings, as the closure might be stale if not careful.
            // However, since this function is recreated on every render (if not wrapped in useCallback with deps),
            // or if we rely on refs. For safety, let's assume we pass the latest ref data if needed,
            // but for now, we use the props passed to the hook.

            // Note: ImageData cannot be transferred, so it will be structured-cloned.
            // For very large images, this might be slow, but it's occurring in an async function.

            const result = await api.generateMapartExport(
                sourceImageDataRef.current,
                selectedPaletteItems,
                buildMode,
                filename,
                metadata,
                threeDPrecision,
                dithering as DitheringMode,
                useCielab,
                hybridStrength,
                independentMaps
            );

            // Import dynamically to avoid circular dependencies if any, or just standard import
            const { triggerDownload } = await import('../utils/litematicaExport');
            triggerDownload(result.blob, result.filename);
        } catch (err) {
            console.error("Export failed:", err);
        } finally {
            setIsExporting(false);
        }
    };

    return {
        isProcessing,
        isExporting,
        scaledPreviewUrl,
        originalTransformedUrl,
        mapartResolution,
        exportMapart
    };
};
