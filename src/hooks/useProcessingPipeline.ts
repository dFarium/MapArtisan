import { transfer as comlinkTransfer } from 'comlink';
import { useState, useEffect, useRef } from 'react';
import type { WorkerRefs, ProcessingResult, ProcessingParams } from './types';
import type { MapartStats } from '../types/mapart';
import { LatestWinsQueue } from './latestWinsQueue';
import { debug } from '../utils/diagnostic';
import { PROCESSING_PROTOCOL_VERSION, type ProcessingConfigV1, type ProcessingResponseV1 } from '../engine';

export function toProcessingConfig(params: ProcessingParams, width: number, height: number): ProcessingConfigV1 {
    return {
        width,
        height,
        buildMode: params.buildMode,
        selectedPaletteItems: params.selectedPaletteItems,
        threeDPrecision: params.threeDPrecision,
        dithering: params.dithering,
        usePerceptual: params.usePerceptual,
        hybridStrength: params.hybridStrength,
        independentMaps: params.independentMaps,
        blockSupport: params.blockSupport ?? 'all',
        supportBlockId: params.supportBlockId ?? 'minecraft:cobblestone',
        exportMode: params.exportMode ?? 'sections',
        exportFormat: params.exportFormat ?? 'litematic',
        paletteVersion: params.paletteVersion ?? '',
    };
}

function responseToProcessingResult(response: ProcessingResponseV1): ProcessingResult {
    return {
        imageData: new ImageData(new Uint8ClampedArray(response.buffers.rgba), response.width, response.height),
        stats: {
            minHeight: response.stats.minHeight,
            maxHeight: response.stats.maxHeight,
            heightMap: new Int32Array(response.stats.heightMap),
        },
        packedResults: new Uint32Array(response.buffers.packedResults),
        heightPath: response.buffers.heightPath ? new Int32Array(response.buffers.heightPath) : null,
    };
}

export interface UseProcessingPipelineProps extends WorkerRefs {
    sourceImageDataRef: React.RefObject<ImageData | null>;
    sourceImageVersion: number;
    mapartResolution: { width: number; height: number };
    params: ProcessingParams;
    onResult: (result: ProcessingResult) => void;
    onStatsUpdate: (stats: MapartStats) => void;
}

const DEBOUNCE_MS = 50;
const EDIT_DEBOUNCE_MS = 50;

/**
 * Hook que coordina el procesamiento pesado (cuantización) y ligero (edits manuales).
 *
 * Responsabilidades:
 * - Heavy processing con debounce cuando cambian parámetros de configuración
 * - Light processing cuando solo cambian los edits manuales
 * - Manejo de cache invalidation via version tracking
 * - Control de concurrencia para evitar resultados obsoletos
 */
export function useProcessingPipeline({
    workerApiRef,
    isProcessingRef,
    workerImageVersionRef,
    sourceImageDataRef,
    sourceImageVersion,
    mapartResolution,
    params,
    onResult,
    onStatsUpdate,
}: UseProcessingPipelineProps): {
    isProcessing: boolean;
    packedResults: Uint32Array | null;
    heightPath: Int32Array | null;
    setPackedResults: (results: Uint32Array | null) => void;
    setHeightPath: (path: Int32Array | null) => void;
} {
    const [isProcessing, setIsProcessing] = useState(false);
    const [packedResults, setPackedResults] = useState<Uint32Array | null>(null);
    const [heightPath, setHeightPath] = useState<Int32Array | null>(null);

    const onResultRef = useRef(onResult);
    const onStatsUpdateRef = useRef(onStatsUpdate);
    const paramsRef = useRef(params);
    const processingRequestIdRef = useRef(0);
    const editsRequestIdRef = useRef(0);
    const editsQueueRef = useRef<Promise<void>>(Promise.resolve());
    const [heavyQueue] = useState(() => new LatestWinsQueue());

    useEffect(() => {
        onResultRef.current = onResult;
    }, [onResult]);

    useEffect(() => {
        onStatsUpdateRef.current = onStatsUpdate;
    }, [onStatsUpdate]);

    useEffect(() => {
        paramsRef.current = params;
    }, [params]);

    useEffect(() => {
        const requestId = ++processingRequestIdRef.current;

        if (!sourceImageDataRef.current || !workerApiRef.current) {
            isProcessingRef.current = false;
            setIsProcessing(false);
            return;
        }

        let active = true;

        const timerId = setTimeout(() => {
            const hasSelection = Object.values(paramsRef.current.selectedPaletteItems).some(v => v !== null);
            if (!hasSelection) {
                heavyQueue.clearPending();
                if (processingRequestIdRef.current === requestId) {
                    isProcessingRef.current = false;
                    setIsProcessing(false);
                }
                return;
            }

            const process = async () => {
                const startTime = performance.now();
                isProcessingRef.current = true;
                setIsProcessing(true);

                try {
                    const api = workerApiRef.current;
                    const sourceImage = sourceImageDataRef.current;
                    if (!api || !sourceImage) return;

                    const currentVersion = sourceImageVersion;
                    // The v1 base cache is keyed by sourceVersion + every
                    // processing parameter, so a slider change needs the
                    // source even when sourceVersion stayed the same.
                    const sourceBuffer = sourceImage.data.buffer.slice(0);
                    const response = await api.processV1({
                        protocolVersion: PROCESSING_PROTOCOL_VERSION,
                        requestId,
                        sourceVersion: currentVersion,
                        config: toProcessingConfig(paramsRef.current, sourceImage.width, sourceImage.height),
                        source: {
                            width: sourceImage.width,
                            height: sourceImage.height,
                            rgba: comlinkTransfer(sourceBuffer, [sourceBuffer]),
                        },
                        manualEdits: paramsRef.current.manualEdits,
                    });
                    if (!active || processingRequestIdRef.current !== requestId || response.sourceVersion !== currentVersion) return;

                    workerImageVersionRef.current = currentVersion;
                    const processed = responseToProcessingResult(response);
                    onResultRef.current(processed);
                    onStatsUpdateRef.current(processed.stats);
                    setPackedResults(processed.packedResults);
                    setHeightPath(processed.heightPath);
                    debug(`Map-art generation v${currentVersion} completed in ${(performance.now() - startTime).toFixed(1)}ms`);
                } catch (err) {
                    if (active && processingRequestIdRef.current === requestId) debug.error('Heavy processing failed', err);
                } finally {
                    if (active && processingRequestIdRef.current === requestId) {
                        setIsProcessing(false);
                        isProcessingRef.current = false;
                    }
                }
            };

            heavyQueue.enqueue(process);
        }, DEBOUNCE_MS);

        return () => {
            active = false;
            clearTimeout(timerId);
        };
    }, [
        sourceImageVersion,
        params.buildMode,
        params.selectedPaletteItems,
        params.threeDPrecision,
        params.dithering,
        params.usePerceptual,
        params.hybridStrength,
        params.independentMaps,
        mapartResolution.width,
        mapartResolution.height,
        workerApiRef,
        isProcessingRef,
        workerImageVersionRef,
        sourceImageDataRef,
        heavyQueue,
    ]);

    useEffect(() => {
        if (!workerApiRef.current || isProcessingRef.current || heavyQueue.isRunning) return;

        const requestId = ++editsRequestIdRef.current;
        const processingRequestId = processingRequestIdRef.current;
        let active = true;

        const applyEditsOnly = async () => {
            if (
                !active ||
                requestId !== editsRequestIdRef.current ||
                isProcessingRef.current ||
                heavyQueue.isRunning
            ) return;
            try {
                const currentVersion = sourceImageVersion;
                if (workerImageVersionRef.current !== currentVersion) return;

                const api = workerApiRef.current!;
                const response = await api.applyEditsV1({
                    protocolVersion: PROCESSING_PROTOCOL_VERSION,
                    requestId,
                    sourceVersion: currentVersion,
                    config: toProcessingConfig(paramsRef.current, mapartResolution.width, mapartResolution.height),
                    manualEdits: paramsRef.current.manualEdits,
                });
                if (
                    !active ||
                    requestId !== editsRequestIdRef.current ||
                    processingRequestId !== processingRequestIdRef.current ||
                    response.sourceVersion !== currentVersion
                ) return;

                const processed = responseToProcessingResult(response);
                onResultRef.current(processed);
                onStatsUpdateRef.current(processed.stats);
                setPackedResults(processed.packedResults);
                setHeightPath(processed.heightPath);
            } catch (e) {
                debug.error('Incremental edit processing failed', e);
            }
        };

        const timerId = setTimeout(() => {
            editsQueueRef.current = editsQueueRef.current.then(applyEditsOnly, applyEditsOnly);
        }, EDIT_DEBOUNCE_MS);

        return () => {
            active = false;
            clearTimeout(timerId);
        };
    }, [
        params.manualEdits,
        mapartResolution.width,
        mapartResolution.height,
        sourceImageVersion,
        workerApiRef,
        isProcessingRef,
        workerImageVersionRef,
        heavyQueue,
    ]);

    return {
        isProcessing,
        packedResults,
        heightPath,
        setPackedResults,
        setHeightPath,
    };
}
