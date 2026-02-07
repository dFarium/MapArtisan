/**
 * File Export
 * Generate and download Litematica files
 */

import JSZip from 'jszip';
import type { BuildMode, BrightnessLevel } from '../../types/mapart';
import type { DitheringMode } from '../mapartProcessing';
import { serializeNBT } from '../nbtWriter';
import { DEFAULT_VERSION } from '../../data/supportedVersions';
import type { LitematicaMetadata } from './types';
import { imageDataToBlockStates } from './blockGeneration';
import { createLitematicaNBT } from './nbtBuilder';

/**
 * Generate Litematica export data (Blob)
 * If map is larger than 128x128, it will be split into multiple files and zipped.
 */
export async function generateMapartExport(
    imageData: ImageData,
    selectedPaletteItems: Record<number, string | null>,
    buildMode: BuildMode,
    filename: string = 'mapart.litematic',
    metadata: LitematicaMetadata = {},
    threeDPrecision: number = 0,
    dithering: DitheringMode = 'none',
    useCielab: boolean = true,
    hybridStrength: number = 50,
    independentMaps: boolean = false,
    manualEdits?: Record<number, { blockId: string; brightness: BrightnessLevel; rgb: { r: number; g: number; b: number } }>,
    blockSupport: 'all' | 'needed' | 'gravity' = 'all',
    supportBlockId: string = 'minecraft:cobblestone',
    targetVersion: string = DEFAULT_VERSION
): Promise<{ blob: Blob; filename: string }> {
    const { width, height, data } = imageData;
    const isMultiMap = width > 128 || height > 128;

    if (!isMultiMap) {
        // Single Map Case
        const blockStatesOpt = imageDataToBlockStates(
            imageData, selectedPaletteItems, buildMode, true,
            threeDPrecision, dithering, useCielab, hybridStrength, independentMaps, manualEdits, blockSupport, supportBlockId
        );

        const nbtOpt = createLitematicaNBT(blockStatesOpt, {
            ...metadata,
            name: metadata.name || 'MapArt',
            description: metadata.description || 'MapArt created by MapArtisan'
        }, targetVersion);
        const nbtDataOpt = serializeNBT(nbtOpt);
        const blob = new Blob([nbtDataOpt as BlobPart], { type: 'application/octet-stream' });

        return { blob, filename };

    } else {
        // Multi Map Case - Split and Zip
        const zip = new JSZip();
        const baseName = filename.replace(/\.litematic$/, '');
        const mapsX = Math.ceil(width / 128);
        const mapsY = Math.ceil(height / 128);

        for (let y = 0; y < mapsY; y++) {
            for (let x = 0; x < mapsX; x++) {
                const sectionWidth = 128;
                const sectionHeight = 128;
                const sectionData = new Uint8ClampedArray(sectionWidth * sectionHeight * 4);
                const sectionManualEdits: typeof manualEdits = {};

                for (let sy = 0; sy < sectionHeight; sy++) {
                    for (let sx = 0; sx < sectionWidth; sx++) {
                        const globalX = x * 128 + sx;
                        const globalY = y * 128 + sy;

                        if (globalX < width && globalY < height) {
                            const sourceIdx = (globalY * width + globalX) * 4;
                            const targetIdx = (sy * sectionWidth + sx) * 4;
                            sectionData[targetIdx] = data[sourceIdx];
                            sectionData[targetIdx + 1] = data[sourceIdx + 1];
                            sectionData[targetIdx + 2] = data[sourceIdx + 2];
                            sectionData[targetIdx + 3] = data[sourceIdx + 3];

                            const globalPixelIdx = globalY * width + globalX;
                            if (manualEdits && manualEdits[globalPixelIdx]) {
                                const localPixelIdx = sy * sectionWidth + sx;
                                sectionManualEdits[localPixelIdx] = manualEdits[globalPixelIdx];
                            }
                        }
                    }
                }

                const sectionImageData = new ImageData(sectionData, sectionWidth, sectionHeight);

                const blockStates = imageDataToBlockStates(
                    sectionImageData, selectedPaletteItems, buildMode, true,
                    threeDPrecision, dithering, useCielab, hybridStrength, independentMaps, sectionManualEdits, blockSupport, supportBlockId
                );

                const sectionNbt = createLitematicaNBT(blockStates, {
                    ...metadata,
                    name: `${metadata.name || 'MapArt'} (${x},${y})`,
                    description: `Section ${x},${y} - ${metadata.description || 'MapArt created by MapArtisan'} `
                }, targetVersion);

                const sectionBuffer = serializeNBT(sectionNbt);
                zip.file(`${baseName}_${x}_${y}.litematic`, sectionBuffer);
            }
        }

        const zipContent = await zip.generateAsync({ type: 'blob' });
        return { blob: zipContent, filename: `${baseName} _package.zip` };
    }
}

/**
 * Trigger browser download for a Blob
 */
export function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
