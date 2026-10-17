/**
 * Local connector protocol v1 (docs/litematica-live-preview-spec.md, section 8).
 * Control messages are JSON text frames; blocks travel in binary frames.
 */
import type { ConstructionSnapshot } from '../utils/export';

export const CONNECTOR_PROTOCOL_VERSION = 1;
export const DEFAULT_CONNECTOR_PORT = 25590;
export const CONNECTOR_PATH = '/mapartisan/v1';
export const MAX_MESSAGE_BYTES = 256 * 1024;
export const PART_HEADER_BYTES = 12;
export const RECORD_BYTES = 8;
const PART_MAGIC = [0x4d, 0x41, 0x42, 0x31]; // "MAB1"

export interface SessionInfo {
    sessionId: string;
    world: string;
    dimension: string;
    origin: { x: number; y: number; z: number };
    buildHeight: { min: number; max: number };
    lastRevision: number;
    lastApplied: { revision: number; contentHash: string } | null;
}

export interface AppliedTimings {
    receiveMs: number;
    validateMs: number;
    waitMs: number;
    pasteMs: number;
    verifyMs: number;
    totalMs: number;
}

export type ServerMessage =
    | { type: 'welcome'; mod: string; minecraft: string; litematica: string; limits: Record<string, number> }
    | ({ type: 'sessionReady' } & SessionInfo)
    | { type: 'accepted'; sessionId: string; revision: number }
    | {
        type: 'progress'; sessionId: string; revision: number;
        phase: 'scheduled' | 'waiting' | 'pasting'; pendingChunks: number; totalChunks: number; blockedReason?: string;
    }
    | {
        type: 'applied'; sessionId: string; revision: number; contentHash: string; repeated: boolean;
        verifiedPositions?: number; chunks?: number; timings?: AppliedTimings;
    }
    | { type: 'rejected'; revision?: number; code: string; message: string }
    | {
        type: 'failed'; sessionId: string; revision: number; code: string; message: string;
        partial: boolean; samples?: string[];
    }
    | { type: 'pong'; t?: number };

export function clientMessage(type: string, fields: Record<string, unknown> = {}): string {
    return JSON.stringify({ protocolVersion: CONNECTOR_PROTOCOL_VERSION, type, ...fields });
}

/** Parses a text frame from the mod; returns null for anything that is not a v1 message. */
export function parseServerMessage(text: string): ServerMessage | null {
    try {
        const json = JSON.parse(text) as { protocolVersion?: unknown; type?: unknown };
        if (json.protocolVersion !== CONNECTOR_PROTOCOL_VERSION || typeof json.type !== 'string') return null;
        return json as ServerMessage;
    } catch {
        return null;
    }
}

/**
 * Splits the blocks of a snapshot into binary parts, in snapshot order so the mod
 * recomputes the same content hash. Each part: "MAB1", revision (u32), part index (u16),
 * reserved (u16), then x, y, z and palette index as u16 per block, little-endian.
 */
export function encodeSnapshotParts(
    snapshot: ConstructionSnapshot,
    revision: number,
    maxMessageBytes = MAX_MESSAGE_BYTES
): ArrayBuffer[] {
    if (!Number.isInteger(revision) || revision < 1 || revision > 0xffffffff) {
        throw new RangeError(`Revision ${revision} is outside 1..2^32-1`);
    }
    if (snapshot.palette.length > 0x10000) {
        throw new RangeError(`Palette of ${snapshot.palette.length} states does not fit in u16 indices`);
    }
    const perPart = Math.floor((maxMessageBytes - PART_HEADER_BYTES) / RECORD_BYTES);
    const partCount = Math.max(1, Math.ceil(snapshot.count / perPart));
    if (partCount > 0xffff) {
        throw new RangeError(`${partCount} parts do not fit in a u16 part index`);
    }

    const parts: ArrayBuffer[] = [];
    for (let part = 0; part < partCount; part++) {
        const start = part * perPart;
        const end = Math.min(snapshot.count, start + perPart);
        const buffer = new ArrayBuffer(PART_HEADER_BYTES + (end - start) * RECORD_BYTES);
        const view = new DataView(buffer);
        PART_MAGIC.forEach((byte, i) => view.setUint8(i, byte));
        view.setUint32(4, revision, true);
        view.setUint16(8, part, true);
        view.setUint16(10, 0, true);
        let offset = PART_HEADER_BYTES;
        for (let i = start; i < end; i++) {
            const x = snapshot.x[i], y = snapshot.y[i], z = snapshot.z[i];
            if (x < 0 || y < 0 || z < 0 || x > 0xffff || y > 0xffff || z > 0xffff) {
                throw new RangeError(`Block ${i} at ${x},${y},${z} does not fit in u16 coordinates`);
            }
            view.setUint16(offset, x, true);
            view.setUint16(offset + 2, y, true);
            view.setUint16(offset + 4, z, true);
            view.setUint16(offset + 6, snapshot.paletteIndices[i], true);
            offset += RECORD_BYTES;
        }
        parts.push(buffer);
    }
    return parts;
}

/** Fields of snapshotBegin, which declares everything the binary parts must match. */
export function snapshotBeginFields(sessionId: string, revision: number, snapshot: ConstructionSnapshot, parts: number) {
    return {
        sessionId,
        revision,
        contentHash: snapshot.contentHash,
        section: { x: snapshot.section.x, y: snapshot.section.y },
        size: snapshot.size,
        count: snapshot.count,
        parts,
        palette: snapshot.palette,
        config: snapshot.config,
    };
}
