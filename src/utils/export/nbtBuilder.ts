/**
 * NBT Builder
 * Creates Litematica NBT structure from block states
 */

import { TagTypes, type NBTRoot, type NBTCompound } from '../nbtWriter';
import * as bitArray from '../litematicaBitArray';
import { getDataVersion, DEFAULT_VERSION } from '../../data/supportedVersions';
import { LITEMATICA_VERSION, type BlockWithCoords, type LitematicaMetadata } from './types';

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

    // Build palette (AIR first)
    const paletteBlocks: NBTCompound[] = [
        { Name: { type: TagTypes.STRING, value: 'minecraft:air' } }
    ];
    const paletteMap = new Map<string, number>();
    paletteMap.set('minecraft:air', 0);

    // First Pass: Build Palette
    for (const block of blockStates) {
        const key = block.properties
            ? `${block.blockId}[${Object.entries(block.properties)
                .map(([k, v]) => `${k}=${v}`)
                .join(',')
            }]`
            : block.blockId;

        if (!paletteMap.has(key)) {
            const paletteEntry: NBTCompound = {
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

    // Initialize BitArray (default 0 = Air)
    let bitArrayData = bitArray.createBitArray(volume, paletteBlocks.length);

    // Second Pass: Set Blocks directly
    for (const block of blockStates) {
        // Validation check for bounds if needed, but assuming valid inputs from blockGeneration
        if (block.x < 0 || block.x >= maxX || block.y < 0 || block.y >= maxY || block.z < 0 || block.z >= maxZ) {
            continue;
        }

        const blockKey = block.properties
            ? `${block.blockId}[${Object.entries(block.properties)
                .map(([k, v]) => `${k}=${v}`)
                .join(',')
            }]`
            : block.blockId;

        const paletteIndex = paletteMap.get(blockKey) ?? 0;

        // Calculate linear index: (y * maxZ + z) * maxX + x
        const blockCoord = (block.y * maxZ + block.z) * maxX + block.x;

        bitArrayData = bitArray.set(bitArrayData, blockCoord, paletteIndex);
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
                        value: metadata.description || 'MapArt created by MapArtisan',
                    },
                    RegionCount: { type: TagTypes.INT, value: 1 },
                    TotalBlocks: { type: TagTypes.INT, value: blockStates.length },
                    Author: {
                        type: TagTypes.STRING,
                        value: metadata.author || 'MapArtisan',
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
