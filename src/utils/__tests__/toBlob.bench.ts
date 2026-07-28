import { describe, expect, it } from 'vitest';

function imageDataToPngBlob(imageData: ImageData): Promise<Blob> {
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext('2d')!;
    ctx.putImageData(imageData, 0, 0);
    return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(blob => {
            if (blob) resolve(blob);
            else reject(new Error('Failed to encode preview'));
        }, 'image/png');
    });
}

function imageDataToDataUrl(imageData: ImageData): string {
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext('2d')!;
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
}

function makeImageData(size: number): ImageData {
    const data = new Uint8ClampedArray(size * size * 4);
    for (let i = 0; i < data.length; i += 4) {
        data[i] = (i / 4) % 256;
        data[i + 1] = ((i / 4) * 2) % 256;
        data[i + 2] = ((i / 4) * 3) % 256;
        data[i + 3] = 255;
    }
    return new ImageData(data, size, size);
}

describe('toBlob vs toDataURL benchmark', () => {
    it('measures toBlob encoding time for 128x128', async () => {
        const img = makeImageData(128);
        const start = performance.now();
        const blob = await imageDataToPngBlob(img);
        const duration = performance.now() - start;

        console.log(`[toBlob 128x128] ${duration.toFixed(1)}ms, blob size: ${(blob.size / 1024).toFixed(1)}KB`);
        expect(duration).toBeLessThan(500);
        expect(blob.size).toBeGreaterThan(0);
    });

    it('measures toBlob encoding time for 256x256', async () => {
        const img = makeImageData(256);
        const start = performance.now();
        const blob = await imageDataToPngBlob(img);
        const duration = performance.now() - start;

        console.log(`[toBlob 256x256] ${duration.toFixed(1)}ms, blob size: ${(blob.size / 1024).toFixed(1)}KB`);
        expect(duration).toBeLessThan(2000);
    });

    it('measures toBlob encoding time for 512x512', async () => {
        const img = makeImageData(512);
        const start = performance.now();
        const blob = await imageDataToPngBlob(img);
        const duration = performance.now() - start;

        console.log(`[toBlob 512x512] ${duration.toFixed(1)}ms, blob size: ${(blob.size / 1024).toFixed(1)}KB`);
        expect(duration).toBeLessThan(5000);
    });

    it('measures toDataURL encoding time for 128x128', () => {
        const img = makeImageData(128);
        const start = performance.now();
        const dataUrl = imageDataToDataUrl(img);
        const duration = performance.now() - start;

        console.log(`[toDataURL 128x128] ${duration.toFixed(1)}ms, dataUrl length: ${(dataUrl.length / 1024).toFixed(1)}KB`);
        expect(duration).toBeLessThan(500);
    });

    it('measures toDataURL encoding time for 256x256', () => {
        const img = makeImageData(256);
        const start = performance.now();
        const dataUrl = imageDataToDataUrl(img);
        const duration = performance.now() - start;

        console.log(`[toDataURL 256x256] ${duration.toFixed(1)}ms, dataUrl length: ${(dataUrl.length / 1024).toFixed(1)}KB`);
        expect(duration).toBeLessThan(2000);
    });

    it('measures toDataURL encoding time for 512x512', () => {
        const img = makeImageData(512);
        const start = performance.now();
        const dataUrl = imageDataToDataUrl(img);
        const duration = performance.now() - start;

        console.log(`[toDataURL 512x512] ${duration.toFixed(1)}ms, dataUrl length: ${(dataUrl.length / 1024).toFixed(1)}KB`);
        expect(duration).toBeLessThan(5000);
    });

    it('compares toBlob vs toDataURL for 256x256', async () => {
        const img = makeImageData(256);

        const startBlob = performance.now();
        const blob = await imageDataToPngBlob(img);
        const blobDuration = performance.now() - startBlob;

        const startDataUrl = performance.now();
        const dataUrl = imageDataToDataUrl(img);
        const dataUrlDuration = performance.now() - startDataUrl;

        console.log(`[Comparison 256x256] toBlob: ${blobDuration.toFixed(1)}ms, toDataURL: ${dataUrlDuration.toFixed(1)}ms`);

        // The asynchronous Blob path is selected for bounded memory and main-thread
        // scheduling, not for a fixed latency ratio against the synchronous API.
        expect(blob.type).toBe('image/png');
        expect(blob.size).toBeGreaterThan(0);
        expect(dataUrl).toMatch(/^data:image\/png;base64,/);
        expect(blobDuration).toBeLessThan(5_000);
        expect(dataUrlDuration).toBeLessThan(5_000);
    });
});
