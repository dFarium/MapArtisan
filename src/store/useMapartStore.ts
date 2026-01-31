import { create } from 'zustand';
import type { MapartStats } from '../utils/mapartProcessing';

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
    threeDPrecision: 50,
    useCielab: true,
    hybridStrength: 50,
    mapartStats: null,
    independentMaps: true,

    setPaletteVersion: (version) => set({ paletteVersion: version }),
    setImageSettings: (settings) => set((state) => ({
        imageSettings: typeof settings === 'function' ? settings(state.imageSettings) : { ...state.imageSettings, ...settings }
    })),
    setGridDimensions: (dim) => set({ gridDimensions: dim }),
    setBuildMode: (mode) => set({ buildMode: mode }),
    setBlockSupport: (support) => set({ blockSupport: support }),
    setDithering: (dithering) => set({ dithering }),
    setTransparency: (settings) => set((state) => ({
        transparency: { ...state.transparency, ...settings }
    })),
    setUploadedImage: (file) => set((state) => {
        if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
        return {
            uploadedImage: file,
            previewUrl: file ? URL.createObjectURL(file) : null
        };
    }),
    setImageFitMode: (mode) => set({ imageFitMode: mode }),
    setCropSettings: (settings) => set((state) => ({
        cropSettings: typeof settings === 'function' ? settings(state.cropSettings) : { ...state.cropSettings, ...settings }
    })),
    resetCropSettings: () => set({ cropSettings: defaultCropSettings }),
    setSelectedPaletteItems: (items) => set((state) => ({
        selectedPaletteItems: typeof items === 'function' ? items(state.selectedPaletteItems) : items
    })),
    setThreeDPrecision: (value) => set({ threeDPrecision: value }),
    setUseCielab: (value) => set({ useCielab: value }),
    setHybridStrength: (value) => set({ hybridStrength: value }),
    setMapartStats: (stats) => set({ mapartStats: stats }),
    setIndependentMaps: (value) => set({ independentMaps: value }),
}));
