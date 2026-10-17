import { describe, expect, it } from 'vitest';
import { PixelBuffers } from '../pixelBuffers';

describe('PixelBuffers', () => {
    it('exposes the buffers it was built with', () => {
        const packed = new Uint32Array([1, 2, 3]);
        const path = new Int32Array([4, 5, 6]);
        const buffers = new PixelBuffers(packed, path);
        expect(buffers.packedResults).toBe(packed);
        expect(buffers.heightPath).toBe(path);
    });

    it('hides the arrays from for...in, which React dev uses to diff props', () => {
        const buffers = new PixelBuffers(new Uint32Array(1000), new Int32Array(1000));
        const keys: string[] = [];
        for (const key in buffers) keys.push(key);
        expect(keys).toEqual(['version']);
    });

    it('gives every result a new version', () => {
        const a = new PixelBuffers(new Uint32Array(1), null);
        const b = new PixelBuffers(new Uint32Array(1), null);
        expect(b.version).toBeGreaterThan(a.version);
    });
});
