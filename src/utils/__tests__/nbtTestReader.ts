/**
 * Minimal gzip NBT reader for tests. Independent of nbtWriter, so tests that decode
 * exported files also catch encoding mistakes.
 */
import * as pako from 'pako';

export type NBTValue =
    | number
    | bigint
    | string
    | Int8Array
    | Int32Array
    | bigint[]
    | NBTValue[]
    | NBTCompound;

export interface NBTCompound {
    [key: string]: NBTValue;
}

export function readNBT(gzipped: Uint8Array): NBTCompound {
    const data = pako.ungzip(gzipped);
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const decoder = new TextDecoder();
    let offset = 0;

    const string = (): string => {
        const length = view.getUint16(offset);
        offset += 2;
        const text = decoder.decode(data.subarray(offset, offset + length));
        offset += length;
        return text;
    };

    const payload = (type: number): NBTValue => {
        switch (type) {
            case 1: return view.getInt8(offset++);
            case 2: { const v = view.getInt16(offset); offset += 2; return v; }
            case 3: { const v = view.getInt32(offset); offset += 4; return v; }
            case 4: { const v = view.getBigInt64(offset); offset += 8; return v; }
            case 5: { const v = view.getFloat32(offset); offset += 4; return v; }
            case 6: { const v = view.getFloat64(offset); offset += 8; return v; }
            case 7: {
                const length = view.getInt32(offset);
                offset += 4;
                const bytes = new Int8Array(data.buffer, data.byteOffset + offset, length).slice();
                offset += length;
                return bytes;
            }
            case 8: return string();
            case 9: {
                const itemType = view.getUint8(offset++);
                const length = view.getInt32(offset);
                offset += 4;
                const items: NBTValue[] = [];
                for (let i = 0; i < length; i++) items.push(payload(itemType));
                return items;
            }
            case 10: {
                const compound: NBTCompound = {};
                for (;;) {
                    const tag = view.getUint8(offset++);
                    if (tag === 0) return compound;
                    const name = string();
                    compound[name] = payload(tag);
                }
            }
            case 11: {
                const length = view.getInt32(offset);
                offset += 4;
                const ints = new Int32Array(length);
                for (let i = 0; i < length; i++, offset += 4) ints[i] = view.getInt32(offset);
                return ints;
            }
            case 12: {
                const length = view.getInt32(offset);
                offset += 4;
                const longs: bigint[] = [];
                for (let i = 0; i < length; i++, offset += 8) longs.push(view.getBigInt64(offset));
                return longs;
            }
            default:
                throw new Error(`Unknown NBT tag type ${type} at byte ${offset - 1}`);
        }
    };

    if (view.getUint8(offset++) !== 10) {
        throw new Error('NBT root is not a compound');
    }
    string();
    return payload(10) as NBTCompound;
}

/** `minecraft:id[key=value,...]` with properties sorted by name, from a palette entry. */
export function paletteEntryState(entry: NBTCompound): string {
    const properties = (entry.Properties ?? {}) as NBTCompound;
    const pairs = Object.keys(properties).sort().map(key => `${key}=${String(properties[key])}`);
    return pairs.length > 0 ? `${String(entry.Name)}[${pairs.join(',')}]` : String(entry.Name);
}

/** Non-air blocks of a .litematic file, keyed by "x,y,z", plus its region size. */
export function litematicBlocks(gzipped: Uint8Array): { blocks: Map<string, string>; size: [number, number, number] } {
    const root = readNBT(gzipped);
    const region = (root.Regions as NBTCompound).map as NBTCompound;
    const size = region.Size as NBTCompound;
    const [sx, sy, sz] = [size.x, size.y, size.z].map(Number);
    const palette = (region.BlockStatePalette as NBTCompound[]).map(paletteEntryState);
    const longs = (region.BlockStates as bigint[]).map(v => BigInt.asUintN(64, v));

    // Litematica: max(2, bits needed for the highest palette index).
    const bits = Math.max(2, 32 - Math.clz32(palette.length - 1));
    const bigBits = BigInt(bits);
    const mask = (1n << bigBits) - 1n;
    const blocks = new Map<string, string>();

    for (let index = 0; index < sx * sy * sz; index++) {
        const start = index * bits;
        const word = Math.floor(start / 64);
        const shift = start - word * 64;
        let value = longs[word] >> BigInt(shift);
        if (shift + bits > 64) value |= longs[word + 1] << BigInt(64 - shift);
        const state = palette[Number(value & mask)];
        if (state === 'minecraft:air') continue;

        const x = index % sx;
        const z = Math.floor(index / sx) % sz;
        const y = Math.floor(index / (sx * sz));
        blocks.set(`${x},${y},${z}`, state);
    }
    return { blocks, size: [sx, sy, sz] };
}

/** Non-air blocks of a vanilla structure .nbt file, keyed by "x,y,z"; later entries win. */
export function vanillaBlocks(gzipped: Uint8Array): Map<string, string> {
    const root = readNBT(gzipped);
    const palette = (root.palette as NBTCompound[]).map(paletteEntryState);
    const blocks = new Map<string, string>();
    for (const entry of root.blocks as NBTCompound[]) {
        const pos = entry.pos as number[];
        const state = palette[Number(entry.state)];
        const key = `${pos[0]},${pos[1]},${pos[2]}`;
        if (state === 'minecraft:air') {
            blocks.delete(key);
        } else {
            blocks.set(key, state);
        }
    }
    return blocks;
}
