import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBlockPicker } from '../useBlockPicker';
import type { WorkerRefs, ManualEdit } from '../types';
import type { MapartWorkerApi } from '../../workers/mapart.worker';
import type { Remote } from 'comlink';

const createMockWorkerRefs = (): WorkerRefs => ({
    workerApiRef: {
        current: {
            getBlockAt: vi.fn(),
        } as unknown as Remote<MapartWorkerApi>,
    },
    isProcessingRef: { current: false },
    workerImageVersionRef: { current: 1 },
});

describe('useBlockPicker', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('pickBlock', () => {
        it('retorna bloque desde el worker', async () => {
            const mockBlock: ManualEdit = {
                blockId: 'minecraft:stone',
                brightness: 'normal',
                rgb: { r: 128, g: 128, b: 128 },
            };

            const refs = createMockWorkerRefs();
            const mockGetBlockAt = vi.mocked(refs.workerApiRef.current!.getBlockAt);
            mockGetBlockAt.mockResolvedValue(mockBlock);

            const { result } = renderHook(() =>
                useBlockPicker({
                    ...refs,
                    manualEdits: {},
                })
            );

            let block: ManualEdit | null = null;
            await act(async () => {
                block = await result.current.pickBlock(10, 20);
            });

            expect(block).toEqual(mockBlock);
            expect(mockGetBlockAt).toHaveBeenCalledWith(10, 20, {});
        });

        it('retorna null si workerApiRef es null', async () => {
            const refs = createMockWorkerRefs();
            refs.workerApiRef.current = null;

            const { result } = renderHook(() =>
                useBlockPicker({
                    ...refs,
                    manualEdits: {},
                })
            );

            let block: ManualEdit | null = null;
            await act(async () => {
                block = await result.current.pickBlock(10, 20);
            });

            expect(block).toBeNull();
        });

        it('maneja errores del worker', async () => {
            const refs = createMockWorkerRefs();
            const mockGetBlockAt = vi.mocked(refs.workerApiRef.current!.getBlockAt);
            mockGetBlockAt.mockRejectedValue(new Error('Worker error'));

            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            const { result } = renderHook(() =>
                useBlockPicker({
                    ...refs,
                    manualEdits: {},
                })
            );

            let block: ManualEdit | null = null;
            await act(async () => {
                block = await result.current.pickBlock(10, 20);
            });

            expect(block).toBeNull();
            expect(consoleSpy).toHaveBeenCalled();

            consoleSpy.mockRestore();
        });

        it('pasa manualEdits al worker', async () => {
            const mockBlock: ManualEdit = {
                blockId: 'minecraft:diamond_block',
                brightness: 'high',
                rgb: { r: 100, g: 200, b: 255 },
            };

            const refs = createMockWorkerRefs();
            const mockGetBlockAt = vi.mocked(refs.workerApiRef.current!.getBlockAt);
            mockGetBlockAt.mockResolvedValue(mockBlock);

            const manualEdits: Record<number, ManualEdit> = {
                5: {
                    blockId: 'minecraft:gold_block',
                    brightness: 'normal',
                    rgb: { r: 255, g: 200, b: 0 },
                },
            };

            const { result } = renderHook(() =>
                useBlockPicker({
                    ...refs,
                    manualEdits,
                })
            );

            await act(async () => {
                await result.current.pickBlock(5, 0);
            });

            expect(mockGetBlockAt).toHaveBeenCalledWith(5, 0, manualEdits);
        });
    });
});
