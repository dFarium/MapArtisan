export interface PaletteColor {
    colorID: number;
    colorName: string;

    brightnessValues: {
        lowest: { r: number; g: number; b: number; };
        low: { r: number; g: number; b: number; };
        normal: { r: number; g: number; b: number; };
        high: { r: number; g: number; b: number; };
    };
    blocks: { id: string; needsSupport: boolean }[];
}

export type PaletteSelection = Record<number, string | null>;
