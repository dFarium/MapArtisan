import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useWorkerManager } from '../useWorkerManager';
import { releaseProxy } from 'comlink';

// Mock del Worker como clase
class MockWorker {
  static instances: MockWorker[] = [];
  terminate = vi.fn();
  postMessage = vi.fn();
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  dispatchEvent = vi.fn();
  onmessage = null;
  onerror = null;
  onmessageerror = null;

  constructor() {
    MockWorker.instances.push(this);
  }
}

vi.stubGlobal('Worker', MockWorker);

// Mock de Comlink
vi.mock('comlink', () => {
  const releaseProxy = Symbol('releaseProxy');
  return {
  releaseProxy,
  wrap: vi.fn(() => ({
    [releaseProxy]: vi.fn(),
    processMapart: vi.fn(),
    applyEdits: vi.fn(),
    generateMapartExport: vi.fn(),
    calculateMaterialCounts: vi.fn(),
    getBlockAt: vi.fn(),
    build3DGeometryInWorker: vi.fn(),
  })),
  transfer: vi.fn((obj) => obj),
  };
});

describe('useWorkerManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MockWorker.instances = [];
  });

  describe('initialization', () => {
    it('inicializa workerApiRef después del montaje', () => {
      const { result } = renderHook(() => useWorkerManager());
      expect(result.current.workerApiRef).toBeDefined();
      expect(result.current.workerApiRef.current).not.toBeNull();
    });

    it('inicializa isProcessingRef en false', () => {
      const { result } = renderHook(() => useWorkerManager());
      expect(result.current.isProcessingRef.current).toBe(false);
    });

    it('inicializa workerImageVersionRef en -1', () => {
      const { result } = renderHook(() => useWorkerManager());
      expect(result.current.workerImageVersionRef.current).toBe(-1);
    });
  });

  describe('worker lifecycle', () => {
    it('no termina worker en rerender normal', () => {
      const { result, rerender } = renderHook(() => useWorkerManager());
      const initialWorker = result.current.workerApiRef.current;
      
      rerender();
      
      // El worker no debería cambiar en un rerender normal
      expect(result.current.workerApiRef.current).toBe(initialWorker);
    });

    it('releases the Comlink proxy, terminates the worker and clears refs on unmount', () => {
      const { result, unmount } = renderHook(() => useWorkerManager());
      const api = result.current.workerApiRef.current!;
      const worker = MockWorker.instances.at(-1)!;

      unmount();

      expect(api[releaseProxy]).toHaveBeenCalledTimes(1);
      expect(worker.terminate).toHaveBeenCalledTimes(1);
      expect(result.current.workerApiRef.current).toBeNull();
      expect(result.current.workerImageVersionRef.current).toBe(-1);
      expect(result.current.isProcessingRef.current).toBe(false);
    });
  });

  describe('return structure', () => {
    it('retorna estructura consistente', () => {
      const { result } = renderHook(() => useWorkerManager());
      
      expect(result.current).toHaveProperty('workerApiRef');
      expect(result.current).toHaveProperty('isProcessingRef');
      expect(result.current).toHaveProperty('workerImageVersionRef');
      
      expect(Object.keys(result.current).sort()).toMatchSnapshot();
    });

    it('retorna refs mutables', () => {
      const { result } = renderHook(() => useWorkerManager());
      
      expect(result.current.workerApiRef).toHaveProperty('current');
      expect(result.current.isProcessingRef).toHaveProperty('current');
      expect(result.current.workerImageVersionRef).toHaveProperty('current');
    });
  });

  describe('snapshot regression', () => {
    it('mantiene estructura de retorno consistente', () => {
      const { result } = renderHook(() => useWorkerManager());
      
      expect({
        hasWorkerApiRef: !!result.current.workerApiRef,
        hasIsProcessingRef: !!result.current.isProcessingRef,
        hasWorkerImageVersionRef: !!result.current.workerImageVersionRef,
        isProcessingValue: result.current.isProcessingRef.current,
        workerImageVersionValue: result.current.workerImageVersionRef.current,
      }).toMatchSnapshot();
    });
  });
});
