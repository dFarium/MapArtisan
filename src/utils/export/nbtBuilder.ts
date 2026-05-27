/**
 * NBT Builder
 * Creates Litematica NBT structure from block states
 */

import { TagTypes, type NBTRoot, type NBTCompound } from '../nbtWriter';
import * as bitArray from '../litematicaBitArray';
import { getDataVersion, DEFAULT_VERSION } from '../../data/supportedVersions';
import { LITEMATICA_VERSION, type BlockWithCoords, type BlockStatesBuffers, type LitematicaMetadata } from './types';

function convertToBuffers(blockStates: BlockWithCoords[]): BlockStatesBuffers {
    const count = blockStates.length;
    const x = new Int32Array(count);
    const y = new Int32Array(count);
    const z = new Int32Array(count);
    const palette: string[] = ['minecraft:air'];
    const paletteIndexMap = new Map<string, number>();
    paletteIndexMap.set('minecraft:air', 0);

    const paletteIndices = new Uint32Array(count);

    for (let i = 0; i < count; i++) {
        const b = blockStates[i];
        x[i] = b.x;
        y[i] = b.y;
        z[i] = b.z;

        const key = b.properties
            ? `${b.blockId}[${Object.entries(b.properties)
                .map(([k, v]) => `${k}=${v}`)
                .join(',')
            }]`
            : b.blockId;

        let idx = paletteIndexMap.get(key);
        if (idx === undefined) {
            idx = palette.length;
            palette.push(key);
            paletteIndexMap.set(key, idx);
        }
        paletteIndices[i] = idx;
    }

    return { x, y, z, palette, paletteIndices, count };
}

/**
 * Create Litematica NBT structure from block states
 */
export function createLitematicaNBT(
    blockStates: BlockStatesBuffers | BlockWithCoords[],
    metadata: LitematicaMetadata = {},
    targetVersion: string = DEFAULT_VERSION
): NBTRoot {
    const buffers = Array.isArray(blockStates) ? convertToBuffers(blockStates) : blockStates;

    // Calculate dimensions
    let maxX = 0;
    let maxY = 0;
    let maxZ = 0;
    for (let i = 0; i < buffers.count; i++) {
        if (buffers.x[i] > maxX) maxX = buffers.x[i];
        if (buffers.y[i] > maxY) maxY = buffers.y[i];
        if (buffers.z[i] > maxZ) maxZ = buffers.z[i];
    }
    maxX += 1;
    maxY += 1;
    maxZ += 1;
    const volume = maxX * maxY * maxZ;

    // Build palette (AIR first)
    const paletteBlocks: NBTCompound[] = [
        { Name: { type: TagTypes.STRING, value: 'minecraft:air' } }
    ];
    const paletteMap = new Map<number, number>();
    paletteMap.set(0, 0);

    for (let i = 0; i < buffers.palette.length; i++) {
        const key = buffers.palette[i];
        if (key === 'minecraft:air') {
            paletteMap.set(i, 0);
            continue;
        }

        let blockId = key;
        let properties: Record<string, string> | undefined = undefined;

        if (key.includes('[')) {
            const openBracket = key.indexOf('[');
            const closeBracket = key.indexOf(']');
            blockId = key.substring(0, openBracket);
            const propStr = key.substring(openBracket + 1, closeBracket);
            properties = {};
            const pairs = propStr.split(',');
            for (const pair of pairs) {
                const [k, v] = pair.split('=');
                if (k && v) {
                    properties[k] = v;
                }
            }
        }

        const paletteEntry: NBTCompound = {
            Name: { type: TagTypes.STRING, value: blockId }
        };

        if (properties && Object.keys(properties).length > 0) {
            const props: NBTCompound = {};
            for (const [k, v] of Object.entries(properties)) {
                props[k] = { type: TagTypes.STRING, value: v };
            }
            paletteEntry.Properties = { type: TagTypes.COMPOUND, value: props };
        }

        paletteMap.set(i, paletteBlocks.length);
        paletteBlocks.push(paletteEntry);
    }

    // Initialize BitArray (default 0 = Air)
    let bitArrayData = bitArray.createBitArray(volume, paletteBlocks.length);

    // Second Pass: Set Blocks directly
    for (let i = 0; i < buffers.count; i++) {
        const bx = buffers.x[i];
        const by = buffers.y[i];
        const bz = buffers.z[i];
        if (bx < 0 || bx >= maxX || by < 0 || by >= maxY || bz < 0 || bz >= maxZ) {
            continue;
        }

        const localPaletteIndex = buffers.paletteIndices[i];
        const paletteIndex = paletteMap.get(localPaletteIndex) ?? 0;

        // Calculate linear index: (y * maxZ + z) * maxX + x
        const blockCoord = (by * maxZ + bz) * maxX + bx;

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
                    TotalBlocks: { type: TagTypes.INT, value: buffers.count },
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
