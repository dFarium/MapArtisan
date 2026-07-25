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
                heightPath: new Int32Array(128 * 128),
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

    describe('concurrency', () => {
        it('keeps one heavy request active and runs only the latest pending settings', async () => {
            const refs = createMockWorkerRefs();
            refs.workerImageVersionRef.current = -1;
            const sourceImageDataRef = {
                current: new ImageData(new Uint8ClampedArray(128 * 128 * 4), 128, 128),
            };
            const onResult = vi.fn();
            const pending: Array<(value: {
                version: number;
                stats: { minHeight: number; maxHeight: number; heightMap: Int32Array };
                packedResults: Uint32Array;
                heightPath: Int32Array;
            }) => void> = [];

            vi.mocked(refs.workerApiRef.current!.processMapart).mockImplementation(() =>
                new Promise(resolve => pending.push(resolve)) as ReturnType<Remote<MapartWorkerApi>['processMapart']>
            );

            const initialParams = createMockParams();
            const { rerender } = renderHook(
                ({ params }) => useProcessingPipeline({
                    ...refs,
                    sourceImageDataRef,
                    sourceImageVersion: 1,
                    mapartResolution: { width: 128, height: 128 },
                    params,
                    onResult,
                    onStatsUpdate: vi.fn(),
                }),
                { initialProps: { params: initialParams } }
            );

            await act(async () => {
                await vi.advanceTimersByTimeAsync(50);
            });
            expect(pending).toHaveLength(1);

            for (let precision = 51; precision <= 75; precision++) {
                rerender({ params: { ...initialParams, threeDPrecision: precision } });
                await act(async () => {
                    await vi.advanceTimersByTimeAsync(50);
                });
            }
            expect(pending).toHaveLength(1);

            await act(async () => {
                pending[0]({
                    version: 1,
                    stats: { minHeight: 0, maxHeight: 1, heightMap: new Int32Array(128) },
                    packedResults: new Uint32Array(128 * 128).fill(1),
                    heightPath: new Int32Array(128 * 128).fill(1),
                });
                await Promise.resolve();
            });
            await vi.waitFor(() => expect(pending).toHaveLength(2));
            expect(vi.mocked(refs.workerApiRef.current!.processMapart).mock.calls[1][6]).toBe(75);
            expect(onResult).not.toHaveBeenCalled();

            await act(async () => {
                pending[1]({
                    version: 1,
                    stats: { minHeight: 0, maxHeight: 2, heightMap: new Int32Array(128) },
                    packedResults: new Uint32Array(128 * 128).fill(2),
                    heightPath: new Int32Array(128 * 128).fill(2),
                });
                await Promise.resolve();
                await Promise.resolve();
            });
            expect(onResult).toHaveBeenCalledTimes(1);
            expect(refs.workerApiRef.current!.processMapart).toHaveBeenCalledTimes(2);
        });

        it('coalesces a burst of manual edits into one worker request', async () => {
            const refs = createMockWorkerRefs();
            const sourceImageDataRef = {
                current: new ImageData(new Uint8ClampedArray(128 * 128 * 4), 128, 128),
            };
            const initialParams = createMockParams();
            initialParams.selectedPaletteItems = {};

            const { rerender } = renderHook(
                ({ params }) => useProcessingPipeline({
                    ...refs,
                    sourceImageDataRef,
                    sourceImageVersion: 1,
                    mapartResolution: { width: 128, height: 128 },
                    params,
                    onResult: vi.fn(),
                    onStatsUpdate: vi.fn(),
                }),
                { initialProps: { params: initialParams } }
            );

            for (let index = 0; index < 50; index++) {
                rerender({
                    params: {
                        ...initialParams,
                        manualEdits: {
                            [index]: {
                                blockId: 'minecraft:stone',
                                brightness: 'normal',
                                rgb: { r: 128, g: 128, b: 128 },
                            },
                        },
                    },
                });
            }

            await act(async () => {
                await vi.advanceTimersByTimeAsync(50);
            });

            expect(refs.workerApiRef.current!.applyEdits).toHaveBeenCalledTimes(1);
        });
    });
});
