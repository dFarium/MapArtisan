/**
 * Legacy Schematic Export Backup
 * 
 * Note: This module is currently NOT imported or used by the application UI.
 * It remains as a backup reference for exporting old legacy schematic NBT structures.
 */

import { TagTypes, serializeNBT, type NBTRoot, type NBTCompound } from './nbtWriter';
import type { BrightnessLevel, PaletteData } from '../types/mapart';
import paletteData from '../data/palette.json';

import { getDataVersion, DEFAULT_VERSION } from '../data/supportedVersions';

export interface BlockPosition {
    x: number;
    y: number;
    z: number;
}

export interface BlockState extends BlockPosition {
    blockId: string;
    properties?: Record<string, string>;
}

export interface SchematicMetadata {
    author?: string;
    name?: string;
}

/**
 * Convert canvas ImageData to block states for legacy NBT export.
 * Note: Uses old array-of-objects structure for historical compatibility.
 */
export function imageDataToBlockStates(
    imageData: ImageData,
    selectedPaletteItems: Record<number, string | null>,
    buildMode: '2d' | '3d_valley' | '3d_valley_lossy'
): BlockState[] {
    const { width, height, data } = imageData;
    const blockStates: BlockState[] = [];
    const palette = (paletteData as unknown as PaletteData).colors;

    // Create RGB to color lookup
    const rgbToColor = new Map<number, { colorID: number; brightness: BrightnessLevel }>();

    for (const color of palette) {
        if (!selectedPaletteItems[color.colorID]) continue;

        for (const [brightness, rgb] of Object.entries(color.brightnessValues)) {
            const key = (rgb.r << 16) | (rgb.g << 8) | rgb.b;
            rgbToColor.set(key, {
                colorID: color.colorID,
                brightness: brightness as BrightnessLevel,
            });
        }
    }

    // Process pixels column by column (Minecraft X axis)
    for (let x = 0; x < width; x++) {
        let currentHeight = buildMode === '2d' ? 2 : 0; // Start height

        // Add noobline scaffold at z=0
        blockStates.push({
            x,
            y: currentHeight,
            z: 0,
            blockId: 'minecraft:stone', // Support block
        });

        // Process each pixel in the column (Minecraft Z axis)
        for (let z = 0; z < height; z++) {
            const idx = (z * width + x) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            const key = (r << 16) | (g << 8) | b;

            const colorInfo = rgbToColor.get(key);
            if (!colorInfo) continue; // Skip unmapped colors

            const blockId = selectedPaletteItems[colorInfo.colorID];
            if (!blockId) continue;

            // Adjust height based on brightness (compared to north block)
            // high = lighter = higher, low = darker = lower
            if (colorInfo.brightness === 'high') currentHeight += 1;
            else if (colorInfo.brightness === 'low') currentHeight -= 1;

            // Add main block
            blockStates.push({
                x,
                y: currentHeight,
                z: z + 1, // +1 because noobline is at z=0
                blockId,
            });

            // Add support block below for 3D modes
            if (buildMode !== '2d') {
                if (colorInfo.brightness !== 'normal') {
                    blockStates.push({
                        x,
                        y: currentHeight - 1,
                        z: z + 1,
                        blockId: 'minecraft:stone',
                    });
                }
            }
        }
    }

    return blockStates;
}

/**
 * Compiles a legacy NBT compound representation for classic schematic format.
 */
export function createSchematicNBT(
    blockStates: BlockState[],
    metadata: SchematicMetadata = {},
    targetVersion: string = DEFAULT_VERSION
): NBTRoot {
    // Build palette: unique blocks
    const paletteMap = new Map<string, number>();
    const paletteBlocks: NBTCompound[] = [];

    for (const block of blockStates) {
        const key = block.properties
            ? `${block.blockId}[${Object.entries(block.properties)
                .map(([k, v]) => `${k}=${v}`)
                .join(',')}]`
            : block.blockId;

        if (!paletteMap.has(key)) {
            const paletteEntry: NBTCompound = {
                Name: {
                    type: TagTypes.STRING,
                    value: block.blockId,
                },
            };

            if (block.properties && Object.keys(block.properties).length > 0) {
                const props: NBTCompound = {};
                for (const [propKey, propValue] of Object.entries(block.properties)) {
                    props[propKey] = {
                        type: TagTypes.STRING,
                        value: propValue,
                    };
                }
                paletteEntry.Properties = {
                    type: TagTypes.COMPOUND,
                    value: props,
                };
            }

            paletteMap.set(key, paletteBlocks.length);
            paletteBlocks.push(paletteEntry);
        }
    }

    // Calculate dimensions
    let maxX = 0;
    let maxY = 0;
    let maxZ = 0;
    for (let i = 0; i < blockStates.length; i++) {
        const b = blockStates[i];
        if (b.x > maxX) maxX = b.x;
        if (b.y > maxY) maxY = b.y;
        if (b.z > maxZ) maxZ = b.z;
    }
    maxX += 1;
    maxY += 1;
    maxZ += 1;

    // Create blocks list
    const blocks: NBTCompound[] = [];
    for (const block of blockStates) {
        const key = block.properties
            ? `${block.blockId}[${Object.entries(block.properties)
                .map(([k, v]) => `${k}=${v}`)
                .join(',')}]`
            : block.blockId;

        const paletteId = paletteMap.get(key) ?? 0;

        blocks.push({
            pos: {
                type: TagTypes.LIST,
                value: {
                    type: TagTypes.INT,
                    value: [block.x, block.y, block.z],
                },
            },
            state: {
                type: TagTypes.INT,
                value: paletteId,
            },
        });
    }

    // Build NBT structure
    const nbt: NBTRoot = {
        name: '',
        value: {
            blocks: {
                type: TagTypes.LIST,
                value: {
                    type: TagTypes.COMPOUND,
                    value: blocks,
                },
            },
            entities: {
                type: TagTypes.LIST,
                value: {
                    type: TagTypes.COMPOUND,
                    value: [], // Entities list is empty for now
                },
            },
            palette: {
                type: TagTypes.LIST,
                value: {
                    type: TagTypes.COMPOUND,
                    value: paletteBlocks,
                },
            },
            size: {
                type: TagTypes.LIST,
                value: {
                    type: TagTypes.INT,
                    value: [maxX, maxY, maxZ],
                },
            },
            author: {
                type: TagTypes.STRING,
                value: metadata.author || 'MapArtisan',
            },
            DataVersion: {
                type: TagTypes.INT,
                value: getDataVersion(targetVersion),
            },
        },
    };

    return nbt;
}

/**
 * Export ImageData to schematic file
 */
export function exportSchematic(
    imageData: ImageData,
    selectedPaletteItems: Record<number, string | null>,
    buildMode: '2d' | '3d_valley' | '3d_valley_lossy',
    metadata: SchematicMetadata = {},
    targetVersion: string = DEFAULT_VERSION
): Uint8Array {
    const blockStates = imageDataToBlockStates(imageData, selectedPaletteItems, buildMode);
    const nbt = createSchematicNBT(blockStates, metadata, targetVersion);
    return serializeNBT(nbt);
}

/**
 * Download schematic as .nbt file
 */
export function downloadSchematic(
    imageData: ImageData,
    selectedPaletteItems: Record<number, string | null>,
    buildMode: '2d' | '3d_valley' | '3d_valley_lossy',
    filename: string = 'mapart.nbt',
    metadata: SchematicMetadata = {},
    targetVersion: string = DEFAULT_VERSION
): void {
    const nbtData = exportSchematic(imageData, selectedPaletteItems, buildMode, metadata, targetVersion);
    // nbtData is already a Uint8Array, cast to BlobPart for type compatibility
    const blob = new Blob([nbtData as BlobPart], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
}
