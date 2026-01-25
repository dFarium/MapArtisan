import { createContext, useContext, useState, type ReactNode } from 'react';
import type { MapartStats } from '../utils/mapartProcessing';

export type BuildMode = '2d' | '3d_valley' | '3d_valley_lossy';
export type BlockSupport = 'all' | 'needed' | 'survival';
export type ImageFitMode = 'adjust' | 'crop';

export interface ImageSettings {
    saturation: number; // 0-200, default 100
    brightness: number; // -100 to 100, default 0
    contrast: number;   // -100 to 100, default 0
}

export interface GridDimensions {
    x: number;
    y: number;
}

export interface TransparencySettings {
    enabled: boolean;
    color: string; // Hex color
}

export interface CropSettings {
    zoom: number;      // 1 = 100%, 2 = 200%, etc.
    offsetX: number;   // -1 to 1, where 0 is centered
    offsetY: number;   // -1 to 1, where 0 is centered
}

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
    threeDPrecision: number; // 0-100, 0=flat, 100=precise
    useCielab: boolean;
    hybridStrength: number; // 0-100, controls error diffusion strength in flat areas
    mapartStats: MapartStats | null;
    independentMaps: boolean; // If true, resets height/error at 128px boundaries
}

interface MapartContextType extends MapartState {
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

const defaultCropSettings: CropSettings = {
    zoom: 1,
    offsetX: 0,
    offsetY: 0
};

const defaultState: MapartState = {
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
};

const MapartContext = createContext<MapartContextType | undefined>(undefined);

export const MapartProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [paletteVersion, setPaletteVersion] = useState(defaultState.paletteVersion);
    const [imageSettings, setImageSettingsState] = useState(defaultState.imageSettings);
    const [gridDimensions, setGridDimensions] = useState(defaultState.gridDimensions);
    const [buildMode, setBuildMode] = useState(defaultState.buildMode);
    const [blockSupport, setBlockSupport] = useState(defaultState.blockSupport);
    const [dithering, setDithering] = useState(defaultState.dithering);
    const [transparency, setTransparencyState] = useState(defaultState.transparency);
    const [uploadedImage, setUploadedImageState] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [imageFitMode, setImageFitMode] = useState<ImageFitMode>(defaultState.imageFitMode);
    const [cropSettings, setCropSettingsState] = useState<CropSettings>(defaultCropSettings);

    const setCropSettings = (settings: Partial<CropSettings> | ((prev: CropSettings) => CropSettings)) => {
        setCropSettingsState(prev => {
            if (typeof settings === 'function') return settings(prev);
            return { ...prev, ...settings };
        });
    };

    const resetCropSettings = () => setCropSettingsState(defaultCropSettings);

    const setImageSettings = (settings: Partial<ImageSettings> | ((prev: ImageSettings) => ImageSettings)) => {
        setImageSettingsState(prev => {
            if (typeof settings === 'function') return settings(prev);
            return { ...prev, ...settings };
        });
    };

    const setTransparency = (settings: Partial<TransparencySettings>) => {
        setTransparencyState(prev => ({ ...prev, ...settings }));
    };

    const [selectedPaletteItems, setSelectedPaletteItems] = useState<Record<number, string | null>>({});
    const [threeDPrecision, setThreeDPrecision] = useState(defaultState.threeDPrecision);
    const [useCielab, setUseCielab] = useState(defaultState.useCielab);
    const [hybridStrength, setHybridStrength] = useState(defaultState.hybridStrength);
    const [mapartStats, setMapartStats] = useState<MapartStats | null>(null);
    const [independentMaps, setIndependentMaps] = useState(defaultState.independentMaps);


    const setUploadedImage = (file: File | null) => {
        setUploadedImageState(file);
        if (file) {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            setPreviewUrl(URL.createObjectURL(file));
        } else {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            setPreviewUrl(null);
        }
    };

    const value = {
        paletteVersion,
        imageSettings,
        gridDimensions,
        buildMode,
        blockSupport,
        dithering,
        transparency,
        uploadedImage,
        previewUrl,
        imageFitMode,
        cropSettings,
        selectedPaletteItems,
        setPaletteVersion,
        setImageSettings,
        setGridDimensions,
        setBuildMode,
        setBlockSupport,
        setDithering,
        setTransparency,
        setUploadedImage,
        setImageFitMode,
        setCropSettings,
        resetCropSettings,
        setSelectedPaletteItems,
        threeDPrecision,
        setThreeDPrecision,
        useCielab,
        setUseCielab,
        hybridStrength,
        setHybridStrength,
        mapartStats,
        setMapartStats,
        independentMaps, setIndependentMaps,
    };

    return (
        <MapartContext.Provider value={value}>
            {children}
        </MapartContext.Provider>
    );
};

export const useMapart = () => {
    const context = useContext(MapartContext);
    if (context === undefined) {
        throw new Error('useMapart must be used within a MapartProvider');
    }
    return context;
};
