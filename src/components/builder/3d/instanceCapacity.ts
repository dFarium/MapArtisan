const MIN_INSTANCE_CAPACITY = 1_024;
const CAPACITY_HEADROOM = 1.1;
const SHRINK_THRESHOLD = 0.25;

/**
 * Returns a new allocation size when instance buffers should grow or shrink.
 * Shrinking only below 25% utilization prevents oscillation while ensuring a
 * large preview does not stay retained after switching to a much smaller grid.
 */
export function getNextInstanceCapacity(currentCapacity: number, instanceCount: number): number | null {
    const shouldGrow = instanceCount > currentCapacity;
    const shouldShrink =
        currentCapacity > MIN_INSTANCE_CAPACITY &&
        instanceCount < currentCapacity * SHRINK_THRESHOLD;

    if (!shouldGrow && !shouldShrink) return null;
    return Math.max(MIN_INSTANCE_CAPACITY, Math.ceil(instanceCount * CAPACITY_HEADROOM));
}
