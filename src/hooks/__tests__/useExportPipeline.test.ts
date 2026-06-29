import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useExportPipeline } from '../useExportPipeline';
import type { WorkerRefs, ExportParams } from '../types';
import type { MaterialCounts } from '../../utils/export/materials';
import type { MapartWorkerApi } from '../../workers/mapart.worker';
import type { Remote } from 'comlink';

vi.mock('../../utils/export', () => ({
    triggerDownload: vi.fn(),
}));

const createMockWorkerRefs = (): WorkerRefs => ({
    workerApiRef: {
        current: {
            calculateMaterialCounts: vi.fn(),
            generateMapartExport: vi.fn(),
        } as unknown as Remote<MapartWorkerApi>,
    },
    isProcessingRef: { current: false },
    workerImageVersionRef: { current: 1 },
});

const createMockExportParams = (): ExportParams => ({
    buildMode: '3d_valley',
    selectedPaletteItems: { 1: 'minecraft:stone' },
    threeDPrecision: 50,
    dithering: 'floyd-steinberg',
    usePerceptual: true,
    hybridStrength: 50,
    independentMaps: false,
    manualEdits: {},
    blockSupport: 'all',
    supportBlockId: 'minecraft:cobblestone',
    exportMode: 'sections',
    paletteVersion: '1.21',
    exportFormat: 'litematic',
});

describe('useExportPipeline', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('calculateMaterials', () => {
        it('retorna conteo de materiales desde el worker', async () => {
            const mockCounts: MaterialCounts = {
                total: { 'minecraft:stone': 1000 },
                reusable: { 'minecraft:stone': 500 },
            };

            const refs = createMockWorkerRefs();
            const mockCalculate = vi.mocked(refs.workerApiRef.current!.calculateMaterialCounts);
            mockCalculate.mockResolvedValue(mockCounts);

            const sourceImageDataRef = {
                current: new ImageData(new Uint8ClampedArray(128 * 128 * 4), 128, 128),
            };

            const { result } = renderHook(() =>
                useExportPipeline({
                    ...refs,
                    sourceImageDataRef,
                    sourceImageVersion: 1,
                    params: createMockExportParams(),
                })
            );

            let counts: MaterialCounts | null = null;
            await act(async () => {
                counts = await result.current.calculateMaterials();
            });

            expect(counts).toEqual(mockCounts);
        });

        it('retorna null si sourceImageDataRef es null', async () => {
            const refs = createMockWorkerRefs();
            const sourceImageDataRef = { current: null };

            const { result } = renderHook(() =>
                useExportPipeline({
                    ...refs,
                    sourceImageDataRef,
                    sourceImageVersion: 1,
                    params: createMockExportParams(),
                })
            );

            let counts: MaterialCounts | null = null;
            await act(async () => {
                counts = await result.current.calculateMaterials();
            });

            expect(counts).toBeNull();
        });

        it('maneja errores del worker', async () => {
            const refs = createMockWorkerRefs();
            const mockCalculate = vi.mocked(refs.workerApiRef.current!.calculateMaterialCounts);
            mockCalculate.mockRejectedValue(new Error('Worker error'));

            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            const sourceImageDataRef = {
                current: new ImageData(new Uint8ClampedArray(128 * 128 * 4), 128, 128),
            };

            const { result } = renderHook(() =>
                useExportPipeline({
                    ...refs,
                    sourceImageDataRef,
                    sourceImageVersion: 1,
                    params: createMockExportParams(),
                })
            );

            let counts: MaterialCounts | null = null;
            await act(async () => {
                counts = await result.current.calculateMaterials();
            });

            expect(counts).toBeNull();
            expect(consoleSpy).toHaveBeenCalled();

            consoleSpy.mockRestore();
        });
    });

    describe('exportMapart', () => {
        it('genera archivo de exportación', async () => {
            const mockResult = {
                blob: new Blob(['test']),
                filename: 'test.litematic',
            };

            const refs = createMockWorkerRefs();
            const mockExport = vi.mocked(refs.workerApiRef.current!.generateMapartExport);
            mockExport.mockResolvedValue(mockResult);

            const sourceImageDataRef = {
                current: new ImageData(new Uint8ClampedArray(128 * 128 * 4), 128, 128),
            };

            const { result } = renderHook(() =>
                useExportPipeline({
                    ...refs,
                    sourceImageDataRef,
                    sourceImageVersion: 1,
                    params: createMockExportParams(),
                })
            );

            await act(async () => {
                await result.current.exportMapart('test', {});
            });

            expect(mockExport).toHaveBeenCalled();
        });

        it('retorna inmediatamente si ya está exportando', async () => {
            const refs = createMockWorkerRefs();
            const sourceImageDataRef = {
                current: new ImageData(new Uint8ClampedArray(128 * 128 * 4), 128, 128),
            };

            const { result } = renderHook(() =>
                useExportPipeline({
                    ...refs,
                    sourceImageDataRef,
                    sourceImageVersion: 1,
                    params: createMockExportParams(),
                })
            );

            expect(result.current.isExporting).toBe(false);
        });
    });

    describe('isExporting', () => {
        it('estado inicial es false', () => {
            const refs = createMockWorkerRefs();
            const sourceImageDataRef = { current: null };

            const { result } = renderHook(() =>
                useExportPipeline({
                    ...refs,
                    sourceImageDataRef,
                    sourceImageVersion: 1,
                    params: createMockExportParams(),
                })
            );

            expect(result.current.isExporting).toBe(false);
        });
    });
});
