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

export interface LitematicaMetadata {
    author?: string;
    name?: string;
    description?: string;
}
