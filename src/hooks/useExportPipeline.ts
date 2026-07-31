import { transfer as comlinkTransfer } from 'comlink';
import { useState, useCallback, useRef, useEffect } from 'react';
import type { WorkerRefs, ExportParams, MaterialCounts } from './types';
import { debug } from '../utils/diagnostic';
import { PROCESSING_PROTOCOL_VERSION, type CalculateMaterialsRequestV1, type CalculateMaterialsResponseV1, type GenerateExportRequestV1, type GenerateExportResponseV1 } from '../engine';

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
                exportFormat,
                paletteVersion,
            } = paramsRef.current;

            const versionedApi = api as typeof api & {
                calculateMaterialCountsV1?: (request: CalculateMaterialsRequestV1) => Promise<CalculateMaterialsResponseV1>;
            };
            if (versionedApi.calculateMaterialCountsV1) {
                const sourceBuffer = sourceImageDataRef.current.data.buffer.slice(0);
                const response = await versionedApi.calculateMaterialCountsV1({
                    protocolVersion: PROCESSING_PROTOCOL_VERSION,
                    requestId: Date.now(),
                    sourceVersion: currentVersion,
                    config: {
                        width: sourceImageDataRef.current.width,
                        height: sourceImageDataRef.current.height,
                        buildMode,
                        selectedPaletteItems,
                        threeDPrecision,
                        dithering,
                        usePerceptual,
                        hybridStrength,
                        independentMaps,
                        blockSupport,
                        supportBlockId,
                        exportMode,
                        exportFormat,
                        paletteVersion,
                    },
                    source: {
                        width: sourceImageDataRef.current.width,
                        height: sourceImageDataRef.current.height,
                        rgba: comlinkTransfer(sourceBuffer, [sourceBuffer]),
                    },
                    manualEdits,
                });
                return response.counts;
            }

            const counts = await api.calculateMaterialCounts(
                bufferToSend ? comlinkTransfer(bufferToSend, [bufferToSend]) : null,
                sourceImageDataRef.current.width,
                sourceImageDataRef.current.height,
                currentVersion,
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
                exportMode
            );
            return counts;
        } catch (err) {
            debug.error('Material calculation failed', err);
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

                const versionedApi = api as typeof api & {
                    generateMapartExportV1?: (request: GenerateExportRequestV1) => Promise<GenerateExportResponseV1>;
                };
                if (versionedApi.generateMapartExportV1) {
                    const sourceBuffer = sourceImageDataRef.current.data.buffer.slice(0);
                    const result = await versionedApi.generateMapartExportV1({
                        protocolVersion: PROCESSING_PROTOCOL_VERSION,
                        requestId: Date.now(),
                        sourceVersion: currentVersion,
                        config: {
                            width: sourceImageDataRef.current.width,
                            height: sourceImageDataRef.current.height,
                            buildMode,
                            selectedPaletteItems,
                            threeDPrecision,
                            dithering,
                            usePerceptual,
                            hybridStrength,
                            independentMaps,
                            blockSupport,
                            supportBlockId,
                            exportMode,
                            exportFormat,
                            paletteVersion,
                        },
                        source: {
                            width: sourceImageDataRef.current.width,
                            height: sourceImageDataRef.current.height,
                            rgba: comlinkTransfer(sourceBuffer, [sourceBuffer]),
                        },
                        manualEdits,
                        filename,
                        metadata,
                    });
                    const { triggerDownload } = await import('../utils/export');
                    triggerDownload(result.blob, result.filename);
                    return;
                }

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
                    dithering,
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
                debug.error('Export failed', err);
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
