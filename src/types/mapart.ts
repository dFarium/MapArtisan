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
}

export interface MapartStats {
    minHeight: number;
    maxHeight: number;
    heightMap: Int32Array; // Stores the vertical range (max-min) per column
}
// ... existing code ...
export interface MapartStats {
    minHeight: number;
    maxHeight: number;
    heightMap: Int32Array; // Stores the vertical range (max-min) per column
}

export type BuildMode = '2d' | '3d_valley' | 'staircase';
