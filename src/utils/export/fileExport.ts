/**
 * File Export
 * Generate and download Litematica files
 */

import JSZip from 'jszip';
import type { BuildMode, BrightnessLevel, ExportFormat } from '../../types/mapart';
import type { DitheringMode } from '../processing';
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
 * @param usePerceptual Flag to compare colors in OKLab perceptual space rather than RGB.
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
    usePerceptual: boolean = true,
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
            threeDPrecision, dithering, usePerceptual, hybridStrength, independentMaps, manualEdits, blockSupport, supportBlockId,
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
            threeDPrecision, dithering, usePerceptual, hybridStrength, independentMaps, manualEdits, blockSupport, supportBlockId,
            exportMode, precomputedPackedResults
        );

        const zip = new JSZip();
        const mapsX = Math.ceil(width / 128);
        const mapsY = Math.ceil(height / 128);

        // 2. Group blocks by section (with boundary sharing)
        interface SectionBuffers {
            x: Int32Array;
            y: Int32Array;
            z: Int32Array;
            paletteIndices: Uint32Array;
            writePtr: number;
        }

        // Pass 1: Count block allocations per section
        const sectionCounts = new Int32Array(mapsX * mapsY);
        for (let i = 0; i < allBlocks.count; i++) {
            const bx = allBlocks.x[i];
            const bz = allBlocks.z[i];

            const mapXIndex = Math.floor(bx / 128);
            if (mapXIndex < 0 || mapXIndex >= mapsX) continue;

            if (bz === 0) {
                sectionCounts[mapXIndex]++;
            } else if (independentMaps) {
                if (bz % 128 === 0) {
                    const m = bz / 128;
                    const yIdx = m < mapsY ? m : m - 1;
                    if (yIdx >= 0 && yIdx < mapsY) {
                        sectionCounts[mapXIndex + yIdx * mapsX]++;
                    }
                } else {
                    const yIdx = Math.floor((bz - 1) / 128);
                    if (yIdx >= 0 && yIdx < mapsY) {
                        sectionCounts[mapXIndex + yIdx * mapsX]++;
                    }
                }
            } else {
                const yIdx = Math.floor((bz - 1) / 128);
                if (yIdx >= 0 && yIdx < mapsY) {
                    sectionCounts[mapXIndex + yIdx * mapsX]++;
                }

                if (bz > 0 && bz % 128 === 0) {
                    const nextMapY = yIdx + 1;
                    if (nextMapY >= 0 && nextMapY < mapsY) {
                        sectionCounts[mapXIndex + nextMapY * mapsX]++;
                    }
                }
            }
        }

        // Allocate exact TypedArrays per active section
        const sections = new Array<SectionBuffers | null>(mapsX * mapsY).fill(null);
        for (let y = 0; y < mapsY; y++) {
            for (let x = 0; x < mapsX; x++) {
                const idx = x + y * mapsX;
                const count = sectionCounts[idx];
                if (count > 0) {
                    sections[idx] = {
                        x: new Int32Array(count),
                        y: new Int32Array(count),
                        z: new Int32Array(count),
                        paletteIndices: new Uint32Array(count),
                        writePtr: 0
                    };
                }
            }
        }

        // Pass 2: Populate the preallocated TypedArrays
        for (let i = 0; i < allBlocks.count; i++) {
            const bx = allBlocks.x[i];
            const by = allBlocks.y[i];
            const bz = allBlocks.z[i];
            const bPaletteIdx = allBlocks.paletteIndices[i];

            const mapXIndex = Math.floor(bx / 128);
            if (mapXIndex < 0 || mapXIndex >= mapsX) continue;

            const appendToSection = (yIdx: number) => {
                if (yIdx < 0 || yIdx >= mapsY) return;
                const idx = mapXIndex + yIdx * mapsX;
                const sec = sections[idx];
                if (sec) {
                    const ptr = sec.writePtr;
                    sec.x[ptr] = bx;
                    sec.y[ptr] = by;
                    sec.z[ptr] = bz;
                    sec.paletteIndices[ptr] = bPaletteIdx;
                    sec.writePtr = ptr + 1;
                }
            };

            if (bz === 0) {
                appendToSection(0);
            } else if (independentMaps) {
                if (bz % 128 === 0) {
                    const m = bz / 128;
                    if (m < mapsY) {
                        appendToSection(m);
                    } else {
                        appendToSection(m - 1);
                    }
                } else {
                    const mapYIdx = Math.floor((bz - 1) / 128);
                    appendToSection(mapYIdx);
                }
            } else {
                const mapYIdx = Math.floor((bz - 1) / 128);
                appendToSection(mapYIdx);

                if (bz > 0 && bz % 128 === 0) {
                    const nextMapY = mapYIdx + 1;
                    if (nextMapY < mapsY) {
                        appendToSection(nextMapY);
                    }
                }
            }
        }

        // 3. Process each section (Grounding and NBT)
        for (let sY = 0; sY < mapsY; sY++) {
            for (let sX = 0; sX < mapsX; sX++) {
                const idx = sX + sY * mapsX;
                const section = sections[idx];

                if (!section || section.writePtr === 0) continue;

                // Re-ground this specific section ONLY if it's independent
                if (independentMaps) {
                    let minSectionY = section.y[0];
                    for (let i = 1; i < section.writePtr; i++) {
                        if (section.y[i] < minSectionY) {
                            minSectionY = section.y[i];
                        }
                    }
                    for (let i = 0; i < section.writePtr; i++) {
                        section.y[i] -= minSectionY;
                    }
                }

                for (let i = 0; i < section.writePtr; i++) {
                    section.x[i] -= sX * 128;
                    // Z is trickier: global Z=0 is map 0 noobline.
                    // Map sY starts its blocks at global Z = sY * 128 + 1.
                    // BUT it includes global Z = sY * 128 as its local Z=0 noobline.
                    section.z[i] -= sY * 128;
                }

                const blocksBuffer: BlockStatesBuffers = {
                    x: section.x,
                    y: section.y,
                    z: section.z,
                    palette: allBlocks.palette,
                    paletteIndices: section.paletteIndices,
                    count: section.writePtr
                };

                const sectionKey = `${sX}_${sY}`;
                const sectionPreview = metadata.sectionPreviews?.[sectionKey];

                const sectionNbt = isNbt
                    ? createVanillaNBT(blocksBuffer, metadata, targetVersion)
                    : createLitematicaNBT(blocksBuffer, {
                        ...metadata,
                        name: `${metadata.name || 'MapArt'} (${sX},${sY})`,
                        description: `Section ${sX},${sY} - ${metadata.description || 'MapArt created by MapArtisan'}`,
                        previewImageBase64: sectionPreview,
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
