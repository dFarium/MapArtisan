import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProcessingPipeline } from '../useProcessingPipeline';
import type { WorkerRefs, ProcessingParams } from '../types';
import type { MapartWorkerApi } from '../../workers/mapart.worker';
import type { Remote } from 'comlink';

const createMockWorkerRefs = (): WorkerRefs => ({
    workerApiRef: {
        current: {
            processMapart: vi.fn(),
            applyEdits: vi.fn().mockResolvedValue({
                version: 1,
                imageData: new ImageData(new Uint8ClampedArray(128 * 128 * 4), 128, 128),
                stats: { minHeight: 0, maxHeight: 5, heightMap: new Int32Array(128) },
                packedResults: new Uint32Array(128 * 128),
            }),
        } as unknown as Remote<MapartWorkerApi>,
    },
    isProcessingRef: { current: false },
    workerImageVersionRef: { current: 1 },
});

const createMockParams = (): ProcessingParams => ({
    buildMode: '3d_valley',
    selectedPaletteItems: { 1: 'minecraft:stone' },
    threeDPrecision: 50,
    dithering: 'floyd-steinberg',
    usePerceptual: true,
    hybridStrength: 50,
    independentMaps: false,
    manualEdits: {},
});

describe('useProcessingPipeline', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('estado inicial', () => {
        it('isProcessing es false inicialmente', () => {
            const refs = createMockWorkerRefs();
            const sourceImageDataRef = { current: null };

            const { result } = renderHook(() =>
                useProcessingPipeline({
                    ...refs,
                    sourceImageDataRef,
                    sourceImageVersion: 1,
                    mapartResolution: { width: 128, height: 128 },
                    params: createMockParams(),
                    onResult: vi.fn(),
                    onStatsUpdate: vi.fn(),
                })
            );

            expect(result.current.isProcessing).toBe(false);
        });

        it('packedResults es null inicialmente', () => {
            const refs = createMockWorkerRefs();
            const sourceImageDataRef = { current: null };

            const { result } = renderHook(() =>
                useProcessingPipeline({
                    ...refs,
                    sourceImageDataRef,
                    sourceImageVersion: 1,
                    mapartResolution: { width: 128, height: 128 },
                    params: createMockParams(),
                    onResult: vi.fn(),
                    onStatsUpdate: vi.fn(),
                })
            );

            expect(result.current.packedResults).toBeNull();
        });

        it('heightPath es null inicialmente', () => {
            const refs = createMockWorkerRefs();
            const sourceImageDataRef = { current: null };

            const { result } = renderHook(() =>
                useProcessingPipeline({
                    ...refs,
                    sourceImageDataRef,
                    sourceImageVersion: 1,
                    mapartResolution: { width: 128, height: 128 },
                    params: createMockParams(),
                    onResult: vi.fn(),
                    onStatsUpdate: vi.fn(),
                })
            );

            expect(result.current.heightPath).toBeNull();
        });
    });

    describe('setters', () => {
        it('setPackedResults actualiza el estado', () => {
            const refs = createMockWorkerRefs();
            const sourceImageDataRef = { current: null };

            const { result } = renderHook(() =>
                useProcessingPipeline({
                    ...refs,
                    sourceImageDataRef,
                    sourceImageVersion: 1,
                    mapartResolution: { width: 128, height: 128 },
                    params: createMockParams(),
                    onResult: vi.fn(),
                    onStatsUpdate: vi.fn(),
                })
            );

            const newPackedResults = new Uint32Array([1, 2, 3]);

            act(() => {
                result.current.setPackedResults(newPackedResults);
            });

            expect(result.current.packedResults).toEqual(newPackedResults);
        });

        it('setHeightPath actualiza el estado', () => {
            const refs = createMockWorkerRefs();
            const sourceImageDataRef = { current: null };

            const { result } = renderHook(() =>
                useProcessingPipeline({
                    ...refs,
                    sourceImageDataRef,
                    sourceImageVersion: 1,
                    mapartResolution: { width: 128, height: 128 },
                    params: createMockParams(),
                    onResult: vi.fn(),
                    onStatsUpdate: vi.fn(),
                })
            );

            const newHeightPath = new Int32Array([0, 1, 2]);

            act(() => {
                result.current.setHeightPath(newHeightPath);
            });

            expect(result.current.heightPath).toEqual(newHeightPath);
        });
    });

    describe('heavy processing', () => {
        it('no procesa si sourceImageDataRef es null', async () => {
            const refs = createMockWorkerRefs();
            const sourceImageDataRef = { current: null };

            renderHook(() =>
                useProcessingPipeline({
                    ...refs,
                    sourceImageDataRef,
                    sourceImageVersion: 1,
                    mapartResolution: { width: 128, height: 128 },
                    params: createMockParams(),
                    onResult: vi.fn(),
                    onStatsUpdate: vi.fn(),
                })
            );

            await act(async () => {
                await vi.advanceTimersByTimeAsync(100);
            });

            expect(refs.workerApiRef.current!.processMapart).not.toHaveBeenCalled();
        });

        it('no procesa si no hay selección de paleta', async () => {
            const refs = createMockWorkerRefs();
            const sourceImageDataRef = {
                current: new ImageData(new Uint8ClampedArray(128 * 128 * 4), 128, 128),
            };

            const params = createMockParams();
            params.selectedPaletteItems = {};

            renderHook(() =>
                useProcessingPipeline({
                    ...refs,
                    sourceImageDataRef,
                    sourceImageVersion: 1,
                    mapartResolution: { width: 128, height: 128 },
                    params,
                    onResult: vi.fn(),
                    onStatsUpdate: vi.fn(),
                })
            );

            await act(async () => {
                await vi.advanceTimersByTimeAsync(100);
            });

            expect(refs.workerApiRef.current!.processMapart).not.toHaveBeenCalled();
        });
    });

    describe('API pública', () => {
        it('retorna estructura consistente', () => {
            const refs = createMockWorkerRefs();
            const sourceImageDataRef = { current: null };

            const { result } = renderHook(() =>
                useProcessingPipeline({
                    ...refs,
                    sourceImageDataRef,
                    sourceImageVersion: 1,
                    mapartResolution: { width: 128, height: 128 },
                    params: createMockParams(),
                    onResult: vi.fn(),
                    onStatsUpdate: vi.fn(),
                })
            );

            expect(Object.keys(result.current).sort()).toEqual([
                'heightPath',
                'isProcessing',
                'packedResults',
                'setHeightPath',
                'setPackedResults',
            ]);
        });
    });
});
