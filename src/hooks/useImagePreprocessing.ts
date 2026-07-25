import { useEffect, useRef, useState } from 'react';
import type { MapartState } from '../store/useMapartStore';
import { applyImageFiltersInPlace } from '../utils/processing/imageFilters';

/**
 * Handles image decoding, crop/filter preprocessing and the bounded preview used
 * as the worker source. The uploaded image is decoded once per URL.
 */
export interface UseImagePreprocessingProps {
    previewUrl: string | null;
    mapartResolution: { width: number; height: number };
    imageFitMode: MapartState['imageFitMode'];
    cropSettings: MapartState['cropSettings'];
    imageSettings: MapartState['imageSettings'];
    previewState: {
        setSourcePreviewImageData: (imageData: ImageData | null) => void;
        incrementSourceImageVersion: () => void;
    };
}

export interface UseImagePreprocessingReturn {
    sourceImageDataRef: React.RefObject<ImageData | null>;
}

export function useImagePreprocessing({
    previewUrl,
    mapartResolution,
    imageFitMode,
    cropSettings,
    imageSettings,
    previewState: { setSourcePreviewImageData, incrementSourceImageVersion },
}: UseImagePreprocessingProps): UseImagePreprocessingReturn {
    const sourceImageDataRef = useRef<ImageData | null>(null);
    const loadedImageRef = useRef<HTMLImageElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [imageLoadVersion, setImageLoadVersion] = useState(0);

    useEffect(() => {
        sourceImageDataRef.current = null;
        loadedImageRef.current = null;
        if (!previewUrl) {
            if (canvasRef.current) {
                canvasRef.current.width = 0;
                canvasRef.current.height = 0;
            }
            return;
        }

        let active = true;
        const image = new Image();
        image.onload = () => {
            if (!active) return;
            loadedImageRef.current = image;
            setImageLoadVersion(version => version + 1);
        };
        image.src = previewUrl;

        return () => {
            active = false;
            image.onload = null;
            if (!image.complete) image.src = '';
        };
    }, [previewUrl]);

    useEffect(() => {
        const loadedImage = loadedImageRef.current;
        if (!loadedImage || !previewUrl) return;

        sourceImageDataRef.current = null;
        let active = true;
        const preprocessingTimeout = setTimeout(() => {
            if (!active) return;

            const canvas = canvasRef.current ?? document.createElement('canvas');
            canvasRef.current = canvas;
            if (
                canvas.width !== mapartResolution.width ||
                canvas.height !== mapartResolution.height
            ) {
                canvas.width = mapartResolution.width;
                canvas.height = mapartResolution.height;
            }
            const context = canvas.getContext('2d', { willReadFrequently: true });
            if (!context) return;

            // Keep CanvasFilter away from the decoded full-resolution source.
            // Filters run in-place over the bounded output ImageData instead.
            context.filter = 'none';
            context.imageSmoothingEnabled = false;

            if (imageFitMode === 'adjust') {
                context.drawImage(loadedImage, 0, 0, mapartResolution.width, mapartResolution.height);
            } else {
                const { zoom, offsetX, offsetY } = cropSettings;
                const imageAspect = loadedImage.width / loadedImage.height;
                const canvasAspect = mapartResolution.width / mapartResolution.height;

                let baseWidth: number;
                let baseHeight: number;
                if (imageAspect > canvasAspect) {
                    baseHeight = loadedImage.height;
                    baseWidth = loadedImage.height * canvasAspect;
                } else {
                    baseWidth = loadedImage.width;
                    baseHeight = loadedImage.width / canvasAspect;
                }

                const zoomedWidth = baseWidth / zoom;
                const zoomedHeight = baseHeight / zoom;
                const maxOffsetX = (loadedImage.width - zoomedWidth) / 2;
                const maxOffsetY = (loadedImage.height - zoomedHeight) / 2;
                const sourceX = (loadedImage.width - zoomedWidth) / 2 + offsetX * maxOffsetX;
                const sourceY = (loadedImage.height - zoomedHeight) / 2 + offsetY * maxOffsetY;

                context.drawImage(
                    loadedImage,
                    sourceX, sourceY, zoomedWidth, zoomedHeight,
                    0, 0, mapartResolution.width, mapartResolution.height
                );
            }

            const sourceImageData = applyImageFiltersInPlace(context.getImageData(
                0,
                0,
                mapartResolution.width,
                mapartResolution.height
            ), imageSettings);

            if (!active) return;
            sourceImageDataRef.current = sourceImageData;
            setSourcePreviewImageData(sourceImageData);
            incrementSourceImageVersion();
        }, 100);

        return () => {
            active = false;
            clearTimeout(preprocessingTimeout);
        };
    }, [
        imageLoadVersion,
        previewUrl,
        mapartResolution.width,
        mapartResolution.height,
        imageFitMode,
        cropSettings,
        imageSettings,
        setSourcePreviewImageData,
        incrementSourceImageVersion,
    ]);

    useEffect(() => () => {
        loadedImageRef.current = null;
        if (canvasRef.current) {
            canvasRef.current.width = 0;
            canvasRef.current.height = 0;
            canvasRef.current = null;
        }
    }, []);

    return { sourceImageDataRef };
}
