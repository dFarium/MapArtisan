/**
 * File Export
 * Generate and download Litematica files
 */

import JSZip from 'jszip';
import type { BuildMode, BrightnessLevel, ExportFormat } from '../../types/mapart';
import type { DitheringMode } from '../mapartProcessing';
import { serializeNBT } from '../nbtWriter';
import { DEFAULT_VERSION } from '../../data/supportedVersions';
import type { LitematicaMetadata, BlockStatesBuffers } from './types';
import { imageDataToBlockStates } from './blockGeneration';
import { createLitematicaNBT, createVanillaNBT } from './nbtBuilder';

/**
 * Generates the binary Litematica export data (Blob).
 * 
 * If the layout is larger than a single 128x128 map grid and sections mode is enabled:
 * 1. The image is processed as a unified layout.
 * 2. Generated block coordinates are grouped by their corresponding 128x128 map sections.
 * 3. In Global mode, boundaries are shared (the block at z = m*128 is placed in both map m and map m+1).
 *    In Independent mode, z = m*128 is the explicit start/noobline for map m.
 * 4. Each section's blocks are shifted to local coordinates (0..127) and compiled into standalone NBT structures.
 * 5. All section files are compressed into a single ZIP archive.
 * 
 * @param imageData Raw input pixel data.
 * @param selectedPaletteItems Selected color indices mapped to block namespaces.
 * @param buildMode Structural target layout (2D flat vs 3D valley steps).
 * @param filename Default filename prefix.
 * @param metadata Title, author, and description fields.
 * @param threeDPrecision Height optimizations slider limits.
 * @param dithering Pixel error diffusion/threshold matrix strategy.
 * @param useCielab Flag to compare colors in CIELAB space rather than RGB.
 * @param hybridStrength Weighting multiplier for hybrid/adaptive dithering.
 * @param independentMaps Separate centering grids for independent map pieces.
 * @param manualEdits Map of indices to manual painted color overrides.
 * @param blockSupport Support block strategy (all, needed, gravity).
 * @param supportBlockId Namespace-key of the block used for scaffolding.
 * @param exportMode Export format splitting (export as whole map or split region sections).
 * @param targetVersion Target Minecraft version to compile data version.
 * @param precomputedPackedResults Optional pre-computed packed index buffer.
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
    targetVersion: string = DEFAULT_VERSION,
    precomputedPackedResults?: Uint32Array,
    exportFormat: ExportFormat = 'litematic'
): Promise<{ blob: Blob; filename: string }> {
    const { width, height } = imageData;
    const isMultiMap = (width > 128 || height > 128) && exportMode === 'sections';
    const isNbt = exportFormat === 'nbt';
    const targetExtension = isNbt ? '.nbt' : '.litematic';
    const baseName = filename.replace(/\.(litematic|nbt)$/i, '');
    const actualFilename = isMultiMap ? `${baseName}_package.zip` : `${baseName}${targetExtension}`;

    if (!isMultiMap) {
        // Single Map Case
        const blockStatesOpt = imageDataToBlockStates(
            imageData, selectedPaletteItems, buildMode, true,
            threeDPrecision, dithering, useCielab, hybridStrength, independentMaps, manualEdits, blockSupport, supportBlockId,
            exportMode, precomputedPackedResults
        );

        const nbtOpt = isNbt
            ? createVanillaNBT(blockStatesOpt, metadata, targetVersion)
            : createLitematicaNBT(blockStatesOpt, {
                ...metadata,
                name: metadata.name || 'MapArt',
                description: metadata.description || 'MapArt created by MapArtisan'
            }, targetVersion);
        const nbtDataOpt = serializeNBT(nbtOpt);
        const blob = new Blob([nbtDataOpt as BlobPart], { type: 'application/octet-stream' });

        return { blob, filename: actualFilename };

    } else {
        // Multi Map Case - Global Processing then Split
        // 1. Generate ALL blocks globally or per section depending on independentMaps
        const allBlocks = imageDataToBlockStates(
            imageData, selectedPaletteItems, buildMode, true,
            threeDPrecision, dithering, useCielab, hybridStrength, independentMaps, manualEdits, blockSupport, supportBlockId,
            exportMode, precomputedPackedResults
        );

        const zip = new JSZip();
        const mapsX = Math.ceil(width / 128);
        const mapsY = Math.ceil(height / 128);

        // 2. Group blocks by section (with boundary sharing)
        interface SectionBuffers {
            x: number[];
            y: number[];
            z: number[];
            paletteIndices: number[];
        }

        const sectionedBlocks = new Map<string, SectionBuffers>();

        for (let i = 0; i < allBlocks.count; i++) {
            const bx = allBlocks.x[i];
            const by = allBlocks.y[i];
            const bz = allBlocks.z[i];
            const bPaletteIdx = allBlocks.paletteIndices[i];

            const mapXIndex = Math.floor(bx / 128);
            const targetMapsY: number[] = [];

            if (bz === 0) {
                targetMapsY.push(0);
            } else if (independentMaps) {
                // In Independent mode, blocks at z = m*128 are explicit nooblines for map m
                if (bz % 128 === 0) {
                    const m = bz / 128;
                    if (m < mapsY) {
                        targetMapsY.push(m);
                    } else {
                        // This might be the last row of the entire map art
                        targetMapsY.push(m - 1);
                    }
                } else {
                    const mapYIdx = Math.floor((bz - 1) / 128);
                    targetMapsY.push(mapYIdx);
                }
            } else {
                // Global mode: Standard boundary sharing
                const mapYIdx = Math.floor((bz - 1) / 128);
                targetMapsY.push(mapYIdx);

                if (bz > 0 && bz % 128 === 0) {
                    const nextMapY = mapYIdx + 1;
                    if (nextMapY < mapsY) {
                        targetMapsY.push(nextMapY);
                    }
                }
            }

            for (const yIdx of targetMapsY) {
                const key = `${mapXIndex}_${yIdx}`;
                if (yIdx >= mapsY) continue; // Safety

                let section = sectionedBlocks.get(key);
                if (!section) {
                    section = { x: [], y: [], z: [], paletteIndices: [] };
                    sectionedBlocks.set(key, section);
                }
                section.x.push(bx);
                section.y.push(by);
                section.z.push(bz);
                section.paletteIndices.push(bPaletteIdx);
            }
        }

        // 3. Process each section (Grounding and NBT)
        for (let sY = 0; sY < mapsY; sY++) {
            for (let sX = 0; sX < mapsX; sX++) {
                const key = `${sX}_${sY}`;
                const section = sectionedBlocks.get(key);

                if (!section || section.x.length === 0) continue;

                // Re-ground this specific section ONLY if it's independent
                if (independentMaps) {
                    let minSectionY = section.y[0];
                    for (let i = 1; i < section.y.length; i++) {
                        if (section.y[i] < minSectionY) {
                            minSectionY = section.y[i];
                        }
                    }
                    for (let i = 0; i < section.y.length; i++) {
                        section.y[i] -= minSectionY;
                    }
                }

                for (let i = 0; i < section.x.length; i++) {
                    section.x[i] -= sX * 128;
                    // Z is trickier: global Z=0 is map 0 noobline.
                    // Map sY starts its blocks at global Z = sY * 128 + 1.
                    // BUT it includes global Z = sY * 128 as its local Z=0 noobline.
                    section.z[i] -= sY * 128;
                }

                const blocksBuffer: BlockStatesBuffers = {
                    x: new Int32Array(section.x),
                    y: new Int32Array(section.y),
                    z: new Int32Array(section.z),
                    palette: allBlocks.palette,
                    paletteIndices: new Uint32Array(section.paletteIndices),
                    count: section.x.length
                };

                const sectionNbt = isNbt
                    ? createVanillaNBT(blocksBuffer, metadata, targetVersion)
                    : createLitematicaNBT(blocksBuffer, {
                        ...metadata,
                        name: `${metadata.name || 'MapArt'} (${sX},${sY})`,
                        description: `Section ${sX},${sY} - ${metadata.description || 'MapArt created by MapArtisan'}`
                    }, targetVersion);

                const sectionBuffer = serializeNBT(sectionNbt);
                zip.file(`${baseName}_${sX}_${sY}${targetExtension}`, sectionBuffer);
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
