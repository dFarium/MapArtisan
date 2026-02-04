import type { BuildMode, BrightnessLevel, RGB } from '../types/mapart';
import type { PaletteColor, DitheringMode } from './mapartProcessing';
import { processMapart, optimizeColumnHeights, applyManualEdits } from './mapartProcessing';
import { TagTypes, serializeNBT, type NBTRoot, type NBTCompound } from './nbtWriter';
import * as bitArray from './litematicaBitArray';
import paletteData from '../data/palette.json';
import { getDataVersion, DEFAULT_VERSION } from '../data/supportedVersions';

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
    buildMode: BuildMode,
    applyOptimization: boolean = true,
    threeDPrecision: number = 0,
    dithering: DitheringMode = 'none',
    useCielab: boolean = true,
    hybridStrength: number = 50,
    independentMaps: boolean = false,
    manualEdits?: Record<number, { blockId: string; brightness: BrightnessLevel; rgb: RGB }>,
    blockSupport: 'all' | 'needed' | 'gravity' = 'all'
): BlockWithCoords[] {
    // Process image to get exact same colors as preview
    // Phase 1: Base Processing
    const { imageData: baseImageData, toneMap: baseToneMap } = processMapart(
        imageData,
        buildMode,
        selectedPaletteItems,
        threeDPrecision,
        dithering,
        useCielab,
        hybridStrength,
        independentMaps,
        true // Enable optimizeHeight (Safe Reset) for export
    );

    // Phase 2: Apply Manual Edits
    let processedImageData = baseImageData;
    // We don't strictly need updated toneMap/stats here as logic derives tone from rgb match below,
    // but applyManualEdits gives us the correct pixel colors.
    if (manualEdits && Object.keys(manualEdits).length > 0) {
        const res = applyManualEdits(baseImageData, baseToneMap, manualEdits, buildMode);
        processedImageData = res.imageData;
    }

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

    // Identify blocks that need support (gravity or fragile)
    const gravityBlocks = new Set([
        'minecraft:sand',
        'minecraft:red_sand',
        'minecraft:gravel',
        'minecraft:dragon_egg',
        'minecraft:anvil',
        'minecraft:chipped_anvil',
        'minecraft:damaged_anvil',
        'minecraft:white_concrete_powder',
        'minecraft:orange_concrete_powder',
        'minecraft:magenta_concrete_powder',
        'minecraft:light_blue_concrete_powder',
        'minecraft:yellow_concrete_powder',
        'minecraft:lime_concrete_powder',
        'minecraft:pink_concrete_powder',
        'minecraft:gray_concrete_powder',
        'minecraft:light_gray_concrete_powder',
        'minecraft:cyan_concrete_powder',
        'minecraft:purple_concrete_powder',
        'minecraft:blue_concrete_powder',
        'minecraft:brown_concrete_powder',
        'minecraft:green_concrete_powder',
        'minecraft:red_concrete_powder',
        'minecraft:black_concrete_powder',
        'minecraft:scaffolding',
        'minecraft:snow', // Gravity affected if layers? No, snow block not gravity.
        // Add others if needed
    ]);

    const fragileBlocks = new Set<string>();
    for (const color of palette) {
        for (const block of color.blocks) {
            if (block.needsSupport) {
                fragileBlocks.add(block.id);
            }
        }
    }

    const is2D = buildMode === '2d';

    // Store blocks organized by column for per-column optimization
    const columnBlocks: Map<number, BlockWithCoords[]> = new Map();

    // Process each column (X axis in Minecraft)
    for (let x = 0; x < width; x++) {
        const currentColumnBlocks: BlockWithCoords[] = [];

        // Temporary storage for calculated block positions before optimization
        const rawMapBlocks: { blockId: string; y: number; z: number }[] = [];

        // Track current height relative to the column start
        let currentHeight = 0;

        // Track tones for Smart Drop Optimization
        // 0: Normal, 1: High, -1: Low
        const columnTones = new Int8Array(height).fill(0);

        // Determine noobline Y relative to the start (virtual Y=0) based on first block
        let nooblineY = 0;

        // Process each row (Y in image -> Z in Minecraft)
        for (let y = 0; y < height; y++) {
            const idx = (y * width + x) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            // Alpha ignored (assumed opaque)

            const key = (r << 16) | (g << 8) | b;

            const colorInfo = rgbToColor.get(key);
            if (!colorInfo) continue;


            // Set noobline height based on first block's brightness
            // Noobline is the reference point (virtual Y=0) for the first block
            if (y === 0) {
                // We keep nooblineY at 0 relative to the start
            }

            // Calculate height
            if (!is2D) {
                // Adjust height based on brightness (compared to north block)
                if (colorInfo.brightness === 'high') {
                    currentHeight++;
                    columnTones[y] = 1;
                } else if (colorInfo.brightness === 'low') {
                    currentHeight--;
                    columnTones[y] = -1;
                }
            }
            // If is2D, currentHeight remains 0

            // Store raw block position
            rawMapBlocks.push({
                blockId: colorInfo.blockId,
                y: currentHeight,
                z: y + 1,
            });
        }

        // Apply Smart Drop Optimization for 3D Valley
        if (!is2D && applyOptimization && buildMode === '3d_valley') {
            // Convert TypedArray to normal array for the function
            const tonesArray = Array.from(columnTones);
            const { path } = optimizeColumnHeights(tonesArray);

            // Update rawMapBlocks heights
            for (const block of rawMapBlocks) {
                // block.z is 1-based (y+1). path is 0-based.
                const index = block.z - 1;
                if (index >= 0 && index < path.length) {
                    block.y = path[index];
                }
            }
        }

        // --- Optimization / Grounding Logic ---
        // We want the lowest MAP block of the column to align with Y=0.
        // We calculate the shift needed and apply it to all blocks + noobline.

        let shiftY = 0;
        if (!is2D && applyOptimization && rawMapBlocks.length > 0) {

            const minMapY = Math.min(...rawMapBlocks.map(b => b.y));
            const minOverallY = Math.min(minMapY, nooblineY); // nooblineY is always 0 here

            shiftY = -minOverallY;
        }

        // Add shifted map blocks and generate supports
        for (const rawBlock of rawMapBlocks) {
            const finalY = rawBlock.y + shiftY;

            // Add Map Block
            currentColumnBlocks.push({
                blockId: rawBlock.blockId,
                x: x,
                y: finalY,
                z: rawBlock.z
            });

            // Add Support Block Logic
            // In 3D mode, if the block is above the ground (Y > 0), it needs a support at Y-1.
            // Blocks at Y=0 sit on the floor and don't need artificial support.
            if (!is2D && finalY > 0) {
                let addSupport = false;

                if (blockSupport === 'all') {
                    addSupport = true;
                } else if (blockSupport === 'needed') {
                    addSupport = false;
                } else if (blockSupport === 'gravity') {
                    // Check if block is gravity or fragile
                    const isGravity = gravityBlocks.has(rawBlock.blockId);
                    const isFragile = fragileBlocks.has(rawBlock.blockId);
                    addSupport = isGravity || isFragile;
                }

                if (addSupport) {
                    currentColumnBlocks.push({
                        blockId: 'minecraft:stone',
                        x: x,
                        y: finalY - 1,
                        z: rawBlock.z
                    });
                }
            }
        }

        // Add Noobline (also shifted) at Z=0
        const finalNooblineY = is2D ? 0 : (nooblineY + shiftY);
        currentColumnBlocks.push({
            blockId: 'minecraft:cobblestone',
            x: x,
            y: finalNooblineY,
            z: 0,
        });

        // Add Support for Noobline if elevated
        if (!is2D && finalNooblineY > 0) {
            // Noobline is solid (cobblestone), only needs support if 'all' or 'gravity' (it behaves like solid block)
            // But if it's elevated, it floats. Logic for 'standard' mapart is usually to support everything.
            // If mode is 'needed' (floating), we don't support it.
            // If mode is 'gravity', cobblestone doesn't fall, so we DON'T support it unless we want to be safe?
            // User request was "support where needed". Cobblestone doesn't need support.

            let addNoobSupport = false;
            if (blockSupport === 'all') {
                addNoobSupport = true;
            } else {
                // For 'needed' and 'gravity', cobblestone (noobline) floats fine.
                addNoobSupport = false;
            }

            if (addNoobSupport) {
                currentColumnBlocks.push({
                    blockId: 'minecraft:stone',
                    x: x,
                    y: finalNooblineY - 1,
                    z: 0,
                });
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
    metadata: LitematicaMetadata = {},
    targetVersion: string = DEFAULT_VERSION
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
                .join(',')
            }]`
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
                .join(',')
            }]`
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
            MinecraftDataVersion: { type: TagTypes.INT, value: getDataVersion(targetVersion) },
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

import JSZip from 'jszip';

/**
 * Generate Litematica export data (Blob)
 * If map is larger than 128x128, it will be split into multiple files and zipped.
 * Each section is processed independently to ensure correct "noob lines" (northern padding).
 */
export async function generateMapartExport(
    imageData: ImageData,
    selectedPaletteItems: Record<number, string | null>,
    buildMode: BuildMode,
    filename: string = 'mapart.litematic',
    metadata: LitematicaMetadata = {},
    threeDPrecision: number = 0,
    dithering: DitheringMode = 'none',
    useCielab: boolean = true,
    hybridStrength: number = 50,
    independentMaps: boolean = false,
    manualEdits?: Record<number, { blockId: string; brightness: BrightnessLevel; rgb: { r: number; g: number; b: number } }>,
    blockSupport: 'all' | 'needed' | 'gravity' = 'all',
    targetVersion: string = DEFAULT_VERSION
): Promise<{ blob: Blob; filename: string }> {
    const { width, height, data } = imageData;
    const isMultiMap = width > 128 || height > 128;

    if (!isMultiMap) {
        // Single Map Case
        const blockStatesOpt = imageDataToBlockStates(
            imageData, selectedPaletteItems, buildMode, true,
            threeDPrecision, dithering, useCielab, hybridStrength, independentMaps, manualEdits, blockSupport
        );

        const nbtOpt = createLitematicaNBT(blockStatesOpt, {
            ...metadata,
            name: metadata.name || 'MapArt',
            description: metadata.description || 'MapArt created by mapart-creator'
        }, targetVersion);
        const nbtDataOpt = serializeNBT(nbtOpt);
        const blob = new Blob([nbtDataOpt as BlobPart], { type: 'application/octet-stream' });

        return { blob, filename };

    } else {
        // Multi Map Case - Split and Zip
        const zip = new JSZip();
        const baseName = filename.replace(/\.litematic$/, '');
        const mapsX = Math.ceil(width / 128);
        const mapsY = Math.ceil(height / 128);

        for (let y = 0; y < mapsY; y++) {
            for (let x = 0; x < mapsX; x++) {
                // Extract section image data
                const sectionWidth = 128;
                const sectionHeight = 128; // Always 128x128 for map parts
                const sectionData = new Uint8ClampedArray(sectionWidth * sectionHeight * 4);

                // We also need to slice manualEdits for this section
                const sectionManualEdits: typeof manualEdits = {};

                for (let sy = 0; sy < sectionHeight; sy++) {
                    for (let sx = 0; sx < sectionWidth; sx++) {
                        const globalX = x * 128 + sx;
                        const globalY = y * 128 + sy;

                        if (globalX < width && globalY < height) {
                            const sourceIdx = (globalY * width + globalX) * 4;
                            const targetIdx = (sy * sectionWidth + sx) * 4;
                            sectionData[targetIdx] = data[sourceIdx];
                            sectionData[targetIdx + 1] = data[sourceIdx + 1];
                            sectionData[targetIdx + 2] = data[sourceIdx + 2];
                            sectionData[targetIdx + 3] = data[sourceIdx + 3];

                            // Copy manual edit if exists
                            const globalPixelIdx = globalY * width + globalX;
                            if (manualEdits && manualEdits[globalPixelIdx]) {
                                const localPixelIdx = sy * sectionWidth + sx;
                                sectionManualEdits[localPixelIdx] = manualEdits[globalPixelIdx];
                            }
                        }
                    }
                }

                const sectionImageData = new ImageData(sectionData, sectionWidth, sectionHeight);

                // Process independently to get correct noob lines for this section
                const blockStates = imageDataToBlockStates(
                    sectionImageData, selectedPaletteItems, buildMode, true,
                    threeDPrecision, dithering, useCielab, hybridStrength, independentMaps, sectionManualEdits, blockSupport
                );

                const sectionNbt = createLitematicaNBT(blockStates, {
                    ...metadata,
                    name: `${metadata.name || 'MapArt'} (${x},${y})`,
                    description: `Section ${x},${y} - ${metadata.description || 'MapArt created by mapart-creator'} `
                }, targetVersion);

                const sectionBuffer = serializeNBT(sectionNbt);
                zip.file(`${baseName}_${x}_${y}.litematic`, sectionBuffer);
            }
        }

        const zipContent = await zip.generateAsync({ type: 'blob' });
        return { blob: zipContent, filename: `${baseName} _package.zip` };
    }
}

/**
 * Trigger browser download for a Blob
 */
export function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Calculate total materials needed
 */
export function calculateMaterialCounts(
    imageData: ImageData,
    selectedPaletteItems: Record<number, string | null>,
    buildMode: BuildMode,
    threeDPrecision: number = 0,
    dithering: DitheringMode = 'none',
    useCielab: boolean = true,
    hybridStrength: number = 50,
    independentMaps: boolean = false,
    manualEdits?: Record<number, { blockId: string; brightness: BrightnessLevel; rgb: { r: number; g: number; b: number } }>,
    blockSupport: 'all' | 'needed' | 'gravity' = 'all'
): Record<string, number> {
    const blockStates = imageDataToBlockStates(
        imageData, selectedPaletteItems, buildMode, true,
        threeDPrecision, dithering, useCielab, hybridStrength, independentMaps, manualEdits, blockSupport
    );

    const counts: Record<string, number> = {};

    for (const block of blockStates) {
        if (block.blockId === 'minecraft:air') continue;
        counts[block.blockId] = (counts[block.blockId] || 0) + 1;
    }

    return counts;
}
