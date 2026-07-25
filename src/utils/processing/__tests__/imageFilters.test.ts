import { describe, expect, it } from 'vitest';
import { applyImageFiltersInPlace } from '../imageFilters';

const pixel = (r: number, g: number, b: number) =>
    new ImageData(new Uint8ClampedArray([r, g, b, 255]), 1, 1);

describe('applyImageFiltersInPlace', () => {
    it('keeps the same buffer untouched for neutral settings', () => {
        const image = pixel(12, 34, 56);
        const originalBuffer = image.data.buffer;
        const result = applyImageFiltersInPlace(image, {
            brightness: 0,
            contrast: 0,
            saturation: 100,
        });

        expect(result).toBe(image);
        expect(result.data.buffer).toBe(originalBuffer);
        expect([...result.data]).toEqual([12, 34, 56, 255]);
    });

    it('applies brightness and contrast in place', () => {
        const image = pixel(100, 120, 140);
        applyImageFiltersInPlace(image, { brightness: 20, contrast: 25, saturation: 100 });
        expect([...image.data]).toEqual([118, 148, 178, 255]);
    });

    it('converts to luminance at zero saturation', () => {
        const image = pixel(255, 0, 0);
        applyImageFiltersInPlace(image, { brightness: 0, contrast: 0, saturation: 0 });
        expect([...image.data]).toEqual([54, 54, 54, 255]);
    });

    it('clamps channel values without allocating another ImageData', () => {
        const image = pixel(250, 240, 230);
        const result = applyImageFiltersInPlace(image, { brightness: 100, contrast: 100, saturation: 100 });
        expect(result).toBe(image);
        expect([...image.data]).toEqual([255, 255, 255, 255]);
    });
});
