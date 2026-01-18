import { createContext, useContext, useState, type ReactNode } from 'react';

export type BuildMode = '2d' | '3d_valley' | '3d_valley_lossy';
export type BlockSupport = 'all' | 'needed' | 'survival';

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
    selectedPaletteItems: Record<number, string | null>;
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
    setSelectedPaletteItems: (items: Record<number, string | null> | ((prev: Record<number, string | null>) => Record<number, string | null>)) => void;
}

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
    selectedPaletteItems: {},
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

    // Cleanup URL on unmount could be added via useEffect, but for now simple set is okay.

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
        setPaletteVersion,
        setImageSettings,
        setGridDimensions,
        setBuildMode,
        setBlockSupport,
        setDithering,
        setTransparency,
        setUploadedImage,
        selectedPaletteItems,
        setSelectedPaletteItems,
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
