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
    exportMode: 'full' | 'sections' = 'sections',
    targetVersion: string = DEFAULT_VERSION
): Promise<{ blob: Blob; filename: string }> {
    const { width, height } = imageData;
    const isMultiMap = (width > 128 || height > 128) && exportMode === 'sections';

    if (!isMultiMap) {
        // Single Map Case
        const blockStatesOpt = imageDataToBlockStates(
            imageData, selectedPaletteItems, buildMode, true,
            threeDPrecision, dithering, useCielab, hybridStrength, independentMaps, manualEdits, blockSupport, supportBlockId,
            exportMode
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
        // Multi Map Case - Global Processing then Split
        // 1. Generate ALL blocks globally or per section depending on independentMaps
        const allBlocks = imageDataToBlockStates(
            imageData, selectedPaletteItems, buildMode, true,
            threeDPrecision, dithering, useCielab, hybridStrength, independentMaps, manualEdits, blockSupport, supportBlockId,
            exportMode
        );

        const zip = new JSZip();
        const baseName = filename.replace(/\.litematic$/, '');
        const mapsX = Math.ceil(width / 128);
        const mapsY = Math.ceil(height / 128);

        // 2. Group blocks by section (with boundary sharing)
        const sectionedBlocks: Map<string, typeof allBlocks> = new Map();

        for (const block of allBlocks) {
            const mapXIndex = Math.floor(block.x / 128);
            const targetMapsY: number[] = [];

            if (block.z === 0) {
                targetMapsY.push(0);
            } else if (independentMaps) {
                // In Independent mode, blocks at z = m*128 are explicit nooblines for map m
                if (block.z % 128 === 0) {
                    const m = block.z / 128;
                    if (m < mapsY) {
                        targetMapsY.push(m);
                    } else {
                        // This might be the last row of the entire map art
                        targetMapsY.push(m - 1);
                    }
                } else {
                    const mapYIdx = Math.floor((block.z - 1) / 128);
                    targetMapsY.push(mapYIdx);
                }
            } else {
                // Global mode: Standard boundary sharing
                const mapYIdx = Math.floor((block.z - 1) / 128);
                targetMapsY.push(mapYIdx);

                if (block.z > 0 && block.z % 128 === 0) {
                    const nextMapY = mapYIdx + 1;
                    if (nextMapY < mapsY) {
                        targetMapsY.push(nextMapY);
                    }
                }
            }

            for (const yIdx of targetMapsY) {
                const key = `${mapXIndex}_${yIdx}`;
                if (yIdx >= mapsY) continue; // Safety

                if (!sectionedBlocks.has(key)) {
                    sectionedBlocks.set(key, []);
                }
                sectionedBlocks.get(key)!.push({ ...block });
            }
        }

        // 3. Process each section (Grounding and NBT)
        for (let sY = 0; sY < mapsY; sY++) {
            for (let sX = 0; sX < mapsX; sX++) {
                const key = `${sX}_${sY}`;
                const blocks = sectionedBlocks.get(key) || [];

                if (blocks.length === 0) continue;

                // Re-ground this specific section ONLY if it's independent
                if (independentMaps) {
                    const minSectionY = Math.min(...blocks.map(b => b.y));
                    for (const b of blocks) {
                        b.y -= minSectionY;
                    }
                }

                for (const b of blocks) {
                    b.x -= sX * 128;
                    // Z is trickier: global Z=0 is map 0 noobline.
                    // Map sY starts its blocks at global Z = sY * 128 + 1.
                    // BUT it includes global Z = sY * 128 as its local Z=0 noobline.
                    b.z -= sY * 128;
                }

                const sectionNbt = createLitematicaNBT(blocks, {
                    ...metadata,
                    name: `${metadata.name || 'MapArt'} (${sX},${sY})`,
                    description: `Section ${sX},${sY} - ${metadata.description || 'MapArt created by MapArtisan'}`
                }, targetVersion);

                const sectionBuffer = serializeNBT(sectionNbt);
                zip.file(`${baseName}_${sX}_${sY}.litematic`, sectionBuffer);
            }
        }

        const zipContent = await zip.generateAsync({ type: 'blob' });
        return { blob: zipContent, filename: `${baseName}_package.zip` };
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
