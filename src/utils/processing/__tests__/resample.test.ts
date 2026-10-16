import { describe, expect, it } from 'vitest';
import { hash01 } from '../heightLimit';
import { resampleArea } from '../resample';

function image(width: number, height: number, pixel: (x: number, y: number) => [number, number, number, number?]): ImageData {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const [r, g, b, a = 255] = pixel(x, y);
            data.set([r, g, b, a], (y * width + x) * 4);
        }
    }
    return new ImageData(data, width, height);
}

const toLinear = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const toSrgb = (c: number) => Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055));

/** Straightforward 2D area average, kept slow and obvious as the reference. */
function referenceArea(src: ImageData, rect: { x: number; y: number; width: number; height: number }, w: number, h: number): number[] {
    const out: number[] = [];
    const sx = rect.width / w, sy = rect.height / h;
    for (let ty = 0; ty < h; ty++) {
        const y0 = rect.y + ty * sy, y1 = y0 + sy;
        for (let tx = 0; tx < w; tx++) {
            const x0 = rect.x + tx * sx, x1 = x0 + sx;
            let r = 0, g = 0, b = 0, a = 0, total = 0;
            for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
                for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
                    const weight = (Math.min(y + 1, y1) - Math.max(y, y0)) * (Math.min(x + 1, x1) - Math.max(x, x0));
                    if (weight <= 0) continue;
                    const i = (y * src.width + x) * 4;
                    const alpha = src.data[i + 3] / 255 * weight;
                    r += toLinear(src.data[i]) * alpha;
                    g += toLinear(src.data[i + 1]) * alpha;
                    b += toLinear(src.data[i + 2]) * alpha;
                    a += alpha;
                    total += weight;
                }
            }
            out.push(a > 0 ? toSrgb(r / a) : 0, a > 0 ? toSrgb(g / a) : 0, a > 0 ? toSrgb(b / a) : 0, Math.round(a / total * 255));
        }
    }
    return out;
}

describe('resampleArea', () => {
    it('keeps uniform blocks exact at integer ratios', () => {
        const colors = [[12, 200, 90], [255, 255, 255], [0, 0, 0], [130, 20, 240]];
        const src = image(32, 32, (x, y) => colors[(Math.floor(x / 8) + Math.floor(y / 8)) % 4] as [number, number, number]);
        const out = resampleArea(src, { x: 0, y: 0, width: 32, height: 32 }, 4, 4);
        for (let y = 0; y < 4; y++) {
            for (let x = 0; x < 4; x++) {
                const i = (y * 4 + x) * 4;
                expect([...out.data.slice(i, i + 4)]).toEqual([...colors[(x + y) % 4], 255]);
            }
        }
    });

    it('averages black and white stripes in linear light', () => {
        const src = image(8, 8, (x) => (x % 2 === 0 ? [0, 0, 0] : [255, 255, 255]));
        const out = resampleArea(src, { x: 0, y: 0, width: 8, height: 8 }, 1, 1);
        // An sRGB average would give 128; half the light of white is code 188.
        expect([...out.data]).toEqual([188, 188, 188, 255]);
    });

    it('matches a direct area average for fractional ratios and crop rectangles', () => {
        const src = image(97, 61, (x, y) => [
            Math.floor(hash01(x, y) * 256),
            Math.floor(hash01(x + 500, y) * 256),
            Math.floor(hash01(x + 900, y) * 256),
            hash01(x, y + 7000) < 0.1 ? 0 : 255,
        ]);
        const cases = [
            { rect: { x: 0, y: 0, width: 97, height: 61 }, w: 40, h: 25 },
            { rect: { x: 10.3, y: 4.75, width: 50.5, height: 33.2 }, w: 17, h: 11 },
            { rect: { x: 0, y: 0, width: 97, height: 61 }, w: 97, h: 61 },
        ];
        for (const { rect, w, h } of cases) {
            const actual = [...resampleArea(src, rect, w, h).data];
            const expected = referenceArea(src, rect, w, h);
            // Float32 accumulation may move a rounding boundary by one code.
            const worst = Math.max(...actual.map((value, i) => Math.abs(value - expected[i])));
            expect(worst, JSON.stringify(rect)).toBeLessThanOrEqual(1);
        }
    });

    it('returns the source unchanged at a 1:1 ratio', () => {
        const src = image(13, 7, (x, y) => [x * 19, y * 36, (x * y) % 256]);
        expect([...resampleArea(src, { x: 0, y: 0, width: 13, height: 7 }, 13, 7).data]).toEqual([...src.data]);
    });

    it('does not let transparent pixels darken the average', () => {
        const src = image(2, 1, (x) => (x === 0 ? [200, 100, 50, 255] : [0, 0, 0, 0]));
        const out = resampleArea(src, { x: 0, y: 0, width: 2, height: 1 }, 1, 1);
        expect([...out.data]).toEqual([200, 100, 50, 128]);
    });

    it('degrades to nearest neighbour when upscaling', () => {
        const src = image(2, 2, (x, y) => [x * 255, y * 255, 0]);
        const out = resampleArea(src, { x: 0, y: 0, width: 2, height: 2 }, 4, 4);
        expect([...out.data.slice(0, 4)]).toEqual([0, 0, 0, 255]);
        expect([...out.data.slice(3 * 4, 3 * 4 + 4)]).toEqual([255, 0, 0, 255]);
        expect([...out.data.slice((3 * 4 + 3) * 4)]).toEqual([255, 255, 0, 255]);
    });
});
