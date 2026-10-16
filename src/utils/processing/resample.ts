/**
 * Image Resampling
 *
 * Shrinks the source image to the map art resolution. Each output pixel is
 * the exact area-weighted average of every source pixel it covers, computed
 * in linear light: from a distance, half black and half white looks light
 * grey (188), not the mid grey (128) an sRGB average gives. Unlike browser
 * canvas smoothing, the result is identical in every browser.
 *
 * At integer ratios a source block of one uniform color maps to exactly that
 * color, so pixel art drawn on the map grid survives unchanged. `sharp` keeps
 * nearest-neighbour sampling for pixel art at non-integer ratios.
 */

export const RESAMPLING_MODES = ['smooth', 'sharp'] as const;

export type ResamplingMode = (typeof RESAMPLING_MODES)[number];

export interface SourceRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

const SRGB_TO_LINEAR = new Float32Array(256);
/** LINEAR_THRESHOLDS[k]: linear value where sRGB rounding moves from code k to k + 1. */
const LINEAR_THRESHOLDS = new Float64Array(255);

function srgbToLinear(value: number): number {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

for (let i = 0; i < 256; i++) SRGB_TO_LINEAR[i] = srgbToLinear(i);
for (let k = 0; k < 255; k++) LINEAR_THRESHOLDS[k] = srgbToLinear(k + 0.5);

/** Linear light back to the nearest 8-bit sRGB code, by binary search. */
function linearToSrgb8(value: number): number {
    let low = 0;
    let high = 255;
    while (low < high) {
        const mid = (low + high) >> 1;
        if (value < LINEAR_THRESHOLDS[mid]) high = mid;
        else low = mid + 1;
    }
    return low;
}

/** Source indices and normalized weights covering each output index on one axis. */
interface AxisTaps {
    start: Int32Array;
    count: Int32Array;
    index: Int32Array;
    weight: Float32Array;
}

function buildTaps(offset: number, length: number, outLength: number, limit: number): AxisTaps {
    const scale = length / outLength;
    const start = new Int32Array(outLength);
    const count = new Int32Array(outLength);
    const index: number[] = [];
    const weight: number[] = [];

    for (let o = 0; o < outLength; o++) {
        const from = offset + o * scale;
        const to = from + scale;
        start[o] = index.length;
        let total = 0;
        for (let s = Math.floor(from); s < Math.ceil(to); s++) {
            const covered = Math.min(s + 1, to) - Math.max(s, from);
            if (covered <= 0) continue;
            index.push(s < 0 ? 0 : s >= limit ? limit - 1 : s);
            weight.push(covered);
            total += covered;
        }
        count[o] = index.length - start[o];
        for (let t = start[o]; t < index.length; t++) weight[t] /= total;
    }

    return { start, count, index: Int32Array.from(index), weight: Float32Array.from(weight) };
}

/**
 * Area-averages `rect` of `source` (fractional coordinates allowed) into a new
 * `outWidth` x `outHeight` image. Colors are weighted by alpha, so transparent
 * pixels do not darken their neighbours. Upscaling degrades to nearest neighbour.
 */
export function resampleArea(source: ImageData, rect: SourceRect, outWidth: number, outHeight: number): ImageData {
    const { width: srcWidth, height: srcHeight, data } = source;
    const xTaps = buildTaps(rect.x, rect.width, outWidth, srcWidth);
    const yTaps = buildTaps(rect.y, rect.height, outHeight, srcHeight);

    // One source row shrunk horizontally, in premultiplied linear RGBA. Rows
    // shared by two output rows are computed once; memory stays at two rows.
    const row = new Float32Array(outWidth * 4);
    const sum = new Float32Array(outWidth * 4);
    let cachedRow = -1;
    const shrinkRow = (sourceRow: number) => {
        const srcRow = sourceRow * srcWidth;
        for (let ox = 0; ox < outWidth; ox++) {
            let red = 0, green = 0, blue = 0, alpha = 0;
            const end = xTaps.start[ox] + xTaps.count[ox];
            for (let t = xTaps.start[ox]; t < end; t++) {
                const i = (srcRow + xTaps.index[t]) * 4;
                const a = (data[i + 3] / 255) * xTaps.weight[t];
                red += SRGB_TO_LINEAR[data[i]] * a;
                green += SRGB_TO_LINEAR[data[i + 1]] * a;
                blue += SRGB_TO_LINEAR[data[i + 2]] * a;
                alpha += a;
            }
            const o = ox * 4;
            row[o] = red;
            row[o + 1] = green;
            row[o + 2] = blue;
            row[o + 3] = alpha;
        }
        cachedRow = sourceRow;
    };

    const out = new Uint8ClampedArray(outWidth * outHeight * 4);
    for (let oy = 0; oy < outHeight; oy++) {
        sum.fill(0);
        const end = yTaps.start[oy] + yTaps.count[oy];
        for (let t = yTaps.start[oy]; t < end; t++) {
            if (yTaps.index[t] !== cachedRow) shrinkRow(yTaps.index[t]);
            const w = yTaps.weight[t];
            for (let i = 0; i < sum.length; i++) sum[i] += row[i] * w;
        }
        // Unpremultiply and return to sRGB.
        for (let ox = 0; ox < outWidth; ox++) {
            const i = ox * 4;
            const o = (oy * outWidth + ox) * 4;
            const alpha = sum[i + 3];
            if (alpha > 0) {
                out[o] = linearToSrgb8(sum[i] / alpha);
                out[o + 1] = linearToSrgb8(sum[i + 1] / alpha);
                out[o + 2] = linearToSrgb8(sum[i + 2] / alpha);
            }
            out[o + 3] = Math.round(alpha * 255);
        }
    }

    return new ImageData(out, outWidth, outHeight);
}
