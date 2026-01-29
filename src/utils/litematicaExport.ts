import { TagTypes, serializeNBT, type NBTRoot, type NBTCompound } from './nbtWriter';
import type { BrightnessLevel, PaletteColor, DitheringMode } from './mapartProcessing';
import { processMapart } from './mapartProcessing';
import * as bitArray from './litematicaBitArray';
import paletteData from '../data/palette_1_21_11.json';

const MINECRAFT_DATA_VERSION = 4671; // 1.21.11
const LITEMATICA_VERSION = 7;

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

/**
 * Generate block positions from processed image data.
 * Calls processMapart internally to ensure colors match the preview exactly.
 */
export function imageDataToBlockStates(
    imageData: ImageData,
    selectedPaletteItems: Record<number, string | null>,
    buildMode: '2d' | '3d_valley' | '3d_valley_lossy',
    applyOptimization: boolean = true,
    threeDPrecision: number = 0,
    dithering: DitheringMode = 'none',
    useCielab: boolean = true,
    hybridStrength: number = 50,
    independentMaps: boolean = false
): BlockWithCoords[] {
    // Process image to get exact same colors as preview
    const { imageData: processedImageData } = processMapart(
        imageData,
        buildMode,
        selectedPaletteItems,
        threeDPrecision,
        dithering,
        useCielab,
        hybridStrength,
        independentMaps
    );

    const { width, height, data } = processedImageData;
    const blockStates: BlockWithCoords[] = [];
    const palette = (paletteData as any).colors as PaletteColor[];

    // Build RGB lookup map - include blockId directly
    const rgbToColor = new Map<number, { colorID: number; brightness: BrightnessLevel; blockId: string }>();
    for (const color of palette) {
        const blockId = selectedPaletteItems[color.colorID];
        if (!blockId) continue;

        for (const [brightness, rgb] of Object.entries(color.brightnessValues)) {
            const key = (rgb.r << 16) | (rgb.g << 8) | rgb.b;
            rgbToColor.set(key, {
                colorID: color.colorID,
                brightness: brightness as BrightnessLevel,
                blockId: blockId
            });
        }
    }

    const is2D = buildMode === '2d';

    // Store blocks organized by column for per-column optimization
    const columnBlocks: Map<number, BlockWithCoords[]> = new Map();

    // Process each column (X axis in Minecraft)
    for (let x = 0; x < width; x++) {
        const currentColumnBlocks: BlockWithCoords[] = [];
        let currentHeight = 0;

        // Noobline Y is set based on the first block's brightness
        let nooblineY = 0;

        // Process each row (Y in image -> Z in Minecraft)
        for (let y = 0; y < height; y++) {
            const idx = (y * width + x) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            const key = (r << 16) | (g << 8) | b;

            const colorInfo = rgbToColor.get(key);
            if (!colorInfo) continue;

            // Set noobline height based on first block's brightness
            if (y === 0) {
                nooblineY = colorInfo.brightness === 'high' ? -1
                    : colorInfo.brightness === 'low' ? 1 : 0;
            }

            let blockY: number;

            if (is2D) {
                // 2D: all blocks at Y=0
                blockY = 0;
            } else {
                // Adjust height based on brightness (compared to north block)
                // high = lighter = higher, low = darker = lower
                if (colorInfo.brightness === 'high') currentHeight++;
                else if (colorInfo.brightness === 'low') currentHeight--;

                blockY = currentHeight;
            }

            // Add main block at z=y+1 (offset for noobline at z=0)
            currentColumnBlocks.push({
                blockId: colorInfo.blockId,
                x,
                y: blockY,
                z: y + 1,
            });

            // Add support block below for 3D modes
            if (!is2D && blockY !== 0) {
                currentColumnBlocks.push({
                    blockId: 'minecraft:stone',
                    x,
                    y: blockY - 1,
                    z: y + 1,
                });
            }
        }

        // Add noobline at z=0 (north padding block)
        currentColumnBlocks.push({
            blockId: 'minecraft:stone',
            x,
            y: is2D ? 0 : nooblineY,
            z: 0,
        });

        // For 3D modes: center column around Y=0 to minimize absolute height
        if (!is2D && currentColumnBlocks.length > 0 && applyOptimization) {
            const columnMinY = Math.min(...currentColumnBlocks.map(b => b.y));
            const columnMaxY = Math.max(...currentColumnBlocks.map(b => b.y));
            const midpoint = Math.floor((columnMinY + columnMaxY) / 2);

            for (const block of currentColumnBlocks) {
                block.y -= midpoint;
            }
        }

        columnBlocks.set(x, currentColumnBlocks);
    }

    // Flatten all column blocks into single array
    for (const blocks of columnBlocks.values()) {
        blockStates.push(...blocks);
    }

    // Final global normalization: shift entire schematic so global minY = 0
    const globalMinY = Math.min(...blockStates.map(b => b.y), 0);
    if (globalMinY < 0) {
        for (const block of blockStates) {
            block.y -= globalMinY;
        }
    }

    return blockStates;
}

/**
 * Create Litematica NBT structure from block states
 */
export function createLitematicaNBT(
    blockStates: BlockWithCoords[],
    metadata: LitematicaMetadata = {}
): NBTRoot {
    // Calculate dimensions
    const maxX = Math.max(...blockStates.map(b => b.x), 0) + 1;
    const maxY = Math.max(...blockStates.map(b => b.y), 0) + 1;
    const maxZ = Math.max(...blockStates.map(b => b.z), 0) + 1;
    const volume = maxX * maxY * maxZ;

    // Build palette (AIR first, then unique blocks)
    const paletteBlocks: any[] = [
        { Name: { type: TagTypes.STRING, value: 'minecraft:air' } }
    ];
    const paletteMap = new Map<string, number>();
    paletteMap.set('minecraft:air', 0);

    for (const block of blockStates) {
        const key = block.properties
            ? `${block.blockId}[${Object.entries(block.properties)
                .map(([k, v]) => `${k}=${v}`)
                .join(',')}]`
            : block.blockId;

        if (!paletteMap.has(key)) {
            const paletteEntry: any = {
                Name: { type: TagTypes.STRING, value: block.blockId },
            };

            if (block.properties && Object.keys(block.properties).length > 0) {
                const props: NBTCompound = {};
                for (const [k, v] of Object.entries(block.properties)) {
                    props[k] = { type: TagTypes.STRING, value: v };
                }
                paletteEntry.Properties = { type: TagTypes.COMPOUND, value: props };
            }

            paletteMap.set(key, paletteBlocks.length);
            paletteBlocks.push(paletteEntry);
        }
    }

    // Create block index (coordinate -> palette index)
    const blockIndex = new Map<string, number>();
    for (const block of blockStates) {
        const coordKey = `${block.x}:${block.y}:${block.z}`;
        const blockKey = block.properties
            ? `${block.blockId}[${Object.entries(block.properties)
                .map(([k, v]) => `${k}=${v}`)
                .join(',')}]`
            : block.blockId;

        const paletteIdx = paletteMap.get(blockKey) ?? 0;

        // Prioritize non-stone blocks (colored blocks win over support blocks)
        const existing = blockIndex.get(coordKey);
        if (existing === undefined || block.blockId !== 'minecraft:stone') {
            blockIndex.set(coordKey, paletteIdx);
        }
    }

    // Pack blocks into bit array
    let bitArrayData = bitArray.createBitArray(volume, paletteBlocks.length);
    for (let x = 0; x < maxX; x++) {
        for (let z = 0; z < maxZ; z++) {
            for (let y = 0; y < maxY; y++) {
                const coordKey = `${x}:${y}:${z}`;
                const paletteIndex = blockIndex.get(coordKey) ?? 0; // AIR by default
                const blockCoord = (y * maxZ + z) * maxX + x;
                bitArrayData = bitArray.set(bitArrayData, blockCoord, paletteIndex);
            }
        }
    }

    // Create NBT structure
    const now = Date.now();
    const nbt: NBTRoot = {
        name: '',
        value: {
            MinecraftDataVersion: { type: TagTypes.INT, value: MINECRAFT_DATA_VERSION },
            Version: { type: TagTypes.INT, value: LITEMATICA_VERSION },
            Metadata: {
                type: TagTypes.COMPOUND,
                value: {
                    TimeCreated: {
                        type: TagTypes.LONG,
                        value: [Math.floor(now / 0x100000000), now % 0x100000000],
                    },
                    TimeModified: {
                        type: TagTypes.LONG,
                        value: [Math.floor(now / 0x100000000), now % 0x100000000],
                    },
                    EnclosingSize: {
                        type: TagTypes.COMPOUND,
                        value: {
                            x: { type: TagTypes.INT, value: maxX },
                            y: { type: TagTypes.INT, value: maxY },
                            z: { type: TagTypes.INT, value: maxZ },
                        },
                    },
                    Description: {
                        type: TagTypes.STRING,
                        value: metadata.description || 'MapArt created by mapart-creator',
                    },
                    RegionCount: { type: TagTypes.INT, value: 1 },
                    TotalBlocks: { type: TagTypes.INT, value: blockStates.length },
                    Author: {
                        type: TagTypes.STRING,
                        value: metadata.author || 'mapart-creator',
                    },
                    TotalVolume: { type: TagTypes.INT, value: volume },
                    Name: {
                        type: TagTypes.STRING,
                        value: metadata.name || 'MapArt',
                    },
                },
            },
            Regions: {
                type: TagTypes.COMPOUND,
                value: {
                    map: {
                        type: TagTypes.COMPOUND,
                        value: {
                            BlockStates: {
                                type: TagTypes.LONG_ARRAY,
                                value: bitArrayData.array,
                            },
                            BlockStatePalette: {
                                type: TagTypes.LIST,
                                value: {
                                    type: TagTypes.COMPOUND,
                                    value: paletteBlocks,
                                },
                            },
                            Size: {
                                type: TagTypes.COMPOUND,
                                value: {
                                    x: { type: TagTypes.INT, value: maxX },
                                    y: { type: TagTypes.INT, value: maxY },
                                    z: { type: TagTypes.INT, value: maxZ },
                                },
                            },
                            Position: {
                                type: TagTypes.COMPOUND,
                                value: {
                                    x: { type: TagTypes.INT, value: 0 },
                                    y: { type: TagTypes.INT, value: 0 },
                                    z: { type: TagTypes.INT, value: 0 },
                                },
                            },
                            PendingBlockTicks: {
                                type: TagTypes.LIST,
                                value: { type: TagTypes.END, value: [] },
                            },
                            PendingFluidTicks: {
                                type: TagTypes.LIST,
                                value: { type: TagTypes.END, value: [] },
                            },
                            TileEntities: {
                                type: TagTypes.LIST,
                                value: { type: TagTypes.END, value: [] },
                            },
                            Entities: {
                                type: TagTypes.LIST,
                                value: { type: TagTypes.END, value: [] },
                            },
                        },
                    },
                },
            },
        },
    };

    return nbt;
}

/**
 * Export and download Litematica file
 */
export function downloadLitematica(
    imageData: ImageData,
    selectedPaletteItems: Record<number, string | null>,
    buildMode: '2d' | '3d_valley' | '3d_valley_lossy',
    filename: string = 'mapart.litematic',
    metadata: LitematicaMetadata = {},
    threeDPrecision: number = 0,
    dithering: DitheringMode = 'none',
    useCielab: boolean = true,
    hybridStrength: number = 50,
    independentMaps: boolean = false
): void {
    // Generate unoptimized version
    const blockStatesUnopt = imageDataToBlockStates(
        imageData, selectedPaletteItems, buildMode, false,
        threeDPrecision, 'none', useCielab, hybridStrength, independentMaps
    );
    const nbtUnopt = createLitematicaNBT(blockStatesUnopt, {
        ...metadata,
        name: (metadata.name || 'MapArt') + ' (Unoptimized)',
        description: (metadata.description || '') + ' - Original version without optimization'
    });
    const nbtDataUnopt = serializeNBT(nbtUnopt);

    // Generate optimized version
    const blockStatesOpt = imageDataToBlockStates(
        imageData, selectedPaletteItems, buildMode, true,
        threeDPrecision, 'none', useCielab, hybridStrength, independentMaps
    );
    const nbtOpt = createLitematicaNBT(blockStatesOpt, {
        ...metadata,
        name: (metadata.name || 'MapArt') + ' (Optimized)',
        description: (metadata.description || '') + ' - Optimized with midpoint centering'
    });
    const nbtDataOpt = serializeNBT(nbtOpt);

    // Download UNOPTIMIZED file
    const baseFilename = filename.replace('.litematic', '');
    const blobUnopt = new Blob([nbtDataUnopt as BlobPart], { type: 'application/octet-stream' });
    const urlUnopt = URL.createObjectURL(blobUnopt);
    const linkUnopt = document.createElement('a');
    linkUnopt.href = urlUnopt;
    linkUnopt.download = `${baseFilename}_unoptimized.litematic`;
    document.body.appendChild(linkUnopt);
    linkUnopt.click();
    document.body.removeChild(linkUnopt);
    URL.revokeObjectURL(urlUnopt);

    // Download OPTIMIZED file (with small delay to avoid browser blocking)
    setTimeout(() => {
        const blobOpt = new Blob([nbtDataOpt as BlobPart], { type: 'application/octet-stream' });
        const urlOpt = URL.createObjectURL(blobOpt);
        const linkOpt = document.createElement('a');
        linkOpt.href = urlOpt;
        linkOpt.download = `${baseFilename}_optimized.litematic`;
        document.body.appendChild(linkOpt);
        linkOpt.click();
        document.body.removeChild(linkOpt);
        URL.revokeObjectURL(urlOpt);
    }, 100);
}
