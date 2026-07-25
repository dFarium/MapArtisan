interface ImageFilterSettings {
    brightness: number;
    contrast: number;
    saturation: number;
}

const clampByte = (value: number): number => value < 0 ? 0 : value > 255 ? 255 : value;

/**
 * Applies the CSS brightness -> contrast -> saturate order directly to the
 * bounded output buffer, avoiding native filtered surfaces for the source image.
 */
export function applyImageFiltersInPlace(
    imageData: ImageData,
    { brightness, contrast, saturation }: ImageFilterSettings
): ImageData {
    if (brightness === 0 && contrast === 0 && saturation === 100) return imageData;

    const brightnessFactor = (100 + brightness) / 100;
    const contrastFactor = (100 + contrast) / 100;
    const saturationFactor = saturation / 100;
    const data = imageData.data;

    for (let index = 0; index < data.length; index += 4) {
        const r = (data[index] * brightnessFactor - 128) * contrastFactor + 128;
        const g = (data[index + 1] * brightnessFactor - 128) * contrastFactor + 128;
        const b = (data[index + 2] * brightnessFactor - 128) * contrastFactor + 128;

        data[index] = clampByte(
            (0.213 + 0.787 * saturationFactor) * r +
            (0.715 - 0.715 * saturationFactor) * g +
            (0.072 - 0.072 * saturationFactor) * b
        );
        data[index + 1] = clampByte(
            (0.213 - 0.213 * saturationFactor) * r +
            (0.715 + 0.285 * saturationFactor) * g +
            (0.072 - 0.072 * saturationFactor) * b
        );
        data[index + 2] = clampByte(
            (0.213 - 0.213 * saturationFactor) * r +
            (0.715 - 0.715 * saturationFactor) * g +
            (0.072 + 0.928 * saturationFactor) * b
        );
    }

    return imageData;
}
