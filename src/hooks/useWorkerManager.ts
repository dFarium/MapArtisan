import { releaseProxy, wrap, type Remote } from 'comlink';
import { useRef, useEffect, useCallback } from 'react';
import type { MapartWorkerApi } from '../workers/mapart.worker';

/**
 * Hook para manejar el lifecycle del Web Worker de mapart.
 * 
 * Responsabilidades:
 * - Inicialización del worker con Comlink
 * - Cleanup al desmontar
 * - Exponer refs del worker para comunicación
 */
export interface UseWorkerManagerReturn {
  workerApiRef: React.RefObject<Remote<MapartWorkerApi> | null>;
  isProcessingRef: React.RefObject<boolean>;
  workerImageVersionRef: React.RefObject<number>;
}

export function useWorkerManager(): UseWorkerManagerReturn {
  const workerRef = useRef<Worker | null>(null);
  const workerApiRef = useRef<Remote<MapartWorkerApi> | null>(null);
  const isProcessingRef = useRef(false);
  const workerImageVersionRef = useRef(-1);

  /**
   * Inicializa el worker y configura el proxy de Comlink
   */
  const initWorker = useCallback(() => {
    if (workerApiRef.current) {
      workerApiRef.current[releaseProxy]();
      workerApiRef.current = null;
    }
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    
    workerRef.current = new Worker(
      new URL('../workers/mapart.worker.ts', import.meta.url),
      { type: 'module' }
    );
    
    workerApiRef.current = wrap<MapartWorkerApi>(workerRef.current);
    isProcessingRef.current = false;
    workerImageVersionRef.current = -1;
  }, []);

  // Inicializar worker al montar, cleanup al desmontar
  useEffect(() => {
    initWorker();
    return () => {
      if (workerApiRef.current) {
        workerApiRef.current[releaseProxy]();
        workerApiRef.current = null;
      }
      workerRef.current?.terminate();
      workerRef.current = null;
      isProcessingRef.current = false;
      workerImageVersionRef.current = -1;
    };
  }, [initWorker]);

  return {
    workerApiRef,
    isProcessingRef,
    workerImageVersionRef,
  };
}
