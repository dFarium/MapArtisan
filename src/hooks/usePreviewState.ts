import { useState, useCallback } from 'react';

/**
 * Hook para manejar el estado de previews de mapart.
 * 
 * Consolidación del manejo de:
 * - scaledPreviewUrl: URL de la imagen procesada (baja resolución, PNG)
 * - originalTransformedUrl: URL de la imagen original con filtros (alta resolución, JPEG)
 * - previewImageData: ImageData de la imagen procesada
 * - sourceImageVersion: contador de versiones para tracking de cambios
 * 
 * Reemplaza el manejo disperso de estos estados en useMapartWorker.ts.
 */
export const usePreviewState = () => {
    const [scaledPreviewUrl, setScaledPreviewUrl] = useState<string | null>(null);
    const [originalTransformedUrl, setOriginalTransformedUrl] = useState<string | null>(null);
    const [previewImageData, setPreviewImageData] = useState<ImageData | null>(null);
    const [sourceImageVersion, setSourceImageVersion] = useState(0);

    const incrementSourceImageVersion = useCallback(() => {
        setSourceImageVersion(v => v + 1);
    }, []);

    const clearAll = useCallback(() => {
        setScaledPreviewUrl(null);
        setOriginalTransformedUrl(null);
        setPreviewImageData(null);
        setSourceImageVersion(0);
    }, []);

    const clearUrls = useCallback(() => {
        setScaledPreviewUrl(null);
        setOriginalTransformedUrl(null);
    }, []);

    return {
        scaledPreviewUrl,
        originalTransformedUrl,
        previewImageData,
        sourceImageVersion,
        setScaledPreviewUrl,
        setOriginalTransformedUrl,
        setPreviewImageData,
        incrementSourceImageVersion,
        clearAll,
        clearUrls
    };
};
