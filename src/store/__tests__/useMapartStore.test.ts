import { describe, it, expect, beforeEach } from 'vitest';
import { useMapartStore, type MapartState } from '../useMapartStore';
import { MAX_MAPS_TOTAL, estimateMemoryUsage, clampGridDimensions } from '../../utils/memory';

describe('useMapartStore - Regression Tests', () => {
    beforeEach(() => {
        useMapartStore.setState({
            gridDimensions: { x: 1, y: 1 },
            memoryEstimate: estimateMemoryUsage(1, 1),
            manualEdits: {},
            history: [],
            historyIndex: 0,
        });
    });

    it('exports useMapartStore as a function', () => {
        expect(typeof useMapartStore).toBe('function');
    });

    it('returns initial state with expected defaults', () => {
        const state = useMapartStore.getState();
        
        expect(state.paletteVersion).toBeDefined();
        expect(state.imageSettings).toEqual({ saturation: 100, brightness: 0, contrast: 0 });
        expect(state.gridDimensions).toEqual({ x: 1, y: 1 });
        expect(state.buildMode).toBe('3d_valley');
        expect(state.blockSupport).toBe('all');
        expect(state.supportBlockId).toBe('minecraft:cobblestone');
        expect(state.exportMode).toBe('sections');
        expect(state.exportFormat).toBe('litematic');
        expect(state.dithering).toBe('hybrid');
        expect(state.uploadedImage).toBeNull();
        expect(state.previewUrl).toBeNull();
        expect(state.imageFitMode).toBe('adjust');
        expect(state.cropSettings).toEqual({ zoom: 1, offsetX: 0, offsetY: 0 });
        expect(state.selectedPaletteItems).toEqual({});
        expect(state.threeDPrecision).toBe(100);
        expect(state.usePerceptual).toBe(true);
        expect(state.hybridStrength).toBe(50);
        expect(state.mapartStats).toBeNull();
        expect(state.independentMaps).toBe(true);
        expect(state.manualEdits).toEqual({});
        expect(state.isPainting).toBe(false);
        expect(state.isPicking).toBe(false);
        expect(state.brushBlock).toBeNull();
    });

    it('setters update state correctly', () => {
        const initialState = useMapartStore.getState();
        
        useMapartStore.getState().setPaletteVersion('1.20');
        expect(useMapartStore.getState().paletteVersion).toBe('1.20');
        
        useMapartStore.getState().setBuildMode('2d');
        expect(useMapartStore.getState().buildMode).toBe('2d');
        
        useMapartStore.getState().setDithering('floyd-steinberg');
        expect(useMapartStore.getState().dithering).toBe('floyd-steinberg');
        
        useMapartStore.getState().setGridDimensions({ x: 2, y: 2 });
        expect(useMapartStore.getState().gridDimensions).toEqual({ x: 2, y: 2 });
        
        useMapartStore.setState(initialState);
    });

    it('exports expected types', () => {
        const state: MapartState = useMapartStore.getState();
        expect(state).toBeDefined();
    });
});

describe('Grid dimension limits', () => {
    beforeEach(() => {
        useMapartStore.setState({
            gridDimensions: { x: 1, y: 1 },
            memoryEstimate: estimateMemoryUsage(1, 1),
            manualEdits: {},
            history: [],
            historyIndex: 0,
        });
    });

    it('allows valid grid within limit', () => {
        useMapartStore.getState().setGridDimensions({ x: 8, y: 8 });
        expect(useMapartStore.getState().gridDimensions).toEqual({ x: 8, y: 8 });
    });

    it('clamps X when product exceeds limit', () => {
        useMapartStore.getState().setGridDimensions({ x: 1, y: 8 });
        useMapartStore.getState().setGridDimensions({ x: 9, y: 8 });
        const dims = useMapartStore.getState().gridDimensions;
        expect(dims.x * dims.y).toBeLessThanOrEqual(MAX_MAPS_TOTAL);
        expect(dims.x).toBeLessThanOrEqual(Math.floor(MAX_MAPS_TOTAL / 8));
    });

    it('clamps Y when product exceeds limit', () => {
        useMapartStore.getState().setGridDimensions({ x: 8, y: 1 });
        useMapartStore.getState().setGridDimensions({ x: 8, y: 9 });
        const dims = useMapartStore.getState().gridDimensions;
        expect(dims.x * dims.y).toBeLessThanOrEqual(MAX_MAPS_TOTAL);
        expect(dims.y).toBeLessThanOrEqual(Math.floor(MAX_MAPS_TOTAL / 8));
    });

    it('allows 64x1 grid (exactly at limit)', () => {
        useMapartStore.getState().setGridDimensions({ x: 64, y: 1 });
        expect(useMapartStore.getState().gridDimensions).toEqual({ x: 64, y: 1 });
    });

    it('allows 1x64 grid (exactly at limit)', () => {
        useMapartStore.getState().setGridDimensions({ x: 1, y: 64 });
        expect(useMapartStore.getState().gridDimensions).toEqual({ x: 1, y: 64 });
    });

    it('clamps 65x1 to 64x1', () => {
        useMapartStore.getState().setGridDimensions({ x: 65, y: 1 });
        expect(useMapartStore.getState().gridDimensions).toEqual({ x: 64, y: 1 });
    });

    it('clamps 1x65 to 1x64', () => {
        useMapartStore.getState().setGridDimensions({ x: 1, y: 65 });
        expect(useMapartStore.getState().gridDimensions).toEqual({ x: 1, y: 64 });
    });

    it('updates memoryEstimate when grid changes', () => {
        useMapartStore.getState().setGridDimensions({ x: 4, y: 4 });
        const estimate = useMapartStore.getState().memoryEstimate;
        expect(estimate.totalMaps).toBe(16);
        expect(estimate.width).toBe(512);
        expect(estimate.height).toBe(512);
    });
});

describe('clampGridDimensions', () => {
    it('returns unchanged when within limit', () => {
        expect(clampGridDimensions(8, 8, 1, 1)).toEqual({ x: 8, y: 8 });
    });

    it('clamps X when X changed and exceeds limit', () => {
        expect(clampGridDimensions(10, 10, 8, 10)).toEqual({ x: 6, y: 10 });
    });

    it('clamps Y when Y changed and exceeds limit', () => {
        expect(clampGridDimensions(10, 10, 10, 8)).toEqual({ x: 10, y: 6 });
    });

    it('handles edge case of 1 on one axis', () => {
        expect(clampGridDimensions(65, 1, 64, 1)).toEqual({ x: 64, y: 1 });
        expect(clampGridDimensions(1, 65, 1, 64)).toEqual({ x: 1, y: 64 });
    });
});

describe('estimateMemoryUsage', () => {
    it('returns low risk for small grids', () => {
        const est = estimateMemoryUsage(1, 1);
        expect(est.riskLevel).toBe('low');
        expect(est.estimatedMB).toBeCloseTo(1.6, 0);
    });

    it('returns medium risk for medium grids', () => {
        const est = estimateMemoryUsage(5, 5);
        expect(est.riskLevel).toBe('medium');
    });

    it('returns high risk for large grids', () => {
        const est = estimateMemoryUsage(10, 10);
        expect(est.riskLevel).toBe('high');
    });

    it('marks exceedsSoftLimit when over 32 maps', () => {
        expect(estimateMemoryUsage(6, 6).exceedsSoftLimit).toBe(true);
        expect(estimateMemoryUsage(5, 6).exceedsSoftLimit).toBe(false);
    });

    it('marks exceedsHardLimit when over 64 maps', () => {
        expect(estimateMemoryUsage(9, 8).exceedsHardLimit).toBe(true);
        expect(estimateMemoryUsage(8, 8).exceedsHardLimit).toBe(false);
    });
});
