/**
 * Export Types
 * Shared types for Litematica export functionality
 */

export const LITEMATICA_VERSION = 7;

export interface BlockWithCoords {
    blockId: string;
    properties?: Record<string, string>;
    x: number;
    y: number;
    z: number;
}

export interface BlockStatesBuffers {
    x: Int32Array;
    y: Int32Array;
    z: Int32Array;
    palette: string[];
    paletteIndices: Uint32Array;
    count: number;
}

export interface LitematicaMetadata {
    author?: string;
    name?: string;
    description?: string;
}
