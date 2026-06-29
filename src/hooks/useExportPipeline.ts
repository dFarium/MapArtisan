import { transfer as comlinkTransfer } from 'comlink';
import { useState, useCallback, useRef, useEffect } from 'react';
import type { WorkerRefs, ExportParams, MaterialCounts } from './types';
import type { DitheringMode } from '../utils/processing';

export interface UseExportPipelineProps extends WorkerRefs {
    sourceImageDataRef: React.RefObject<ImageData | null>;
    sourceImageVersion: number;
    params: ExportParams;
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
    workerImageVersionRef,
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
        if (!sourceImageDataRef.current || !workerApiRef.current) return null;

        try {
            const api = workerApiRef.current;
            const currentVersion = sourceImageVersion;
            const needsBuffer = workerImageVersionRef.current !== currentVersion;

            const bufferToSend = needsBuffer ? sourceImageDataRef.current.data.buffer.slice(0) : null;

            const {
                selectedPaletteItems,
                buildMode,
                threeDPrecision,
                dithering,
                usePerceptual,
                hybridStrength,
                independentMaps,
                manualEdits,
                blockSupport,
                supportBlockId,
                exportMode,
            } = paramsRef.current;

            const counts = await api.calculateMaterialCounts(
                bufferToSend ? comlinkTransfer(bufferToSend, [bufferToSend]) : null,
                sourceImageDataRef.current.width,
                sourceImageDataRef.current.height,
                currentVersion,
                selectedPaletteItems,
                buildMode,
                threeDPrecision,
                dithering as DitheringMode,
                usePerceptual,
                hybridStrength,
                independentMaps,
                manualEdits,
                blockSupport,
                supportBlockId,
                exportMode
            );
            return counts;
        } catch (err) {
            console.error('Material calculation failed:', err);
            return null;
        }
    }, [sourceImageVersion, sourceImageDataRef, workerApiRef, workerImageVersionRef]);

    const exportMapart = useCallback(
        async (filename: string, metadata: Record<string, unknown>): Promise<void> => {
            if (!sourceImageDataRef.current || !workerApiRef.current || isExporting) return;

            setIsExporting(true);
            try {
                const api = workerApiRef.current;
                const currentVersion = sourceImageVersion;
                const needsBuffer = workerImageVersionRef.current !== currentVersion;

                const bufferToSend = needsBuffer ? sourceImageDataRef.current.data.buffer.slice(0) : null;

                const {
                    selectedPaletteItems,
                    buildMode,
                    threeDPrecision,
                    dithering,
                    usePerceptual,
                    hybridStrength,
                    independentMaps,
                    manualEdits,
                    blockSupport,
                    supportBlockId,
                    exportMode,
                    paletteVersion,
                    exportFormat,
                } = paramsRef.current;

                const result = await api.generateMapartExport(
                    bufferToSend ? comlinkTransfer(bufferToSend, [bufferToSend]) : null,
                    sourceImageDataRef.current.width,
                    sourceImageDataRef.current.height,
                    currentVersion,
                    selectedPaletteItems,
                    buildMode,
                    filename,
                    metadata,
                    threeDPrecision,
                    dithering as DitheringMode,
                    usePerceptual,
                    hybridStrength,
                    independentMaps,
                    manualEdits,
                    blockSupport,
                    supportBlockId,
                    exportMode,
                    paletteVersion,
                    exportFormat
                );

                const { triggerDownload } = await import('../utils/export');
                triggerDownload(result.blob, result.filename);
            } catch (err) {
                console.error('Export failed:', err);
            } finally {
                setIsExporting(false);
            }
        },
        [sourceImageVersion, isExporting, sourceImageDataRef, workerApiRef, workerImageVersionRef]
    );

    return {
        isExporting,
        calculateMaterials,
        exportMapart,
    };
}
