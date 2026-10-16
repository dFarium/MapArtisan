/**
 * Height Optimization
 *
 * Minecraft shades a map pixel by comparing its block with the block to its
 * north: higher gives a highlight (+1), equal gives normal (0), lower gives a
 * shadow (-1). Only the sign matters, so a step may climb or drop by any
 * number of blocks. Each column is independent of its neighbours.
 */

/**
 * Reusable buffers for column optimization. Create them with
 * `createHeightWorkspace` and pass them to every call in a loop to avoid
 * per-column allocations on large images.
 */
export interface SmartDropWorkspace {
    /** upAhead[i]: highlights from row i onward before the next shadow. */
    upAhead: Int32Array;
    /** downAhead[i]: shadows from row i onward before the next highlight. */
    downAhead: Int32Array;
    /** Output heights, one per row. */
    path: Int32Array;
}

export function createHeightWorkspace(rows: number): SmartDropWorkspace {
    return {
        upAhead: new Int32Array(rows + 1),
        downAhead: new Int32Array(rows + 1),
        path: new Int32Array(rows),
    };
}

/**
 * Builds the lowest possible staircase for one map column.
 *
 * A run of highlights with no shadow in between must rise one block per
 * highlight at least, and a run of shadows with no highlight must fall one
 * block per shadow, so the column can never be shorter than its longest such
 * run. This function always reaches that bound:
 * - Inside a run, every step moves exactly one block.
 * - The last highlight before a run of shadows jumps high enough for the
 *   whole descent to stay above the floor.
 * - The last shadow before a run of highlights drops low enough for the whole
 *   climb to stay below the ceiling.
 *
 * Heights are relative to the north reference block (the noobline) at 0, and
 * `min`/`max` include that reference, so `max - min` is the column range.
 *
 * @param toneMap Relative tones (-1, 0, 1), one per pixel.
 * @param startIndex Index of the column's first (northernmost) pixel.
 * @param stride Distance between consecutive pixels of the column.
 * @param count Number of pixels in the column, or -1 for the whole array.
 * @param workspace Optional reusable buffers from `createHeightWorkspace`.
 */
export function optimizeColumnHeights(
    toneMap: Int8Array | number[],
    startIndex: number = 0,
    stride: number = 1,
    count: number = -1,
    workspace?: SmartDropWorkspace
): { min: number; max: number; path: number[] | Int32Array } {
    const n = count === -1 ? toneMap.length : count;

    let upAhead: Int32Array;
    let downAhead: Int32Array;
    let path: Int32Array | number[];
    if (workspace) {
        if (workspace.upAhead.length < n + 1) workspace.upAhead = new Int32Array(n + 1);
        if (workspace.downAhead.length < n + 1) workspace.downAhead = new Int32Array(n + 1);
        if (workspace.path.length < n) workspace.path = new Int32Array(n);
        upAhead = workspace.upAhead;
        downAhead = workspace.downAhead;
        path = workspace.path;
    } else {
        upAhead = new Int32Array(n + 1);
        downAhead = new Int32Array(n + 1);
        path = new Array(n);
    }

    // 1. Remaining run lengths, scanning from the south end. The longest run
    //    anywhere in the column is the minimum possible range.
    upAhead[n] = 0;
    downAhead[n] = 0;
    let range = 0;
    for (let i = n - 1; i >= 0; i--) {
        const t = toneMap[startIndex + i * stride];
        if (t === 1) {
            upAhead[i] = upAhead[i + 1] + 1;
            downAhead[i] = 0;
        } else if (t === -1) {
            upAhead[i] = 0;
            downAhead[i] = downAhead[i + 1] + 1;
        } else {
            upAhead[i] = upAhead[i + 1];
            downAhead[i] = downAhead[i + 1];
        }
        if (upAhead[i] > range) range = upAhead[i];
        if (downAhead[i] > range) range = downAhead[i];
    }

    // 2. Walk north to south inside [0, range]. The reference starts high
    //    enough for an opening run of shadows.
    const reference = downAhead[0];
    let current = reference;
    let min = 0;
    let max = 0;
    for (let i = 0; i < n; i++) {
        const t = toneMap[startIndex + i * stride];
        if (t === 1) {
            const needed = downAhead[i + 1];
            current = current + 1 > needed ? current + 1 : needed;
        } else if (t === -1) {
            const allowed = range - upAhead[i + 1];
            current = current - 1 < allowed ? current - 1 : allowed;
        }

        const relative = current - reference;
        path[i] = relative;
        if (relative > max) max = relative;
        if (relative < min) min = relative;
    }

    return { min, max, path };
}
