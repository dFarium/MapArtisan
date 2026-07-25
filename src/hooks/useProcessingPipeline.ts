import { transfer as comlinkTransfer } from 'comlink';
import { useState, useEffect, useRef } from 'react';
import type { WorkerRefs, ProcessingResult, ProcessingParams } from './types';
import type { DitheringMode } from '../utils/processing';
import type { MapartStats } from '../types/mapart';
import { LatestWinsQueue } from './latestWinsQueue';

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

            const process = async (retryWithBuffer = false) => {
                const startTime = performance.now();
                isProcessingRef.current = true;
                setIsProcessing(true);

                try {
                    const api = workerApiRef.current;
                    if (!api) return;

                    const currentVersion = sourceImageVersion;
                    const needsBuffer = retryWithBuffer || (workerImageVersionRef.current !== currentVersion);

                    let bufferToSend: ArrayBuffer | null = null;
                    if (needsBuffer && sourceImageDataRef.current) {
                        bufferToSend = sourceImageDataRef.current.data.buffer.slice(0);
                    }

                    const { buildMode, selectedPaletteItems, threeDPrecision, dithering, usePerceptual, hybridStrength, independentMaps, manualEdits } = paramsRef.current;

                    const result = await api.processMapart(
                        bufferToSend ? comlinkTransfer(bufferToSend, [bufferToSend]) : null,
                        sourceImageDataRef.current!.width,
                        sourceImageDataRef.current!.height,
                        currentVersion,
                        buildMode,
                        selectedPaletteItems,
                        threeDPrecision,
                        dithering as DitheringMode,
                        usePerceptual,
                        hybridStrength,
                        independentMaps
                    );

                    if (!active || processingRequestIdRef.current !== requestId) return;

                    if (result.error === 'CACHE_MISS') {
                        console.warn('[useProcessingPipeline] Worker cache miss, retrying with buffer...');
                        return process(true);
                    }

                    if (result.version !== currentVersion) return;

                    workerImageVersionRef.current = currentVersion;

                    const editsResult = await api.applyEdits(manualEdits);

                    if (!active || processingRequestIdRef.current !== requestId) return;
                    if (editsResult.version !== currentVersion) return;

                    const processedData = editsResult.imageData;
                    const finalStats = editsResult.stats;
                    const finalPackedResults = editsResult.packedResults;
                    const finalHeightPath = editsResult.heightPath ?? result.heightPath ?? null;

                    onResultRef.current({
                        imageData: processedData,
                        stats: finalStats,
                        packedResults: finalPackedResults,
                        heightPath: finalHeightPath,
                    });

                    onStatsUpdateRef.current(finalStats);
                    setPackedResults(finalPackedResults);
                    setHeightPath(finalHeightPath);

                    const endTime = performance.now();
                    console.log(`[useProcessingPipeline] E2E Mapart generation (v${currentVersion}) complete in ${(endTime - startTime).toFixed(1)}ms`);
                } catch (err) {
                    if (active && processingRequestIdRef.current === requestId) console.error('Heavy processing failed', err);
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
                const result = await api.applyEdits(paramsRef.current.manualEdits);

                if (
                    !active ||
                    requestId !== editsRequestIdRef.current ||
                    processingRequestId !== processingRequestIdRef.current
                ) return;
                if (result.version !== currentVersion) return;

                const {
                    imageData: processedData,
                    stats: finalStats,
                    packedResults: finalPackedResults,
                    heightPath: finalHeightPath,
                } = result;

                onResultRef.current({
                    imageData: processedData,
                    stats: finalStats,
                    packedResults: finalPackedResults,
                    heightPath: finalHeightPath,
                });

                onStatsUpdateRef.current(finalStats);
                setPackedResults(finalPackedResults);
                setHeightPath(finalHeightPath);
            } catch (e) {
                console.error('Light processing failed', e);
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
