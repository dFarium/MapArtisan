/**
 * Construction Snapshot
 * The blocks of one exported section, in the form the live preview connector sends
 * to Minecraft. Built from generateConstructionSections, so it matches the exported
 * file block for block (docs/litematica-live-preview-spec.md, section 12.1).
 */

import type { BuildMode } from '../../types/mapart';
import { canonicalBlockState, formatBlockState } from './blockState';
import type { ConstructionSections } from './fileExport';

const MAP_SIZE = 128;

export interface SnapshotSection {
    x: number;
    y: number;
    mapsX: number;
    mapsY: number;
}

export interface ConstructionSnapshot {
    section: SnapshotSection;
    /** Local size derived from the blocks (max + 1 on each axis). */
    size: { x: number; y: number; z: number };
    /** Canonical block states used by this section only, in order of first use. */
    palette: string[];
    x: Int32Array;
    y: Int32Array;
    z: Int32Array;
    paletteIndices: Uint32Array;
    count: number;
    config: {
        buildMode: BuildMode;
        blockSupport: 'all' | 'needed' | 'gravity';
        supportBlockId: string;
        minecraftVersion: string;
    };
    /** FNV-1a 64-bit hash of the palette and blocks, as 16 hex digits. */
    contentHash: string;
}

export type ConstructionSnapshotErrorCode = 'UNSUPPORTED_LAYOUT' | 'SECTION_REQUIRED' | 'SECTION_OUT_OF_RANGE' | 'EMPTY_SECTION';

export class ConstructionSnapshotError extends Error {
    readonly code: ConstructionSnapshotErrorCode;

    constructor(code: ConstructionSnapshotErrorCode, message: string) {
        super(message);
        this.code = code;
        this.name = 'ConstructionSnapshotError';
    }
}

/**
 * Validates the file layout and picks the section to render (spec section 10.2):
 * single file only for 1x1 maps; multiple files for any size, one chosen section.
 */
export function resolveSnapshotSection(
    width: number,
    height: number,
    exportMode: 'full' | 'sections',
    section: { x: number; y: number } | null
): SnapshotSection {
    const mapsX = Math.ceil(width / MAP_SIZE);
    const mapsY = Math.ceil(height / MAP_SIZE);

    if (exportMode === 'full') {
        if (mapsX > 1 || mapsY > 1) {
            throw new ConstructionSnapshotError('UNSUPPORTED_LAYOUT',
                `Single File only supports 1x1 maps; use Multiple Files for ${mapsX}x${mapsY}`);
        }
        if (section && (section.x !== 0 || section.y !== 0)) {
            throw new ConstructionSnapshotError('SECTION_OUT_OF_RANGE', `Section ${section.x},${section.y} is outside a 1x1 map`);
        }
        return { x: 0, y: 0, mapsX, mapsY };
    }

    if (!section) {
        throw new ConstructionSnapshotError('SECTION_REQUIRED', 'Multiple Files needs a section to render');
    }
    if (!Number.isInteger(section.x) || !Number.isInteger(section.y)
        || section.x < 0 || section.y < 0 || section.x >= mapsX || section.y >= mapsY) {
        throw new ConstructionSnapshotError('SECTION_OUT_OF_RANGE',
            `Section ${section.x},${section.y} is outside the ${mapsX}x${mapsY} grid`);
    }
    return { x: section.x, y: section.y, mapsX, mapsY };
}

/**
 * Builds the snapshot of one section.
 *
 * Positions written more than once keep their last block, as the NBT writers do.
 * The palette is reduced to the canonical states this section uses, so edits in
 * other sections do not change its content hash.
 */
export function buildConstructionSnapshot(
    construction: ConstructionSections,
    section: SnapshotSection,
    config: ConstructionSnapshot['config']
): ConstructionSnapshot {
    const source = construction.multiFile
        ? construction.sections.find(s => s.sX === section.x && s.sY === section.y)
        : construction.sections[0];
    if (!source || source.blocks.count === 0) {
        throw new ConstructionSnapshotError('EMPTY_SECTION', `Section ${section.x},${section.y} has no blocks`);
    }
    const blocks = source.blocks;

    // Sections are at most 128 wide and 129 deep, so x and z fit in 8 bits each.
    const lastAt = new Map<number, number>();
    for (let i = 0; i < blocks.count; i++) {
        lastAt.set(positionKey(blocks.x[i], blocks.y[i], blocks.z[i]), i);
    }

    const count = lastAt.size;
    const x = new Int32Array(count);
    const y = new Int32Array(count);
    const z = new Int32Array(count);
    const paletteIndices = new Uint32Array(count);
    const palette: string[] = [];
    const paletteIds = new Map<string, number>();
    const canonicalByRaw = new Map<number, number>();
    let sizeX = 0, sizeY = 0, sizeZ = 0;
    let out = 0;

    for (let i = 0; i < blocks.count; i++) {
        if (lastAt.get(positionKey(blocks.x[i], blocks.y[i], blocks.z[i])) !== i) continue;

        const raw = blocks.paletteIndices[i];
        let id = canonicalByRaw.get(raw);
        if (id === undefined) {
            const state = formatBlockState(canonicalBlockState(blocks.palette[raw]));
            id = paletteIds.get(state);
            if (id === undefined) {
                id = palette.length;
                palette.push(state);
                paletteIds.set(state, id);
            }
            canonicalByRaw.set(raw, id);
        }

        x[out] = blocks.x[i];
        y[out] = blocks.y[i];
        z[out] = blocks.z[i];
        paletteIndices[out] = id;
        sizeX = Math.max(sizeX, x[out] + 1);
        sizeY = Math.max(sizeY, y[out] + 1);
        sizeZ = Math.max(sizeZ, z[out] + 1);
        out++;
    }

    return {
        section,
        size: { x: sizeX, y: sizeY, z: sizeZ },
        palette,
        x,
        y,
        z,
        paletteIndices,
        count,
        config,
        contentHash: snapshotContentHash(palette, x, y, z, paletteIndices),
    };
}

function positionKey(x: number, y: number, z: number): number {
    if (x < 0 || z < 0 || x > 255 || z > 255 || y < 0) {
        throw new RangeError(`Block position ${x},${y},${z} is outside a map section`);
    }
    return (y * 256 + z) * 256 + x;
}

/** Hashes the palette (newline separated) and every block as four little-endian int32. */
export function snapshotContentHash(palette: string[], x: Int32Array, y: Int32Array, z: Int32Array, indices: Uint32Array): string {
    const header = new TextEncoder().encode(palette.join('\n') + '\0');
    const bytes = new Uint8Array(header.length + x.length * 16);
    bytes.set(header);
    const view = new DataView(bytes.buffer);
    let offset = header.length;
    for (let i = 0; i < x.length; i++) {
        view.setInt32(offset, x[i], true);
        view.setInt32(offset + 4, y[i], true);
        view.setInt32(offset + 8, z[i], true);
        view.setUint32(offset + 12, indices[i], true);
        offset += 16;
    }
    return fnv1a64(bytes);
}

/**
 * FNV-1a 64-bit over bytes, as 16 hex digits. Uses four 16-bit limbs so it runs on
 * plain numbers, without BigInt or crypto.subtle (unavailable outside secure contexts).
 */
export function fnv1a64(bytes: Uint8Array): string {
    // Offset basis 0xcbf29ce484222325, least significant limb first.
    let h0 = 0x2325, h1 = 0x8422, h2 = 0x9ce4, h3 = 0xcbf2;

    for (let i = 0; i < bytes.length; i++) {
        h0 ^= bytes[i];
        // Multiply by the prime 0x100000001b3 = 0x1b3 + 2^40, keeping the low 64 bits.
        const t0 = h0 * 0x1b3;
        let t1 = h1 * 0x1b3;
        let t2 = h2 * 0x1b3 + (h0 << 8);
        let t3 = h3 * 0x1b3 + (h1 << 8);
        t1 += t0 >>> 16;
        t2 += t1 >>> 16;
        t3 += t2 >>> 16;
        h0 = t0 & 0xffff;
        h1 = t1 & 0xffff;
        h2 = t2 & 0xffff;
        h3 = t3 & 0xffff;
    }

    return [h3, h2, h1, h0].map(limb => limb.toString(16).padStart(4, '0')).join('');
}
