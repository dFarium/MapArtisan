import { describe, expect, it } from 'vitest';
import {
    encodeSnapshotParts,
    parseServerMessage,
    PART_HEADER_BYTES,
    RECORD_BYTES,
    snapshotBeginFields,
} from '../protocol';
import { testSnapshot } from './fixtures';

function decode(part: ArrayBuffer) {
    const view = new DataView(part);
    const magic = String.fromCharCode(...new Uint8Array(part, 0, 4));
    const blocks: number[][] = [];
    for (let offset = PART_HEADER_BYTES; offset < part.byteLength; offset += RECORD_BYTES) {
        blocks.push([0, 2, 4, 6].map(o => view.getUint16(offset + o, true)));
    }
    return { magic, revision: view.getUint32(4, true), part: view.getUint16(8, true), reserved: view.getUint16(10, true), blocks };
}

describe('encodeSnapshotParts', () => {
    it('writes the header and one little-endian record per block, in snapshot order', () => {
        const blocks: [number, number, number, number][] = [[0, 0, 0, 0], [127, 300, 128, 1], [5, 65535, 7, 0]];
        const [part, ...rest] = encodeSnapshotParts(testSnapshot(blocks, ['a', 'b']), 0xfffffffe);

        expect(rest).toEqual([]);
        expect(part.byteLength).toBe(PART_HEADER_BYTES + 3 * RECORD_BYTES);
        expect(decode(part)).toEqual({ magic: 'MAB1', revision: 0xfffffffe, part: 0, reserved: 0, blocks });
    });

    it('splits into numbered parts that fit the message limit', () => {
        const blocks = Array.from({ length: 10 }, (_, i): [number, number, number, number] => [i, 0, 0, 0]);
        const maxMessageBytes = PART_HEADER_BYTES + 4 * RECORD_BYTES;
        const parts = encodeSnapshotParts(testSnapshot(blocks), 3, maxMessageBytes).map(decode);

        expect(parts.map(p => p.part)).toEqual([0, 1, 2]);
        expect(parts.map(p => p.blocks.length)).toEqual([4, 4, 2]);
        expect(parts.flatMap(p => p.blocks)).toEqual(blocks);
    });

    it('needs three default parts for the 65,536 block limit', () => {
        const blocks = Array.from({ length: 65_536 }, (_, i): [number, number, number, number] => [i % 128, i >> 7, 0, 0]);
        const parts = encodeSnapshotParts(testSnapshot(blocks), 1);

        expect(parts).toHaveLength(3);
        for (const part of parts) expect(part.byteLength).toBeLessThanOrEqual(256 * 1024);
    });

    it('rejects revisions and coordinates that do not fit the format', () => {
        const snapshot = testSnapshot([[0, 0, 0, 0]]);
        expect(() => encodeSnapshotParts(snapshot, 0)).toThrow(RangeError);
        expect(() => encodeSnapshotParts(snapshot, 2 ** 32)).toThrow(RangeError);
        expect(() => encodeSnapshotParts(testSnapshot([[0, 65536, 0, 0]]), 1)).toThrow(RangeError);
    });
});

describe('snapshotBeginFields', () => {
    it('declares what the parts must match', () => {
        const snapshot = testSnapshot([[0, 0, 0, 0], [3, 4, 5, 0]]);
        expect(snapshotBeginFields('s-1', 9, snapshot, 1)).toEqual({
            sessionId: 's-1',
            revision: 9,
            contentHash: '0123456789abcdef',
            section: { x: 1, y: 0 },
            size: { x: 4, y: 5, z: 6 },
            count: 2,
            parts: 1,
            palette: ['minecraft:stone'],
            config: snapshot.config,
        });
    });
});

describe('parseServerMessage', () => {
    it('accepts v1 messages only', () => {
        expect(parseServerMessage('{"protocolVersion":1,"type":"pong","t":4}')).toEqual({ protocolVersion: 1, type: 'pong', t: 4 });
        expect(parseServerMessage('{"protocolVersion":2,"type":"pong"}')).toBeNull();
        expect(parseServerMessage('{"protocolVersion":1}')).toBeNull();
        expect(parseServerMessage('not json')).toBeNull();
    });
});
