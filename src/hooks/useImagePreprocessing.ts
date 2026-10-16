import { useEffect, useRef, useState } from 'react';
import type { MapartState } from '../store/useMapartStore';
import { applyImageFiltersInPlace } from '../utils/processing/imageFilters';
import { resampleArea, type ResamplingMode, type SourceRect } from '../utils/processing/resample';

/**
 * Largest source kept in memory for smooth resampling (32 MB of RGBA). Bigger
 * photos are first shrunk by the browser to fit, then area-averaged exactly.
 */
const MAX_SOURCE_PIXELS = 8 * 1024 * 1024;

/**
 * Handles image decoding, crop/filter preprocessing and the bounded preview used
 * as the worker source. The uploaded image is decoded once per URL, and the
 * resampled image is cached so color filters do not resample again.
 */
export interface UseImagePreprocessingProps {
    previewUrl: string | null;
    mapartResolution: { width: number; height: number };
    imageFitMode: MapartState['imageFitMode'];
    cropSettings: MapartState['cropSettings'];
    imageSettings: MapartState['imageSettings'];
    resampling: ResamplingMode;
    previewState: {
        setSourcePreviewImageData: (imageData: ImageData | null) => void;
        incrementSourceImageVersion: () => void;
    };
}

export interface UseImagePreprocessingReturn {
    sourceImageDataRef: React.RefObject<ImageData | null>;
}

/** Part of the image that fills the map, in source image pixels. */
function sourceRect(
    image: HTMLImageElement,
    resolution: { width: number; height: number },
    imageFitMode: MapartState['imageFitMode'],
    { zoom, offsetX, offsetY }: MapartState['cropSettings'],
): SourceRect {
    if (imageFitMode === 'adjust') {
        return { x: 0, y: 0, width: image.width, height: image.height };
    }

    const imageAspect = image.width / image.height;
    const canvasAspect = resolution.width / resolution.height;
    let baseWidth: number;
    let baseHeight: number;
    if (imageAspect > canvasAspect) {
        baseHeight = image.height;
        baseWidth = image.height * canvasAspect;
    } else {
        baseWidth = image.width;
        baseHeight = image.width / canvasAspect;
    }

    const width = baseWidth / zoom;
    const height = baseHeight / zoom;
    const maxOffsetX = (image.width - width) / 2;
    const maxOffsetY = (image.height - height) / 2;
    return {
        x: (image.width - width) / 2 + offsetX * maxOffsetX,
        y: (image.height - height) / 2 + offsetY * maxOffsetY,
        width,
        height,
    };
}

export function useImagePreprocessing({
    previewUrl,
    mapartResolution,
    imageFitMode,
    cropSettings,
    imageSettings,
    resampling,
    previewState: { setSourcePreviewImageData, incrementSourceImageVersion },
}: UseImagePreprocessingProps): UseImagePreprocessingReturn {
    const sourceImageDataRef = useRef<ImageData | null>(null);
    const loadedImageRef = useRef<HTMLImageElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    /** Decoded source pixels for smooth resampling, and their scale against the image. */
    const sourcePixelsRef = useRef<{ imageData: ImageData; scale: number } | null>(null);
    /** Latest resampled image before color filters, keyed by everything that shapes it. */
    const resampledRef = useRef<{ key: string; imageData: ImageData } | null>(null);
    const [imageLoadVersion, setImageLoadVersion] = useState(0);
    const { width: targetWidth, height: targetHeight } = mapartResolution;

    useEffect(() => {
        sourceImageDataRef.current = null;
        loadedImageRef.current = null;
        sourcePixelsRef.current = null;
        resampledRef.current = null;
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

            const width = targetWidth;
            const height = targetHeight;
            const key = JSON.stringify([imageLoadVersion, width, height, imageFitMode, cropSettings, resampling]);
            let resampled = resampledRef.current?.key === key ? resampledRef.current.imageData : null;

            if (!resampled) {
                const canvas = canvasRef.current ?? document.createElement('canvas');
                canvasRef.current = canvas;
                const context = canvas.getContext('2d', { willReadFrequently: true });
                if (!context) return;
                // Keep CanvasFilter away from the decoded source.
                // Filters run in-place over the bounded output ImageData instead.
                context.filter = 'none';
                const rect = sourceRect(loadedImage, { width, height }, imageFitMode, cropSettings);

                if (resampling === 'sharp') {
                    if (canvas.width !== width || canvas.height !== height) {
                        canvas.width = width;
                        canvas.height = height;
                    }
                    context.imageSmoothingEnabled = false;
                    context.drawImage(loadedImage, rect.x, rect.y, rect.width, rect.height, 0, 0, width, height);
                    resampled = context.getImageData(0, 0, width, height);
                } else {
                    let source = sourcePixelsRef.current;
                    if (!source) {
                        const scale = Math.min(1, Math.sqrt(MAX_SOURCE_PIXELS / (loadedImage.width * loadedImage.height)));
                        const decodedWidth = Math.max(1, Math.round(loadedImage.width * scale));
                        const decodedHeight = Math.max(1, Math.round(loadedImage.height * scale));
                        canvas.width = decodedWidth;
                        canvas.height = decodedHeight;
                        context.imageSmoothingEnabled = true;
                        context.imageSmoothingQuality = 'high';
                        context.drawImage(loadedImage, 0, 0, decodedWidth, decodedHeight);
                        source = {
                            imageData: context.getImageData(0, 0, decodedWidth, decodedHeight),
                            scale: decodedWidth / loadedImage.width,
                        };
                        sourcePixelsRef.current = source;
                        // The pixels now live in the ImageData; release the canvas backing store.
                        canvas.width = 0;
                        canvas.height = 0;
                    }
                    const { scale } = source;
                    resampled = resampleArea(
                        source.imageData,
                        { x: rect.x * scale, y: rect.y * scale, width: rect.width * scale, height: rect.height * scale },
                        width,
                        height,
                    );
                }
                resampledRef.current = { key, imageData: resampled };
            }

            // Filters mutate their input; the cached resample must stay untouched.
            const sourceImageData = applyImageFiltersInPlace(
                new ImageData(new Uint8ClampedArray(resampled.data), width, height),
                imageSettings,
            );

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
        targetWidth,
        targetHeight,
        imageFitMode,
        cropSettings,
        imageSettings,
        resampling,
        setSourcePreviewImageData,
        incrementSourceImageVersion,
    ]);

    useEffect(() => () => {
        loadedImageRef.current = null;
        sourcePixelsRef.current = null;
        resampledRef.current = null;
        if (canvasRef.current) {
            canvasRef.current.width = 0;
            canvasRef.current.height = 0;
            canvasRef.current = null;
        }
    }, []);

    return { sourceImageDataRef };
}
