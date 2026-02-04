/**
 * Supported Minecraft versions for map art generation.
 * Each version represents the minimum version that introduced new blocks.
 */
export const SUPPORTED_VERSIONS = [
    { value: '1.21.5', label: '1.21.5+' },
    { value: '1.21.4', label: '1.21.4' },
    { value: '1.21.0', label: '1.21.0 - 1.21.3' },
    { value: '1.20.0', label: '1.20.0 - 1.20.6' },
    { value: '1.19.0', label: '1.19.0 - 1.19.4' },
    { value: '1.18.0', label: '1.18.0 - 1.18.2' },
    { value: '1.17.0', label: '1.17.0 - 1.17.1' },
    { value: '1.16.0', label: '1.16.0 - 1.16.5' },
] as const;

export type SupportedVersion = typeof SUPPORTED_VERSIONS[number]['value'];

export const DEFAULT_VERSION: SupportedVersion = '1.21.5';

/**
 * Minecraft Data Version numbers for Litematica/schematic export.
 * These correspond to the internal protocol version for each game version.
 * Reference: https://minecraft.wiki/w/Data_version
 */
export const MINECRAFT_DATA_VERSIONS: Record<SupportedVersion, number> = {
    '1.21.5': 4325,
    '1.21.4': 4189,
    '1.21.0': 3953,
    '1.20.0': 3463,
    '1.19.0': 3105,
    '1.18.0': 2860,
    '1.17.0': 2724,
    '1.16.0': 2556,
};

/**
 * Get the Minecraft data version for a given game version string.
 */
export function getDataVersion(version: string): number {
    return MINECRAFT_DATA_VERSIONS[version as SupportedVersion] ?? MINECRAFT_DATA_VERSIONS[DEFAULT_VERSION];
}
