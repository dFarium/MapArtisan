import { describe, expect, it } from 'vitest';
import { getNextInstanceCapacity } from '../instanceCapacity';

describe('3D instance buffer capacity', () => {
    it('grows with headroom when the current allocation is insufficient', () => {
        expect(getNextInstanceCapacity(10_000, 20_000)).toBe(22_000);
    });

    it('shrinks after moving from a large grid to a much smaller one', () => {
        expect(getNextInstanceCapacity(500_000, 20_000)).toBe(22_000);
    });

    it('keeps capacity for small fluctuations to avoid allocation churn', () => {
        expect(getNextInstanceCapacity(100_000, 40_000)).toBeNull();
    });

    it('keeps a small minimum capacity', () => {
        expect(getNextInstanceCapacity(500_000, 100)).toBe(1_024);
    });
});
