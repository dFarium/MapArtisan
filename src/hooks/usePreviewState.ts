import { useCallback, useState } from 'react';

/** Owns the source and processed ImageData references displayed by the builder. */
export const usePreviewState = () => {
    const [sourcePreviewImageData, setSourcePreviewImageData] = useState<ImageData | null>(null);
    const [previewImageData, setPreviewImageData] = useState<ImageData | null>(null);
    const [sourceImageVersion, setSourceImageVersion] = useState(0);

    const incrementSourceImageVersion = useCallback(() => {
        setSourceImageVersion(version => version + 1);
    }, []);

    const clearAll = useCallback(() => {
        setSourcePreviewImageData(null);
        setPreviewImageData(null);
        // Keep the version monotonic so a new image cannot match stale worker data.
        setSourceImageVersion(version => version + 1);
    }, []);

    return {
        sourcePreviewImageData,
        previewImageData,
        sourceImageVersion,
        setSourcePreviewImageData,
        setPreviewImageData,
        incrementSourceImageVersion,
        clearAll,
    };
};
