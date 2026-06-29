import { useCallback, useRef, useEffect } from 'react';
import type { WorkerRefs, ManualEdit } from './types';

export interface UseBlockPickerProps extends WorkerRefs {
    manualEdits: Record<number, ManualEdit>;
}

/**
 * Hook que maneja la selección de bloques desde el canvas.
 *
 * Responsabilidades:
 * - Obtener información del bloque en coordenadas específicas
 * - Considerar edits manuales sobre el resultado base
 */
export function useBlockPicker({
    workerApiRef,
    manualEdits,
}: UseBlockPickerProps): {
    pickBlock: (x: number, y: number) => Promise<ManualEdit | null>;
} {
    const manualEditsRef = useRef(manualEdits);

    useEffect(() => {
        manualEditsRef.current = manualEdits;
    }, [manualEdits]);

    const pickBlock = useCallback(
        async (x: number, y: number): Promise<ManualEdit | null> => {
            if (!workerApiRef.current) return null;
            try {
                return await workerApiRef.current.getBlockAt(x, y, manualEditsRef.current);
            } catch (e) {
                console.error(e);
                return null;
            }
        },
        [workerApiRef]
    );

    return { pickBlock };
}
