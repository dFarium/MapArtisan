import { describe, expect, it, beforeEach } from 'vitest';
import { useMapartStore } from '../useMapartStore';
import { estimateMemoryUsage, MAX_MAPS_TOTAL } from '../../utils/memory';

describe('Memory cycle profiling', () => {
    beforeEach(() => {
        useMapartStore.setState({
            gridDimensions: { x: 1, y: 1 },
            memoryEstimate: estimateMemoryUsage(1, 1),
            manualEdits: {},
            history: [],
            historyIndex: 0,
        });
    });

    it('handles 1x1 → 5x5 → 1x1 cycle without memory growth', () => {
        const startState = useMapartStore.getState();

        useMapartStore.getState().setGridDimensions({ x: 5, y: 5 });
        const midState = useMapartStore.getState();
        expect(midState.gridDimensions).toEqual({ x: 5, y: 5 });
        expect(midState.memoryEstimate.totalMaps).toBe(25);

        useMapartStore.getState().setGridDimensions({ x: 1, y: 1 });
        const endState = useMapartStore.getState();
        expect(endState.gridDimensions).toEqual({ x: 1, y: 1 });
        expect(endState.memoryEstimate.totalMaps).toBe(1);
        expect(endState.memoryEstimate.estimatedMB).toBeLessThan(startState.memoryEstimate.estimatedMB + 1);
    });

    it('handles load → clear → load cycle', () => {
        useMapartStore.getState().setGridDimensions({ x: 3, y: 3 });
        expect(useMapartStore.getState().gridDimensions).toEqual({ x: 3, y: 3 });

        useMapartStore.getState().setUploadedImage(null);
        expect(useMapartStore.getState().previewUrl).toBeNull();
        expect(useMapartStore.getState().manualEdits).toEqual({});

        const file = new File(['test'], 'test.png', { type: 'image/png' });
        useMapartStore.getState().setUploadedImage(file);
        expect(useMapartStore.getState().previewUrl).toBeDefined();
        expect(useMapartStore.getState().manualEdits).toEqual({});
    });

    it('handles grid scaling cycle 1x1 → 8x8 → 1x1', () => {
        const sizes = [
            { x: 1, y: 1 },
            { x: 2, y: 2 },
            { x: 4, y: 4 },
            { x: 8, y: 8 },
            { x: 4, y: 4 },
            { x: 2, y: 2 },
            { x: 1, y: 1 },
        ];

        for (const size of sizes) {
            useMapartStore.getState().setGridDimensions(size);
            const state = useMapartStore.getState();
            expect(state.gridDimensions).toEqual(size);
            expect(state.memoryEstimate.totalMaps).toBe(size.x * size.y);
        }
    });

    it('clamps grid at hard limit during growth cycle', () => {
        useMapartStore.getState().setGridDimensions({ x: 1, y: 1 });
        useMapartStore.getState().setGridDimensions({ x: 8, y: 8 });
        expect(useMapartStore.getState().gridDimensions).toEqual({ x: 8, y: 8 });

        useMapartStore.getState().setGridDimensions({ x: 9, y: 8 });
        const clamped = useMapartStore.getState().gridDimensions;
        expect(clamped.x * clamped.y).toBeLessThanOrEqual(MAX_MAPS_TOTAL);
    });

    it('tracks memory estimate correctly through cycles', () => {
        const estimates: number[] = [];

        const sizes = [1, 2, 3, 4, 5, 4, 3, 2, 1];
        for (const n of sizes) {
            useMapartStore.getState().setGridDimensions({ x: n, y: n });
            estimates.push(useMapartStore.getState().memoryEstimate.estimatedMB);
        }

        expect(estimates[0]).toBeLessThan(estimates[4]);
        expect(estimates[8]).toBe(estimates[0]);
    });

    it('validates soft limit warning threshold', () => {
        const belowSoft = estimateMemoryUsage(9, 10);
        expect(belowSoft.exceedsSoftLimit).toBe(false);

        const atSoft = estimateMemoryUsage(10, 10);
        expect(atSoft.exceedsSoftLimit).toBe(true);

        const aboveSoft = estimateMemoryUsage(11, 11);
        expect(aboveSoft.exceedsSoftLimit).toBe(true);
    });

    it('validates hard limit enforcement', () => {
        const atHard = estimateMemoryUsage(11, 11);
        expect(atHard.exceedsHardLimit).toBe(false);

        const aboveHard = estimateMemoryUsage(12, 11);
        expect(aboveHard.exceedsHardLimit).toBe(true);
    });
});
