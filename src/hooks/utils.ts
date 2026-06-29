/**
 * Convierte un ImageData a Blob URL usando un canvas offscreen.
 * Función compartida entre hooks que necesitan generar previews.
 */
export async function imageDataToBlobUrl(imageData: ImageData): Promise<string> {
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas context');
    ctx.putImageData(imageData, 0, 0);

    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) {
                resolve(URL.createObjectURL(blob));
            } else {
                reject(new Error('Failed to create blob'));
            }
        }, 'image/png');
    });
}
