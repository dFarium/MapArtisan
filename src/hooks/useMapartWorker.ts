import { useCallback, useMemo, useState } from 'react';
import type { MapartState, CropSettings, GridDimensions, ImageSettings } from '../store/useMapartStore';
import type { MapartStats, BrightnessLevel, RGB, BuildMode, ExportFormat } from '../types/mapart';
import { usePreviewState } from './usePreviewState';
import { useWorkerManager } from './useWorkerManager';
import { useImagePreprocessing } from './useImagePreprocessing';
import { useProcessingPipeline } from './useProcessingPipeline';
import { useExportPipeline } from './useExportPipeline';
import { useBlockPicker } from './useBlockPicker';
import { use3DGeometryBuilder } from './use3DGeometryBuilder';
import type { ProcessingResult, ManualEdit } from './types';

export interface UseMapartWorkerProps {
    uploadedImage: File | null;
    previewUrl: string | null;
    gridDimensions: GridDimensions;
    imageFitMode: MapartState['imageFitMode'];
    cropSettings: CropSettings;
    buildMode: BuildMode;
    selectedPaletteItems: Record<number, string | null>;
    threeDPrecision: number;
    dithering: string;
    usePerceptual: boolean;
    hybridStrength: number;
    independentMaps: boolean;
    setMapartStats: (stats: MapartStats | null) => void;
    imageSettings: ImageSettings;
    manualEdits: Record<number, { blockId: string; brightness: BrightnessLevel; rgb: RGB }>;
    blockSupport: 'all' | 'needed' | 'gravity';
    supportBlockId: string;
    exportMode: 'full' | 'sections';
    paletteVersion: string;
    exportFormat: ExportFormat;
}

/**
 * Custom React hook that interfaces with the Web Worker to perform
 * heavy image processing and mapart generation off-thread.
 *
 * It uses Comlink for RPC-like communications and optimizes data transfers
 * by using transferable ArrayBuffers to avoid structured clone overhead.
 *
 * This is a facade hook that composes specialized hooks:
 * - useWorkerManager: Worker lifecycle
 * - usePreviewState: Preview state management
 * - useImagePreprocessing: Image loading and filters
 * - useProcessingPipeline: Heavy + light processing
 * - useExportPipeline: Export and materials
 * - useBlockPicker: Color picker
 * - use3DGeometryBuilder: 3D geometry construction
 */
export const useMapartWorker = ({
    previewUrl,
    gridDimensions,
    imageFitMode,
    cropSettings,
    buildMode,
    selectedPaletteItems,
    threeDPrecision,
    dithering,
    usePerceptual,
    hybridStrength,
    independentMaps,
    setMapartStats,
    imageSettings,
    manualEdits,
    blockSupport,
    supportBlockId,
    exportMode,
    paletteVersion,
    exportFormat,
}: UseMapartWorkerProps) => {
    const { workerApiRef, isProcessingRef, workerImageVersionRef } = useWorkerManager();

    const {
        scaledPreviewUrl, setScaledPreviewUrl,
        originalTransformedUrl, setOriginalTransformedUrl,
        previewImageData, setPreviewImageData,
        sourceImageVersion, incrementSourceImageVersion,
        clearAll: clearPreviewState
    } = usePreviewState();

    const mapartResolution = useMemo(() => ({
        width: 128 * gridDimensions.x,
        height: 128 * gridDimensions.y
    }), [gridDimensions.x, gridDimensions.y]);

    const { sourceImageDataRef } = useImagePreprocessing({
        previewUrl,
        mapartResolution,
        imageFitMode,
        cropSettings,
        imageSettings,
        previewState: {
            setScaledPreviewUrl,
            setOriginalTransformedUrl,
            incrementSourceImageVersion,
        },
    });

    const [prevPreviewUrl, setPrevPreviewUrl] = useState<string | null>(null);
    if (previewUrl !== prevPreviewUrl) {
        setPrevPreviewUrl(previewUrl);
        if (!previewUrl) {
            clearPreviewState();
        }
    }

    const processingParams = useMemo(() => ({
        buildMode,
        selectedPaletteItems,
        threeDPrecision,
        dithering,
        usePerceptual,
        hybridStrength,
        independentMaps,
        manualEdits: manualEdits as Record<number, ManualEdit>,
    }), [buildMode, selectedPaletteItems, threeDPrecision, dithering, usePerceptual, hybridStrength, independentMaps, manualEdits]);

    const handleProcessingResult = useCallback((result: ProcessingResult) => {
        setScaledPreviewUrl(result.blobUrl);
        setPreviewImageData(result.imageData);
    }, [setScaledPreviewUrl, setPreviewImageData]);

    const handleStatsUpdate = useCallback((stats: MapartStats) => {
        setMapartStats(stats);
    }, [setMapartStats]);

    const {
        isProcessing,
        packedResults,
        heightPath,
        setPackedResults,
        setHeightPath,
    } = useProcessingPipeline({
        workerApiRef,
        isProcessingRef,
        workerImageVersionRef,
        sourceImageDataRef,
        sourceImageVersion,
        mapartResolution,
        params: processingParams,
        onResult: handleProcessingResult,
        onStatsUpdate: handleStatsUpdate,
    });

    if (!previewUrl && (packedResults !== null || heightPath !== null)) {
        setPackedResults(null);
        setHeightPath(null);
    }

    const exportParams = useMemo(() => ({
        ...processingParams,
        blockSupport,
        supportBlockId,
        exportMode,
        paletteVersion,
        exportFormat,
    }), [processingParams, blockSupport, supportBlockId, exportMode, paletteVersion, exportFormat]);

    const { isExporting, calculateMaterials, exportMapart } = useExportPipeline({
        workerApiRef,
        isProcessingRef,
        workerImageVersionRef,
        sourceImageDataRef,
        sourceImageVersion,
        params: exportParams,
    });

    const { pickBlock } = useBlockPicker({
        workerApiRef,
        isProcessingRef,
        workerImageVersionRef,
        manualEdits: manualEdits as Record<number, ManualEdit>,
    });

    const { build3DGeometryAsync } = use3DGeometryBuilder(workerApiRef);

    return {
        isProcessing,
        isExporting,
        scaledPreviewUrl,
        previewImageData,
        packedResults,
        heightPath,
        originalTransformedUrl,
        mapartResolution,
        exportMapart,
        calculateMaterials,
        pickBlock,
        build3DGeometryAsync
    };
};
