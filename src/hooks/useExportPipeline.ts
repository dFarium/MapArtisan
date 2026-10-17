import { transfer as comlinkTransfer } from 'comlink';
import { useState, useCallback, useRef, useEffect } from 'react';
import type { WorkerRefs, ExportParams, MaterialCounts } from './types';
import { debug } from '../utils/diagnostic';
import { PROCESSING_PROTOCOL_VERSION, type ImageBufferV1 } from '../engine';
import { toProcessingConfig } from './useProcessingPipeline';

export interface UseExportPipelineProps extends WorkerRefs {
    sourceImageDataRef: React.RefObject<ImageData | null>;
    sourceImageVersion: number;
    params: ExportParams;
}

/** Copies the source image into a transferable buffer owned by the worker. */
export function transferableSource(sourceImage: ImageData): ImageBufferV1 {
    const rgba = sourceImage.data.buffer.slice(0);
    return {
        width: sourceImage.width,
        height: sourceImage.height,
        rgba: comlinkTransfer(rgba, [rgba]),
    };
}

/**
 * Hook que maneja operaciones de exportación y cálculo de materiales.
 *
 * Responsabilidades:
 * - Generación de archivos Litematica/NBT
 * - Cálculo de conteo de materiales
 * - Manejo de estado de exportación
 * - Transferencia eficiente de buffers al worker
 */
export function useExportPipeline({
    workerApiRef,
    sourceImageDataRef,
    sourceImageVersion,
    params,
}: UseExportPipelineProps): {
    isExporting: boolean;
    calculateMaterials: () => Promise<MaterialCounts | null>;
    exportMapart: (filename: string, metadata: Record<string, unknown>) => Promise<void>;
} {
    const [isExporting, setIsExporting] = useState(false);

    const paramsRef = useRef(params);

    useEffect(() => {
        paramsRef.current = params;
    }, [params]);

    const calculateMaterials = useCallback(async (): Promise<MaterialCounts | null> => {
        const api = workerApiRef.current;
        const sourceImage = sourceImageDataRef.current;
        if (!sourceImage || !api) return null;

        try {
            const response = await api.calculateMaterialCountsV1({
                protocolVersion: PROCESSING_PROTOCOL_VERSION,
                requestId: Date.now(),
                sourceVersion: sourceImageVersion,
                config: toProcessingConfig(paramsRef.current, sourceImage.width, sourceImage.height),
                source: transferableSource(sourceImage),
                manualEdits: paramsRef.current.manualEdits,
            });
            return response.counts;
        } catch (err) {
            debug.error('Material calculation failed', err);
            return null;
        }
    }, [sourceImageVersion, sourceImageDataRef, workerApiRef]);

    const exportMapart = useCallback(
        async (filename: string, metadata: Record<string, unknown>): Promise<void> => {
            const api = workerApiRef.current;
            const sourceImage = sourceImageDataRef.current;
            if (!sourceImage || !api || isExporting) return;

            setIsExporting(true);
            try {
                const result = await api.generateMapartExportV1({
                    protocolVersion: PROCESSING_PROTOCOL_VERSION,
                    requestId: Date.now(),
                    sourceVersion: sourceImageVersion,
                    config: toProcessingConfig(paramsRef.current, sourceImage.width, sourceImage.height),
                    source: transferableSource(sourceImage),
                    manualEdits: paramsRef.current.manualEdits,
                    filename,
                    metadata,
                });
                const { triggerDownload } = await import('../utils/export');
                triggerDownload(result.blob, result.filename);
            } catch (err) {
                debug.error('Export failed', err);
            } finally {
                setIsExporting(false);
            }
        },
        [sourceImageVersion, isExporting, sourceImageDataRef, workerApiRef]
    );

    return {
        isExporting,
        calculateMaterials,
        exportMapart,
    };
}
