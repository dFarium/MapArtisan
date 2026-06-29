import { describe, it, expect } from 'vitest';
import { useMapartStore, type MapartState } from '../useMapartStore';

describe('useMapartStore - Regression Tests', () => {
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
