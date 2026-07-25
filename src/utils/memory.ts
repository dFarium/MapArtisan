/**
 * Memory estimation utilities for mapart grid configurations.
 *
 * Estimates RAM usage based on grid dimensions to prevent crashes
 * on large configurations and provide user feedback.
 */

const BYTES_PER_PIXEL = 100;
const MAP_PIXELS = 128;

export interface MemoryEstimate {
    width: number;
    height: number;
    totalPixels: number;
    totalMaps: number;
    estimatedMB: number;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    exceedsSoftLimit: boolean;
    exceedsHardLimit: boolean;
    usagePercent: number;
}

export const MAX_MAPS_TOTAL = 128;
export const SOFT_LIMIT_MAPS = 96;

export function estimateMemoryUsage(mapsX: number, mapsY: number): MemoryEstimate {
    const width = mapsX * MAP_PIXELS;
    const height = mapsY * MAP_PIXELS;
    const totalPixels = width * height;
    const totalMaps = mapsX * mapsY;
    const estimatedMB = (totalPixels * BYTES_PER_PIXEL) / (1024 * 1024);

    let riskLevel: 'low' | 'medium' | 'high' | 'critical';
    if (estimatedMB < 20) riskLevel = 'low';
    else if (estimatedMB < 80) riskLevel = 'medium';
    else if (estimatedMB < 200) riskLevel = 'high';
    else riskLevel = 'critical';

    return {
        width,
        height,
        totalPixels,
        totalMaps,
        estimatedMB: Math.round(estimatedMB * 10) / 10,
        riskLevel,
        exceedsSoftLimit: totalMaps > SOFT_LIMIT_MAPS,
        exceedsHardLimit: totalMaps > MAX_MAPS_TOTAL,
        usagePercent: Math.min((totalMaps / MAX_MAPS_TOTAL) * 100, 100),
    };
}

export function clampGridDimensions(
    newX: number,
    newY: number,
    prevX: number,
    prevY: number
): { x: number; y: number } {
    const x = Math.max(1, Math.round(newX));
    const y = Math.max(1, Math.round(newY));

    if (x * y <= MAX_MAPS_TOTAL) {
        return { x, y };
    }

    const xChanged = x !== prevX;
    const yChanged = y !== prevY;

    if (xChanged || !yChanged) {
        const clampedX = Math.max(1, Math.floor(MAX_MAPS_TOTAL / y));
        return { x: clampedX, y };
    }

    const clampedY = Math.max(1, Math.floor(MAX_MAPS_TOTAL / x));
    return { x, y: clampedY };
}
