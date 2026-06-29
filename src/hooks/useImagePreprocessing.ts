import { useRef, useEffect } from 'react';
import type { MapartState } from '../store/useMapartStore';

/**
 * Hook para manejar el preprocessing de imágenes.
 * 
 * Responsabilidades:
 * - Carga de imagen desde URL
 * - Aplicación de filtros CSS (brightness, contrast, saturation)
 * - Manejo de crop/zoom
 * - Generación de low-res y high-res previews
 * - Almacenamiento de sourceImageData
 */
export interface UseImagePreprocessingProps {
    previewUrl: string | null;
    mapartResolution: { width: number; height: number };
    imageFitMode: MapartState['imageFitMode'];
    cropSettings: MapartState['cropSettings'];
    imageSettings: MapartState['imageSettings'];
    previewState: {
        setScaledPreviewUrl: (url: string | null) => void;
        setOriginalTransformedUrl: (url: string | null) => void;
        incrementSourceImageVersion: () => void;
    };
}

export interface UseImagePreprocessingReturn {
    sourceImageDataRef: React.MutableRefObject<ImageData | null>;
}

export function useImagePreprocessing({
    previewUrl,
    mapartResolution,
    imageFitMode,
    cropSettings,
    imageSettings,
    previewState: { setScaledPreviewUrl, setOriginalTransformedUrl, incrementSourceImageVersion },
}: UseImagePreprocessingProps): UseImagePreprocessingReturn {
    const sourceImageDataRef = useRef<ImageData | null>(null);
    const highResTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!previewUrl) {
            sourceImageDataRef.current = null;
            return;
        }

        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = mapartResolution.width;
            canvas.height = mapartResolution.height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) return;

            const filterString = `brightness(${100 + imageSettings.brightness}%) contrast(${100 + imageSettings.contrast}%) saturate(${imageSettings.saturation}%)`;
            ctx.filter = filterString;
            ctx.imageSmoothingEnabled = false;

            let finalOffsetX = 0;
            let finalOffsetY = 0;
            let zoomedWidth = mapartResolution.width;
            let zoomedHeight = mapartResolution.height;

            if (imageFitMode === 'adjust') {
                ctx.drawImage(img, 0, 0, mapartResolution.width, mapartResolution.height);
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

                zoomedWidth = baseWidth / zoom;
                zoomedHeight = baseHeight / zoom;

                const maxOffsetX = (img.width - zoomedWidth) / 2;
                const maxOffsetY = (img.height - zoomedHeight) / 2;
                finalOffsetX = (img.width - zoomedWidth) / 2 + offsetX * maxOffsetX;
                finalOffsetY = (img.height - zoomedHeight) / 2 + offsetY * maxOffsetY;

                ctx.drawImage(
                    img,
                    finalOffsetX, finalOffsetY, zoomedWidth, zoomedHeight,
                    0, 0, mapartResolution.width, mapartResolution.height
                );
            }

            // Immediately set the low-resolution preview
            const lowResUrl = canvas.toDataURL('image/png');
            setScaledPreviewUrl(lowResUrl);
            setOriginalTransformedUrl(lowResUrl);

            sourceImageDataRef.current = ctx.getImageData(0, 0, mapartResolution.width, mapartResolution.height);
            incrementSourceImageVersion();

            // Debounce the heavy high-resolution JPEG data URL generation
            if (highResTimeoutRef.current !== null) {
                clearTimeout(highResTimeoutRef.current);
            }
            highResTimeoutRef.current = setTimeout(() => {
                const highResCanvas = document.createElement('canvas');
                if (imageFitMode === 'adjust') {
                    const targetAspect = mapartResolution.width / mapartResolution.height;
                    const highResWidth = Math.min(img.width, 2048);
                    const highResHeight = highResWidth / targetAspect;

                    highResCanvas.width = highResWidth;
                    highResCanvas.height = highResHeight;
                    const highResCtx = highResCanvas.getContext('2d');
                    if (highResCtx) {
                        highResCtx.filter = filterString;
                        highResCtx.drawImage(img, 0, 0, highResWidth, highResHeight);
                    }
                } else {
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
                }
                setOriginalTransformedUrl(highResCanvas.toDataURL('image/jpeg', 0.9));
            }, 250);
        };
        img.src = previewUrl;

        return () => {
            if (highResTimeoutRef.current !== null) {
                clearTimeout(highResTimeoutRef.current);
            }
        };
    }, [previewUrl, mapartResolution.width, mapartResolution.height, imageFitMode, cropSettings, imageSettings, setScaledPreviewUrl, setOriginalTransformedUrl, incrementSourceImageVersion]);

    return {
        sourceImageDataRef,
    };
}
