import { create } from 'zustand';
import type { MapartStats, ManualEdit } from '../types/mapart';

export type BuildMode = '2d' | '3d_valley';
export type BlockSupport = 'all' | 'needed' | 'survival';
export type ImageFitMode = 'adjust' | 'crop';

export interface ImageSettings {
    saturation: number;
    brightness: number;
    contrast: number;
}

export interface GridDimensions {
    x: number;
    y: number;
}

export interface TransparencySettings {
    enabled: boolean;
    color: string;
}

export interface CropSettings {
    zoom: number;
    offsetX: number;
    offsetY: number;
}

const defaultCropSettings: CropSettings = {
    zoom: 1,
    offsetX: 0,
    offsetY: 0
};

export interface MapartState {
    paletteVersion: string;
    imageSettings: ImageSettings;
    gridDimensions: GridDimensions;
    buildMode: BuildMode;
    blockSupport: BlockSupport;
    dithering: string;
    transparency: TransparencySettings;
    uploadedImage: File | null;
    previewUrl: string | null;
    imageFitMode: ImageFitMode;
    cropSettings: CropSettings;
    selectedPaletteItems: Record<number, string | null>;
    threeDPrecision: number;
    useCielab: boolean;
    hybridStrength: number;
    mapartStats: MapartStats | null;
    independentMaps: boolean;
    manualEdits: Record<number, ManualEdit>;
    isPainting: boolean;
    brushBlock: ManualEdit | null;

    // Actions
    setPaletteVersion: (version: string) => void;
    setImageSettings: (settings: Partial<ImageSettings> | ((prev: ImageSettings) => ImageSettings)) => void;
    setGridDimensions: (dim: GridDimensions) => void;
    setBuildMode: (mode: BuildMode) => void;
    setBlockSupport: (support: BlockSupport) => void;
    setDithering: (dithering: string) => void;
    setTransparency: (settings: Partial<TransparencySettings>) => void;
    setUploadedImage: (file: File | null) => void;
    setImageFitMode: (mode: ImageFitMode) => void;
    setCropSettings: (settings: Partial<CropSettings> | ((prev: CropSettings) => CropSettings)) => void;
    resetCropSettings: () => void;
    setSelectedPaletteItems: (items: Record<number, string | null> | ((prev: Record<number, string | null>) => Record<number, string | null>)) => void;
    setThreeDPrecision: (value: number) => void;
    setUseCielab: (value: boolean) => void;
    setHybridStrength: (value: number) => void;
    setMapartStats: (stats: MapartStats | null) => void;
    setIndependentMaps: (value: boolean) => void;
    setManualEdit: (index: number, data: ManualEdit) => void;
    clearManualEdits: () => void;
    setIsPainting: (isPainting: boolean) => void;
    setBrushBlock: (block: ManualEdit | null) => void;
}



export const useMapartStore = create<MapartState>((set) => ({
    paletteVersion: '1.21.11',
    imageSettings: { saturation: 100, brightness: 0, contrast: 0 },
    gridDimensions: { x: 1, y: 1 },
    buildMode: '2d',
    blockSupport: 'all',
    dithering: 'floyd-steinberg',
    transparency: { enabled: true, color: '#ffffff' },
    uploadedImage: null,
    previewUrl: null,
    imageFitMode: 'adjust',
    cropSettings: defaultCropSettings,
    selectedPaletteItems: {},
    threeDPrecision: 100,
    useCielab: true,
    hybridStrength: 50,
    mapartStats: null,
    independentMaps: true,
    manualEdits: {},
    isPainting: false,
    brushBlock: null,

    // Actions
    setPaletteVersion: (version) => set({ paletteVersion: version }),
    setImageSettings: (settings) => set((state) => ({
        imageSettings: typeof settings === 'function' ? settings(state.imageSettings) : { ...state.imageSettings, ...settings },
        manualEdits: {} // Clear manual edits on image setting change
    })),
    setGridDimensions: (dim) => set({ gridDimensions: dim }),
    setBuildMode: (mode) => set({
        buildMode: mode,
        manualEdits: {} // Clear manual edits on build mode change
    }),
    setBlockSupport: (support) => set({ blockSupport: support }),
    setDithering: (dithering) => set({
        dithering,
        manualEdits: {} // Clear manual edits on dithering change
    }),
    setTransparency: (settings) => set((state) => ({ transparency: { ...state.transparency, ...settings } })),
    setUploadedImage: (file) => set((state) => {
        if (state.previewUrl) {
            URL.revokeObjectURL(state.previewUrl);
        }
        const url = file ? URL.createObjectURL(file) : null;
        return { uploadedImage: file, previewUrl: url, manualEdits: {} };
    }),
    setImageFitMode: (mode) => set({ imageFitMode: mode, manualEdits: {} }), // Clear edits on fit mode change
    setCropSettings: (settings) => set((state) => ({
        cropSettings: typeof settings === 'function' ? settings(state.cropSettings) : { ...state.cropSettings, ...settings },
        manualEdits: {} // Clear edits on crop change
    })),
    resetCropSettings: () => set({
        cropSettings: { zoom: 1, offsetX: 0, offsetY: 0 },
        manualEdits: {}
    }),
    setSelectedPaletteItems: (items) => set((state) => ({
        selectedPaletteItems: typeof items === 'function' ? items(state.selectedPaletteItems) : items,
        manualEdits: {} // Clear edits on palette change
    })),
    setThreeDPrecision: (value) => set({
        threeDPrecision: value,
        manualEdits: {} // Clear edits on precision change
    }),
    setUseCielab: (value) => set({
        useCielab: value,
        manualEdits: {} // Clear edits on algorithm change
    }),
    setHybridStrength: (value) => set({
        hybridStrength: value,
        manualEdits: {}
    }),
    setMapartStats: (stats) => set({ mapartStats: stats }),
    setIndependentMaps: (value) => set({ independentMaps: value }),
    setManualEdit: (index, data) => set((state) => ({
        manualEdits: { ...state.manualEdits, [index]: data }
    })),
    clearManualEdits: () => set({ manualEdits: {} }),
    setIsPainting: (isPainting) => set({ isPainting }),
    setBrushBlock: (block) => set({ brushBlock: block }),
}));
