import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMapartWorker } from '../useMapartWorker';
import type { UseMapartWorkerProps } from '../useMapartWorker';
import { wrap } from 'comlink';

// Mock del Worker
class MockWorker {
  terminate = vi.fn();
  postMessage = vi.fn();
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  dispatchEvent = vi.fn();
  onmessage = null;
  onerror = null;
  onmessageerror = null;
}

vi.stubGlobal('Worker', MockWorker);

// Mock de Comlink
vi.mock('comlink', () => {
  const releaseProxy = Symbol('releaseProxy');
  return {
  releaseProxy,
  wrap: vi.fn(() => ({
    [releaseProxy]: vi.fn(),
    clearCache: vi.fn(),
    processMapart: vi.fn().mockResolvedValue({
      version: 1,
      stats: { minHeight: 0, maxHeight: 5, heightMap: new Int32Array(128) },
      packedResults: new Uint32Array(128 * 128),
      heightPath: new Int32Array(128 * 128),
    }),
    applyEdits: vi.fn().mockResolvedValue({
      version: 1,
      imageData: new ImageData(new Uint8ClampedArray(128 * 128 * 4), 128, 128),
      stats: { minHeight: 0, maxHeight: 5, heightMap: new Int32Array(128) },
      packedResults: new Uint32Array(128 * 128),
    }),
    generateMapartExport: vi.fn().mockResolvedValue({
      blob: new Blob(['test']),
      filename: 'test.litematic',
    }),
    calculateMaterialCounts: vi.fn().mockResolvedValue({
      total: 1000,
      perSection: [],
    }),
    getBlockAt: vi.fn().mockResolvedValue({
      blockId: 'minecraft:stone',
      brightness: 'normal',
      rgb: { r: 128, g: 128, b: 128 },
    }),
    build3DGeometryInWorker: vi.fn().mockResolvedValue({
      positions: new Float32Array([0, 0, 0]),
      colors: new Float32Array([1, 1, 1]),
      textureIds: new Int16Array([0]),
      uniqueTextureIds: ['minecraft:stone'],
      count: 1,
    }),
  })),
  transfer: vi.fn((obj) => obj),
  };
});

describe('useMapartWorker E2E', () => {
  const defaultProps: UseMapartWorkerProps = {
    uploadedImage: null,
    previewUrl: null,
    gridDimensions: { x: 1, y: 1 },
    imageFitMode: 'adjust',
    cropSettings: { zoom: 1, offsetX: 0, offsetY: 0 },
    buildMode: '3d_valley',
    selectedPaletteItems: { 1: 'minecraft:stone' },
    threeDPrecision: 50,
    dithering: 'floyd-steinberg',
    usePerceptual: true,
    hybridStrength: 50,
    independentMaps: false,
    setMapartStats: vi.fn(),
    imageSettings: { brightness: 0, contrast: 0, saturation: 100 },
    manualEdits: {},
    blockSupport: 'all',
    supportBlockId: 'minecraft:cobblestone',
    exportMode: 'sections',
    paletteVersion: '1.21',
    exportFormat: 'litematic',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('API pública', () => {
    it('mantiene estructura de retorno consistente', () => {
      const { result } = renderHook(() => useMapartWorker(defaultProps));
      
      expect(Object.keys(result.current).sort()).toMatchSnapshot();
    });

    it('retorna todas las funciones esperadas', () => {
      const { result } = renderHook(() => useMapartWorker(defaultProps));
      
      expect(typeof result.current.isProcessing).toBe('boolean');
      expect(typeof result.current.isExporting).toBe('boolean');
      expect(typeof result.current.exportMapart).toBe('function');
      expect(typeof result.current.calculateMaterials).toBe('function');
      expect(typeof result.current.pickBlock).toBe('function');
      expect(typeof result.current.build3DGeometryAsync).toBe('function');
    });

    it('retorna estado inicial correcto', () => {
      const { result } = renderHook(() => useMapartWorker(defaultProps));
      
      expect(result.current.isProcessing).toBe(false);
      expect(result.current.isExporting).toBe(false);
      expect(result.current.previewImageData).toBeNull();
      expect(result.current.packedResults).toBeNull();
      expect(result.current.heightPath).toBeNull();
    });

    it('calcula mapartResolution correctamente', () => {
      const { result } = renderHook(() => useMapartWorker({
        ...defaultProps,
        gridDimensions: { x: 2, y: 3 },
      }));
      
      expect(result.current.mapartResolution).toEqual({
        width: 256,  // 128 * 2
        height: 384, // 128 * 3
      });
    });
  });

  describe('snapshot regression', () => {
    it('mantiene estructura de API pública', () => {
      const { result } = renderHook(() => useMapartWorker(defaultProps));
      
      expect({
        keys: Object.keys(result.current).sort(),
        isProcessing: result.current.isProcessing,
        isExporting: result.current.isExporting,
        mapartResolution: result.current.mapartResolution,
      }).toMatchSnapshot();
    });
  });

  describe('memory cleanup', () => {
    it('clears worker and main results whenever the source image identity changes', () => {
      const { rerender } = renderHook(
        (props: UseMapartWorkerProps) => useMapartWorker(props),
        { initialProps: defaultProps }
      );
      const api = vi.mocked(wrap).mock.results.at(-1)!.value as { clearCache: ReturnType<typeof vi.fn> };
      const initialClearCount = api.clearCache.mock.calls.length;

      rerender({ ...defaultProps, previewUrl: 'blob:new-source' });

      expect(api.clearCache.mock.calls.length).toBeGreaterThan(initialClearCount);
      expect(defaultProps.setMapartStats).toHaveBeenCalledWith(null);
    });

    it('clears worker buffers when the palette becomes empty', () => {
      const props = { ...defaultProps, previewUrl: 'blob:source' };
      const { rerender } = renderHook(
        (nextProps: UseMapartWorkerProps) => useMapartWorker(nextProps),
        { initialProps: props }
      );
      const api = vi.mocked(wrap).mock.results.at(-1)!.value as { clearCache: ReturnType<typeof vi.fn> };
      const initialClearCount = api.clearCache.mock.calls.length;

      rerender({ ...props, selectedPaletteItems: {} });

      expect(api.clearCache.mock.calls.length).toBeGreaterThan(initialClearCount);
      expect(defaultProps.setMapartStats).toHaveBeenCalledWith(null);
    });
  });
});
