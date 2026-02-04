import type { PaletteColor } from '../types/palette';

/**
 * Compare two semantic version strings.
 * Returns true if versionA <= versionB
 */
export function isVersionLessOrEqual(versionA: string, versionB: string): boolean {
    const partsA = versionA.split('.').map(Number);
    const partsB = versionB.split('.').map(Number);

    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
        const a = partsA[i] || 0;
        const b = partsB[i] || 0;
        if (a < b) return true;
        if (a > b) return false;
    }
    return true; // Equal
}

/**
 * Check if a block is available in the target Minecraft version.
 * Blocks without introducedIn are treated as 1.0.0 (legacy blocks).
 */
export function isBlockAvailable(blockIntroducedIn: string | undefined, targetVersion: string): boolean {
    const version = blockIntroducedIn || '1.0.0';
    return isVersionLessOrEqual(version, targetVersion);
}

/**
 * Filter a palette color's blocks to only those available in the target version.
 */
export function filterBlocksByVersion<T extends { introducedIn?: string }>(
    blocks: T[],
    targetVersion: string
): T[] {
    return blocks.filter(block => isBlockAvailable(block.introducedIn, targetVersion));
}


/**
 * Filter palette colors to only include blocks available in the target version.
 * Colors with no available blocks are excluded.
 */
export function filterPaletteByVersion(
    colors: PaletteColor[],
    targetVersion: string
): PaletteColor[] {
    return colors
        .map(color => ({
            ...color,
            blocks: filterBlocksByVersion(color.blocks, targetVersion)
        }))
        .filter(color => color.blocks.length > 0);
}

/**
 * Find a replacement block for an unavailable block in the same color group.
 * Returns the first available block in the color, or null if none available.
 */
export function findReplacementBlock(
    color: PaletteColor,
    unavailableBlockId: string,
    targetVersion: string
): string | null {
    const availableBlocks = filterBlocksByVersion(color.blocks, targetVersion);
    if (availableBlocks.length === 0) return null;

    // Don't return the same block
    const replacement = availableBlocks.find(b => b.id !== unavailableBlockId);
    return replacement?.id ?? availableBlocks[0]?.id ?? null;
}

export interface BlockReplacement {
    colorId: number;
    colorName: string;
    original: string;
    replacement: string | null;
    originalVersion: string;
}

/**
 * Check a preset selection and find replacements for unavailable blocks.
 */
export function checkPresetCompatibility(
    selection: Record<number, string | null>,
    colors: PaletteColor[],
    targetVersion: string
): BlockReplacement[] {
    const replacements: BlockReplacement[] = [];

    for (const [colorIdStr, blockId] of Object.entries(selection)) {
        if (!blockId) continue;

        const colorId = Number(colorIdStr);
        const color = colors.find(c => c.colorID === colorId);
        if (!color) continue;

        const block = color.blocks.find(b => b.id === blockId);
        if (!block) continue;

        if (!isBlockAvailable(block.introducedIn, targetVersion)) {
            const replacement = findReplacementBlock(color, blockId, targetVersion);
            replacements.push({
                colorId,
                colorName: color.colorName,
                original: blockId,
                replacement,
                originalVersion: block.introducedIn || '1.0.0'
            });
        }
    }

    return replacements;
}

/**
 * Apply replacements to a selection, returning the updated selection.
 */
export function applyReplacements(
    selection: Record<number, string | null>,
    replacements: BlockReplacement[]
): Record<number, string | null> {
    const newSelection = { ...selection };

    for (const r of replacements) {
        newSelection[r.colorId] = r.replacement;
    }

    return newSelection;
}
