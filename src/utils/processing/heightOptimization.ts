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
 */
export function optimizeColumnHeights(tonos: number[]): { min: number; max: number; path: number[] } {
    // 1. Reference (Classic Approach)
    const ref = [0];
    for (const t of tonos) {
        if (t === 1) ref.push(ref[ref.length - 1] + 1);
        else if (t === 0) ref.push(ref[ref.length - 1]);
        else if (t === -1) ref.push(ref[ref.length - 1] - 1);
    }

    // 2. Suffix Min (Future Lookahead)
    const n = ref.length;
    const minFuturo = new Int32Array(n);
    let currentMin = Infinity;
    for (let i = n - 1; i >= 0; i--) {
        if (ref[i] < currentMin) currentMin = ref[i];
        minFuturo[i] = currentMin;
    }

    // 3. Smart Drop Construction
    const path: number[] = [];
    let currentOpt = 0;
    let maxOpt = 0;
    let minOpt = 0;

    // Generate path for each tone
    for (let i = 0; i < tonos.length; i++) {
        const t = tonos[i];
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

        path.push(currentOpt);

        if (currentOpt > maxOpt) maxOpt = currentOpt;
        if (currentOpt < minOpt) minOpt = currentOpt;
    }

    return { min: minOpt, max: maxOpt, path };
}
