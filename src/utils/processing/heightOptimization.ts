/**
 * Height Optimization (Smart Drop Algorithm)
 * Ported from Python implementation
 */

// ============================================================================
// Smart Drop Optimization
// ============================================================================

/**
 * Optimizes the height profile of a column to minimize the total height range.
 * Uses a "Smart Drop" strategy that capitalizes on shadow blocks (tone -1)
 * to drop deeper when safe, recovering height for future climbs.
 * 
 * Optimized to read directly from a shared buffer to avoid allocations.
 */
// Workspace for reusing buffers
export interface SmartDropWorkspace {
    ref: Int32Array;
    minFuturo: Int32Array;
    path: Int32Array; // Changed to Int32Array for better performance
}

/**
 * Optimizes the height profile of a column to minimize the total height range.
 * Uses a "Smart Drop" strategy that capitalizes on shadow blocks (tone -1)
 * to drop deeper when safe, recovering height for future climbs.
 * 
 * Optimized to read directly from a shared buffer to avoid allocations.
 */
export function optimizeColumnHeights(
    toneMap: Int8Array | number[],
    startIndex: number = 0,
    stride: number = 1,
    count: number = -1,
    workspace?: SmartDropWorkspace
): { min: number; max: number; path: number[] | Int32Array } {
    const n = count === -1 ? toneMap.length : count;

    // Use workspace buffers if available, otherwise allocate
    let ref: Int32Array;
    let minFuturo: Int32Array;
    let path: Int32Array | number[];

    if (workspace) {
        if (workspace.ref.length < n + 1) {
            // Resize if too small (should rarely happen if allocated correctly)
            workspace.ref = new Int32Array(n + 1);
        }
        ref = workspace.ref;

        if (workspace.minFuturo.length < n + 1) {
            workspace.minFuturo = new Int32Array(n + 1);
        }
        minFuturo = workspace.minFuturo;

        if (workspace.path.length < n) {
            workspace.path = new Int32Array(n);
        }
        path = workspace.path;
    } else {
        ref = new Int32Array(n + 1);
        minFuturo = new Int32Array(n + 1);
        path = new Array(n); // Legacy behavior returns number[]
    }

    // 1. Reference (Classic Approach)
    ref[0] = 0;

    for (let i = 0; i < n; i++) {
        const t = toneMap[startIndex + i * stride];
        if (t === 1) ref[i + 1] = ref[i] + 1;
        else if (t === 0) ref[i + 1] = ref[i];
        else if (t === -1) ref[i + 1] = ref[i] - 1;
    }

    // 2. Suffix Min (Future Lookahead)
    let currentMin = Infinity;

    // ref has n+1 elements, indices 0..n
    for (let i = n; i >= 0; i--) {
        if (ref[i] < currentMin) currentMin = ref[i];
        minFuturo[i] = currentMin;
    }

    // 3. Smart Drop Construction
    let currentOpt = 0;
    let maxOpt = 0;
    let minOpt = 0;

    for (let i = 0; i < n; i++) {
        const t = toneMap[startIndex + i * stride];

        if (t === -1) {
            // Check safe drop target
            const alturaSegura = ref[i + 1] - minFuturo[i + 1];
            if (alturaSegura < currentOpt) {
                currentOpt = alturaSegura;
            } else {
                currentOpt -= 1;
            }
        } else if (t === 1) {
            currentOpt += 1;
        }
        // If t == 0, currentOpt stays same.

        path[i] = currentOpt;

        if (currentOpt > maxOpt) maxOpt = currentOpt;
        if (currentOpt < minOpt) minOpt = currentOpt;
    }

    return { min: minOpt, max: maxOpt, path };
}
