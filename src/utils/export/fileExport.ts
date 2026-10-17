/**
 * File Export
 * Generate and download Litematica files
 */

import JSZip from 'jszip';
import type { BuildMode, BrightnessLevel, ExportFormat } from '../../types/mapart';
import { NO_HEIGHT_LIMIT, type DitheringMode, type HeightLimit } from '../processing';
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
 * @param heightLimit Maximum 3D build height and reset style used when re-quantizing.
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
    heightLimit: HeightLimit = NO_HEIGHT_LIMIT,
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
    const isNbt = exportFormat === 'nbt';
    const targetExtension = isNbt ? '.nbt' : '.litematic';
    const baseName = filename.replace(/\.(litematic|nbt)$/i, '');

    const { multiFile, sections } = generateConstructionSections(
        imageData, selectedPaletteItems, buildMode,
        heightLimit, dithering, usePerceptual, hybridStrength, independentMaps, manualEdits, blockSupport, supportBlockId,
        exportMode, precomputedPackedResults
    );

    if (!multiFile) {
        // Single Map Case
        const blockStatesOpt = sections[0].blocks;

        const nbtOpt = isNbt
            ? createVanillaNBT(blockStatesOpt, metadata, targetVersion)
            : createLitematicaNBT(blockStatesOpt, {
                ...metadata,
                name: metadata.name || 'MapArt',
                description: metadata.description || 'MapArt created by MapArtisan'
            }, targetVersion);
        const nbtDataOpt = serializeNBT(nbtOpt);
        const blob = new Blob([nbtDataOpt as BlobPart], { type: 'application/octet-stream' });

        return { blob, filename: `${baseName}${targetExtension}` };

    } else {
        // Multi Map Case - one file per 128x128 section
        const zip = new JSZip();
        for (const { sX, sY, blocks } of sections) {
            const sectionPreview = metadata.sectionPreviews?.[`${sX}_${sY}`];
            const sectionNbt = isNbt
                ? createVanillaNBT(blocks, metadata, targetVersion)
                : createLitematicaNBT(blocks, {
                    ...metadata,
                    name: `${metadata.name || 'MapArt'} (${sX},${sY})`,
                    description: `Section ${sX},${sY} - ${metadata.description || 'MapArt created by MapArtisan'}`,
                    previewImageBase64: sectionPreview,
                }, targetVersion);

            zip.file(`${baseName}_${sX}_${sY}${targetExtension}`, serializeNBT(sectionNbt));
        }

        const zipContent = await zip.generateAsync({ type: 'blob' });
        return { blob: zipContent, filename: `${baseName}_package.zip` };
    }
}

/** One map-sized piece of a multi-map export, in local block coordinates. */
export interface ExportSection {
    sX: number;
    sY: number;
    blocks: BlockStatesBuffers;
}

/** The blocks of every exported file, in the layout generateMapartExport writes them. */
export interface ConstructionSections {
    /** True when each 128x128 section is written to its own file. */
    multiFile: boolean;
    /** One entry per file; a single-file export has one entry at (0, 0). */
    sections: ExportSection[];
}

/**
 * Generates the construction blocks for an export, grouped by output file.
 *
 * This is the single source of the exported structure: generateMapartExport serializes
 * these sections, and anything that must match an exported file (such as a live
 * preview snapshot) reads them from here.
 */
export function generateConstructionSections(
    imageData: ImageData,
    selectedPaletteItems: Record<number, string | null>,
    buildMode: BuildMode,
    heightLimit: HeightLimit = NO_HEIGHT_LIMIT,
    dithering: DitheringMode = 'none',
    usePerceptual: boolean = true,
    hybridStrength: number = 50,
    independentMaps: boolean = false,
    manualEdits?: Record<number, { blockId: string; brightness: BrightnessLevel; rgb: { r: number; g: number; b: number } }>,
    blockSupport: 'all' | 'needed' | 'gravity' = 'all',
    supportBlockId: string = 'minecraft:cobblestone',
    exportMode: 'full' | 'sections' = 'sections',
    precomputedPackedResults?: Uint32Array
): ConstructionSections {
    const { width, height } = imageData;
    const multiFile = (width > 128 || height > 128) && exportMode === 'sections';

    const allBlocks = imageDataToBlockStates(
        imageData, selectedPaletteItems, buildMode, true,
        heightLimit, dithering, usePerceptual, hybridStrength, independentMaps, manualEdits, blockSupport, supportBlockId,
        exportMode, precomputedPackedResults
    );

    return multiFile
        ? { multiFile, sections: splitBlocksIntoSections(allBlocks, width, height, independentMaps) }
        : { multiFile, sections: [{ sX: 0, sY: 0, blocks: allBlocks }] };
}

/**
 * Splits globally generated blocks into 128x128 map sections.
 *
 * Each section holds its noobline at local z = 0 and its pixel rows at
 * local z = 1..128. Global maps share the boundary row: the row at
 * z = m*128 is the last row of map m-1 and also the noobline of map m, so it
 * is copied into both. Independent maps cannot be split by z, because map
 * m-1's last row and map m's own noobline both sit at z = m*128; the block
 * generator tags every block with its owning map row in `sectionRows`.
 */
export function splitBlocksIntoSections(
    allBlocks: BlockStatesBuffers,
    width: number,
    height: number,
    independentMaps: boolean
): ExportSection[] {
    const mapsX = Math.ceil(width / 128);
    const mapsY = Math.ceil(height / 128);
    const owners = allBlocks.sectionRows;

    const forEachTarget = (i: number, emit: (sectionIndex: number) => void) => {
        const mapX = Math.floor(allBlocks.x[i] / 128);
        if (mapX < 0 || mapX >= mapsX) return;
        const emitRow = (row: number) => {
            if (row >= 0 && row < mapsY) emit(mapX + row * mapsX);
        };

        if (owners) {
            emitRow(owners[i]);
            return;
        }

        const z = allBlocks.z[i];
        if (z === 0) {
            emitRow(0);
            return;
        }
        const row = Math.floor((z - 1) / 128);
        emitRow(row);
        if (z % 128 === 0) emitRow(row + 1);
    };

    // Pass 1: exact allocation per section.
    const counts = new Int32Array(mapsX * mapsY);
    for (let i = 0; i < allBlocks.count; i++) {
        forEachTarget(i, index => { counts[index]++; });
    }

    const buffers = Array.from(counts, count => count === 0 ? null : {
        x: new Int32Array(count),
        y: new Int32Array(count),
        z: new Int32Array(count),
        paletteIndices: new Uint32Array(count),
        writePtr: 0,
    });

    // Pass 2: copy blocks into their sections.
    for (let i = 0; i < allBlocks.count; i++) {
        forEachTarget(i, index => {
            const section = buffers[index]!;
            const ptr = section.writePtr++;
            section.x[ptr] = allBlocks.x[i];
            section.y[ptr] = allBlocks.y[i];
            section.z[ptr] = allBlocks.z[i];
            section.paletteIndices[ptr] = allBlocks.paletteIndices[i];
        });
    }

    const sections: ExportSection[] = [];
    for (let sY = 0; sY < mapsY; sY++) {
        for (let sX = 0; sX < mapsX; sX++) {
            const section = buffers[sX + sY * mapsX];
            if (!section) continue;
            const count = section.writePtr;

            // Independent maps are built separately, so each one is grounded on its own.
            if (independentMaps) {
                let minY = section.y[0];
                for (let i = 1; i < count; i++) {
                    if (section.y[i] < minY) minY = section.y[i];
                }
                for (let i = 0; i < count; i++) section.y[i] -= minY;
            }

            for (let i = 0; i < count; i++) {
                section.x[i] -= sX * 128;
                section.z[i] -= sY * 128;
            }

            sections.push({
                sX,
                sY,
                blocks: {
                    x: section.x,
                    y: section.y,
                    z: section.z,
                    palette: allBlocks.palette,
                    paletteIndices: section.paletteIndices,
                    count,
                },
            });
        }
    }
    return sections;
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
