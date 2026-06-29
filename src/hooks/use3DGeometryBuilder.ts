import { useCallback } from 'react';
import type { WorkerRefs } from './types';
import type { Build3DGeometryProps } from '../utils/geometry/build3DGeometry';

export interface InstanceGeometry {
    positions: Float32Array;
    colors: Float32Array;
    textureIds: Int16Array;
    uniqueTextureIds: string[];
    count: number;
}

/**
 * Hook que maneja la construcción de geometría 3D en el worker.
 *
 * Responsabilidades:
 * - Ejecutar build3DGeometry en thread separado
 * - Retornar typed arrays via Transferable buffers (zero-copy)
 */
export function use3DGeometryBuilder(
    workerApiRef: WorkerRefs['workerApiRef']
): {
    build3DGeometryAsync: (props: Build3DGeometryProps) => Promise<InstanceGeometry | null>;
} {
    const build3DGeometryAsync = useCallback(
        async (props: Build3DGeometryProps): Promise<InstanceGeometry | null> => {
            const api = workerApiRef.current;
            if (!api) return null;
            try {
                return await api.build3DGeometryInWorker(props);
            } catch (e) {
                console.error('[use3DGeometryBuilder] build3DGeometryAsync failed', e);
                return null;
            }
        },
        [workerApiRef]
    );

    return { build3DGeometryAsync };
}
