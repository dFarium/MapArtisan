/**
 * Height Limit
 *
 * A 3D column is as tall as its longest run of highlights with no shadow in
 * between (or shadows with no highlight), plus one block. Normal pixels do not
 * break a run. To keep a build under a chosen height, quantization tracks the
 * run of every column and, when the preferred tone would make it too long,
 * picks the closest color with the opposite tone instead. That restarts the
 * run, and error diffusion absorbs the color difference of that pixel.
 *
 * Where the forced pixels land is a visual tradeoff on flat areas:
 * - `lines`: every run is cut at the same length, so neighbouring columns
 *   reset on the same row and leave regular horizontal lines.
 * - `noise`: every run draws its own length between half the limit and the
 *   limit, which scatters the resets as noise.
 * - `balanced`: past half the limit, a run resets early with a probability
 *   that grows towards the limit.
 *
 * Randomness comes from a hash of the pixel position, so the same image and
 * settings always give the same map, in TypeScript and in Rust.
 */

export const HEIGHT_LIMIT_STYLES = ['lines', 'balanced', 'noise'] as const;

export type HeightLimitStyle = (typeof HEIGHT_LIMIT_STYLES)[number];

export function isHeightLimitStyle(value: string): value is HeightLimitStyle {
    return HEIGHT_LIMIT_STYLES.some(style => style === value);
}

export interface HeightLimit {
    /** Maximum build height in blocks. 0 means no limit. */
    blocks: number;
    style: HeightLimitStyle;
}

export const NO_HEIGHT_LIMIT: HeightLimit = { blocks: 0, style: 'balanced' };

/** Deterministic hash of two integers into [0, 1). Mirrored in Rust. */
export function hash01(a: number, b: number): number {
    let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
}

/**
 * Per-column run state for a quantizer that visits each column from north to
 * south. Call `resetSegment` at the first row and at every independent map
 * boundary, `allowedTone` before committing a pixel and `commit` after.
 */
export class ColumnRunLimiter {
    /** Longest allowed run: the height limit minus one block. */
    private readonly maxRun: number;
    private readonly style: HeightLimitStyle;
    private readonly direction: Int8Array;
    private readonly run: Int32Array;
    private readonly runLimit: Int32Array;

    constructor(width: number, limit: HeightLimit) {
        this.maxRun = Math.max(0, limit.blocks - 1);
        this.style = limit.style;
        this.direction = new Int8Array(width);
        this.run = new Int32Array(width);
        this.runLimit = new Int32Array(width);
    }

    resetSegment(y: number): void {
        this.direction.fill(0);
        this.run.fill(0);
        for (let x = 0; x < this.runLimit.length; x++) {
            this.runLimit[x] = this.drawRunLimit(x, y);
        }
    }

    /**
     * Returns `tone` when the column can take it, otherwise the tone that
     * must replace it: the opposite tone, or normal when the limit is one block.
     */
    allowedTone(x: number, y: number, tone: number): number {
        if (tone === 0) return 0;
        if (this.maxRun === 0) return 0;
        if (tone !== this.direction[x]) return tone;

        const run = this.run[x];
        if (run + 1 > this.runLimit[x]) return -tone;
        if (this.style === 'balanced') {
            const half = this.maxRun / 2;
            if (run >= half) {
                const p = (run - half) / half;
                if (hash01(x * 131 + 7, y) < p * p) return -tone;
            }
        }
        return tone;
    }

    commit(x: number, y: number, tone: number): void {
        if (tone === 0) return;
        if (tone === this.direction[x]) {
            this.run[x]++;
        } else {
            this.direction[x] = tone;
            this.run[x] = 1;
            this.runLimit[x] = this.drawRunLimit(x, y);
        }
    }

    private drawRunLimit(x: number, y: number): number {
        if (this.style !== 'noise') return this.maxRun;
        const shortened = Math.floor(hash01(x * 31 + 11, y) * (this.maxRun / 2 + 1));
        return Math.max(1, this.maxRun - shortened);
    }
}
