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
/**
 * Shared memory buffers to reuse during Smart Drop calculations.
 * Pre-allocating these buffers prevents garbage collection spikes when processing large images.
 */
export interface SmartDropWorkspace {
    ref: Int32Array;        // Reference heights from the classic accumulation algorithm
    minFuturo: Int32Array;  // Suffix minimum heights tracking the lowest height reached in the future
    path: Int32Array;       // Optimized height path
}

/**
 * Optimizes the height profile of a vertical map column to minimize the total Y range (height profile).
 * 
 * Minecraft maps display shadows and highlights depending on relative height differences between 
 * adjacent blocks along the north-to-south column.
 * - Going UP (North is lower than South) creates a HIGHLIGHT block (+1).
 * - Staying FLAT creates a NORMAL block (0).
 * - Going DOWN (North is higher than South) creates a SHADOW block (-1).
 * 
 * Smart Drop optimization looks ahead at future heights using a suffix-minimum table.
 * If a shadow block (-1) is encountered, rather than just descending 1 block, it checks if it can drop 
 * significantly lower to recover height headroom for future climbs, without violating subsequent shade requirements.
 * 
 * @param toneMap Array or TypedArray containing relative pixel tones (-1, 0, 1).
 * @param startIndex Starting index of the column in the flat 1D image buffer.
 * @param stride Distance between elements of the column (typically the width of the image).
 * @param count Number of pixels in the column.
 * @param workspace Optional preallocated buffers to reuse.
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
        path = new Array(n); // Legacy array allocation for compatibility
    }

    // 1. Classical Reference Height:
    // Calculates a direct accumulation profile.
    ref[0] = 0;
    for (let i = 0; i < n; i++) {
        const t = toneMap[startIndex + i * stride];
        if (t === 1) ref[i + 1] = ref[i] + 1;
        else if (t === 0) ref[i + 1] = ref[i];
        else if (t === -1) ref[i + 1] = ref[i] - 1;
    }

    // 2. Suffix Minimum (Future Lookahead):
    // Computes the absolute lowest height reached from index i to the end of the column.
    let currentMin = Infinity;
    for (let i = n; i >= 0; i--) {
        if (ref[i] < currentMin) currentMin = ref[i];
        minFuturo[i] = currentMin;
    }

    // 3. Smart Drop Construction:
    // Builds the optimized height profile. If tone is -1 (descending), we compare 
    // the current reference height against the suffix minimum to determine if we can drop
    // further down.
    let currentOpt = 0;
    let maxOpt = 0;
    let minOpt = 0;

    for (let i = 0; i < n; i++) {
        const t = toneMap[startIndex + i * stride];

        if (t === -1) {
            // Find the lowest safe drop level that doesn't violate future slopes
            const alturaSegura = ref[i + 1] - minFuturo[i + 1];
            if (alturaSegura < currentOpt) {
                currentOpt = alturaSegura;
            } else {
                currentOpt -= 1;
            }
        } else if (t === 1) {
            currentOpt += 1;
        }
        // If t === 0, currentOpt remains identical.

        path[i] = currentOpt;

        if (currentOpt > maxOpt) maxOpt = currentOpt;
        if (currentOpt < minOpt) minOpt = currentOpt;
    }

    return { min: minOpt, max: maxOpt, path };
}
