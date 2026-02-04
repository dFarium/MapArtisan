export interface RGB {
    r: number;
    g: number;
    b: number;
}

export type BrightnessLevel = 'lowest' | 'low' | 'normal' | 'high';

export interface ManualEdit {
    blockId: string;
    brightness: BrightnessLevel;
    rgb: RGB;
    needsSupport?: boolean;
}

export interface MapartStats {
    minHeight: number;
    maxHeight: number;
    heightMap: Int32Array; // Stores the vertical range (max-min) per column
}

export interface PaletteBlock {
    id: string;
    needsSupport: boolean;
    introducedIn: string;
}

export interface PaletteColor {
    colorID: number;
    colorName: string;
    blocks: PaletteBlock[];
    brightnessValues: Record<BrightnessLevel, RGB>;
}

export interface PaletteData {
    colors: PaletteColor[];
}

export type BuildMode = '2d' | '3d_valley' | 'staircase';
