import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { use3DGeometryBuilder } from '../use3DGeometryBuilder';
import type { InstanceGeometry } from '../use3DGeometryBuilder';
import type { Build3DGeometryProps } from '../../utils/geometry/build3DGeometry';
import type { MapartWorkerApi } from '../../workers/mapart.worker';
import type { Remote } from 'comlink';

const createMockWorkerApiRef = () => ({
    current: {
        build3DGeometryInWorker: vi.fn(),
    } as unknown as Remote<MapartWorkerApi>,
});

describe('use3DGeometryBuilder', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('build3DGeometryAsync', () => {
        it('retorna geometría desde el worker', async () => {
            const mockGeometry: InstanceGeometry = {
                positions: new Float32Array([0, 0, 0, 1, 1, 1]),
                colors: new Float32Array([1, 0, 0, 0, 1, 0]),
                textureIds: new Int16Array([0, 1]),
                uniqueTextureIds: ['minecraft:stone', 'minecraft:dirt'],
                count: 2,
            };

            const workerApiRef = createMockWorkerApiRef();
            const mockBuild3D = vi.mocked(workerApiRef.current.build3DGeometryInWorker);
            mockBuild3D.mockResolvedValue(mockGeometry);

            const { result } = renderHook(() => use3DGeometryBuilder(workerApiRef));

            const props: Build3DGeometryProps = {
                imageData: new ImageData(new Uint8ClampedArray(4), 1, 1),
                packedResults: new Uint32Array([1]),
                blockSupport: 'all',
                supportColor: { r: 128, g: 128, b: 128 },
                candidateBlocks: ['minecraft:stone'],
            };

            let geometry: InstanceGeometry | null = null;
            await act(async () => {
                geometry = await result.current.build3DGeometryAsync(props);
            });

            expect(geometry).toEqual(mockGeometry);
            expect(mockBuild3D).toHaveBeenCalledWith(props);
        });

        it('retorna null si workerApiRef es null', async () => {
            const workerApiRef = { current: null };

            const { result } = renderHook(() => use3DGeometryBuilder(workerApiRef));

            const props: Build3DGeometryProps = {
                imageData: new ImageData(new Uint8ClampedArray(4), 1, 1),
                packedResults: new Uint32Array([1]),
                blockSupport: 'all',
                supportColor: { r: 128, g: 128, b: 128 },
                candidateBlocks: ['minecraft:stone'],
            };

            let geometry: InstanceGeometry | null = null;
            await act(async () => {
                geometry = await result.current.build3DGeometryAsync(props);
            });

            expect(geometry).toBeNull();
        });

        it('maneja errores del worker', async () => {
            const workerApiRef = createMockWorkerApiRef();
            const mockBuild3D = vi.mocked(workerApiRef.current.build3DGeometryInWorker);
            mockBuild3D.mockRejectedValue(new Error('Worker error'));

            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            const { result } = renderHook(() => use3DGeometryBuilder(workerApiRef));

            const props: Build3DGeometryProps = {
                imageData: new ImageData(new Uint8ClampedArray(4), 1, 1),
                packedResults: new Uint32Array([1]),
                blockSupport: 'all',
                supportColor: { r: 128, g: 128, b: 128 },
                candidateBlocks: ['minecraft:stone'],
            };

            let geometry: InstanceGeometry | null = null;
            await act(async () => {
                geometry = await result.current.build3DGeometryAsync(props);
            });

            expect(geometry).toBeNull();
            expect(consoleSpy).toHaveBeenCalled();

            consoleSpy.mockRestore();
        });
    });
});
