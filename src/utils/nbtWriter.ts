import * as pako from 'pako';

/**
 * NBT Tag Types according to NBT format specification
 * https://minecraft.wiki/w/NBT_format#TAG_definition
 */
export const TagTypes = {
    END: 0,
    BYTE: 1,
    SHORT: 2,
    INT: 3,
    LONG: 4,
    FLOAT: 5,
    DOUBLE: 6,
    BYTE_ARRAY: 7,
    STRING: 8,
    LIST: 9,
    COMPOUND: 10,
    INT_ARRAY: 11,
    LONG_ARRAY: 12,
} as const;

// Export type for TagTypes values
export type TagType = (typeof TagTypes)[keyof typeof TagTypes];

export type NBTValue =
    | number
    | string
    | number[]
    | [number, number] // For long (two 32-bit ints)
    | Uint8Array
    | Int8Array
    | Int32Array
    | NBTCompound
    | NBTList;

export interface NBTCompound {
    [key: string]: {
        type: TagType;
        value: unknown;
    };
}

export interface NBTList {
    type: TagType;
    value: unknown[];
}

export interface NBTRoot {
    name: string;
    value: NBTCompound;
}

/**
 * NBTWriter class for writing NBT data to binary format
 * Adapted from mapartcraft's implementation to TypeScript
 */
export class NBTWriter {
    private buffer: ArrayBuffer;
    private dataView: DataView;
    private arrayView: Uint8Array;
    private offset: number;

    constructor() {
        // Start with 1KB, will auto-resize if needed
        this.buffer = new ArrayBuffer(1024);
        this.dataView = new DataView(this.buffer);
        this.arrayView = new Uint8Array(this.buffer);
        this.offset = 0;
    }

    /**
     * Encode string to UTF-8 bytes (modified UTF-8 for Java compatibility)
     */
    private encodeUTF8(str: string): number[] {
        const array: number[] = [];
        for (let i = 0; i < str.length; i++) {
            const c = str.charCodeAt(i);
            if (c === 0x0) {
                // Null character: encode as 0xC0 0x80
                array.push(0xc0, 0x80);
            } else if (c < 0x80) {
                // Single byte (0x0001 to 0x007F)
                array.push(c);
            } else if (c < 0x800) {
                // Two bytes  (0x0000 and 0x0080 to 0x07FF)
                array.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
            } else if (c < 0x10000) {
                // Three bytes (0x0800 to 0xFFFF)
                array.push(
                    0xe0 | (c >> 12),
                    0x80 | ((c >> 6) & 0x3f),
                    0x80 | (c & 0x3f)
                );
            } else {
                // Four bytes (rarely needed)
                array.push(
                    0xf0 | ((c >> 18) & 0x07),
                    0x80 | ((c >> 12) & 0x3f),
                    0x80 | ((c >> 6) & 0x3f),
                    0x80 | (c & 0x3f)
                );
            }
        }
        return array;
    }

    /**
     * Ensure buffer can accommodate the specified size
     */
    private accommodate(size: number): void {
        const requiredLength = this.offset + size;
        if (this.buffer.byteLength >= requiredLength) {
            return;
        }

        // Double buffer size until it fits
        let newLength = this.buffer.byteLength;
        while (newLength < requiredLength) {
            newLength *= 2;
        }

        const newBuffer = new ArrayBuffer(newLength);
        const newArrayView = new Uint8Array(newBuffer);
        newArrayView.set(this.arrayView);

        // Fill gap if offset > old buffer length
        if (this.offset > this.buffer.byteLength) {
            newArrayView.fill(0, this.buffer.byteLength, this.offset);
        }

        this.buffer = newBuffer;
        this.dataView = new DataView(newBuffer);
        this.arrayView = newArrayView;
    }

    /**
     * Write primitive data type
     */
    private write(dataType: string, size: number, value: number): void {
        this.accommodate(size);
        (this.dataView as unknown as Record<string, (o: number, v: number) => void>)[`set${dataType}`](this.offset, value);
        this.offset += size;
    }

    /**
     * Write data by NBT tag type
     */
    public writeByType(dataType: TagType, value: unknown): void {
        switch (dataType) {
            case TagTypes.END:
                this.writeByType(TagTypes.BYTE, 0);
                break;

            case TagTypes.BYTE:
                this.write('Int8', 1, value as number);
                break;

            case TagTypes.SHORT:
                this.write('Int16', 2, value as number);
                break;

            case TagTypes.INT:
                this.write('Int32', 4, value as number);
                break;

            case TagTypes.LONG: {
                // JavaScript doesn't support native 64-bit ints
                // Pass as array of two 32-bit ints [high, low]
                const longVal = value as [number, number];
                this.write('Int32', 4, longVal[0]);
                this.write('Int32', 4, longVal[1]);
                break;
            }

            case TagTypes.FLOAT:
                this.write('Float32', 4, value as number);
                break;

            case TagTypes.DOUBLE:
                this.write('Float64', 8, value as number);
                break;

            case TagTypes.BYTE_ARRAY: {
                const arr = value as Uint8Array;
                this.writeByType(TagTypes.INT, arr.length);
                this.accommodate(arr.length);
                this.arrayView.set(arr, this.offset);
                this.offset += arr.length;
                break;
            }

            case TagTypes.STRING: {
                const bytes = this.encodeUTF8(value as string);
                this.writeByType(TagTypes.SHORT, bytes.length);
                this.accommodate(bytes.length);
                this.arrayView.set(bytes, this.offset);
                this.offset += bytes.length;
                break;
            }

            case TagTypes.LIST: {
                const list = value as NBTList;
                this.writeByType(TagTypes.BYTE, list.type);
                this.writeByType(TagTypes.INT, list.value.length);
                for (const item of list.value) {
                    this.writeByType(list.type, item);
                }
                break;
            }

            case TagTypes.COMPOUND: {
                const compound = value as NBTCompound;
                Object.keys(compound).forEach((key) => {
                    this.writeByType(TagTypes.BYTE, compound[key].type);
                    this.writeByType(TagTypes.STRING, key);
                    this.writeByType(compound[key].type, compound[key].value);
                });
                this.writeByType(TagTypes.END, 0);
                break;
            }

            case TagTypes.INT_ARRAY: {
                const arr = value as number[] | Int32Array;
                this.writeByType(TagTypes.INT, arr.length);
                for (const item of arr) {
                    this.writeByType(TagTypes.INT, item);
                }
                break;
            }

            case TagTypes.LONG_ARRAY: {
                const arr = value as [number, number][];
                this.writeByType(TagTypes.INT, arr.length);
                for (const item of arr) {
                    this.writeByType(TagTypes.LONG, item);
                }
                break;
            }

            default:
                throw new Error(`Unknown NBT data type: ${dataType}`);
        }
    }

    /**
     * Write top-level compound tag
     */
    public writeTopLevelCompound(root: NBTRoot): void {
        this.writeByType(TagTypes.BYTE, TagTypes.COMPOUND);
        this.writeByType(TagTypes.STRING, root.name);
        this.writeByType(TagTypes.COMPOUND, root.value);
    }

    /**
     * Get the written data as ArrayBuffer
     */
    public getData(): ArrayBuffer {
        this.accommodate(0); // Ensure offset is within buffer
        return this.buffer.slice(0, this.offset);
    }
}

/**
 * Serialize NBT data and compress with gzip
 */
export function serializeNBT(nbtData: NBTRoot): Uint8Array {
    const writer = new NBTWriter();
    writer.writeTopLevelCompound(nbtData);
    const buffer = writer.getData();
    const uint8Array = new Uint8Array(buffer);
    return pako.gzip(uint8Array);
}
