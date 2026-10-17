/**
 * Canonical Block States
 * Decides the exact block state written for each palette key, so every output
 * (Litematica, vanilla NBT) places the same blocks.
 */

export interface CanonicalBlockState {
    name: string;
    /** Property pairs sorted by name. */
    properties: [string, string][];
}

/**
 * Parses a palette key (`minecraft:id` or `minecraft:id[key=value,...]`) into its
 * canonical state: properties sorted by name, plus the properties a pasted block
 * needs to stay as exported.
 */
export function canonicalBlockState(key: string): CanonicalBlockState {
    const openBracket = key.indexOf('[');
    const name = openBracket === -1 ? key : key.substring(0, openBracket);
    const properties = new Map<string, string>();

    if (openBracket !== -1) {
        const closeBracket = key.indexOf(']', openBracket);
        const propStr = key.substring(openBracket + 1, closeBracket === -1 ? key.length : closeBracket);
        for (const pair of propStr.split(',')) {
            const [k, v] = pair.split('=');
            if (k && v) {
                properties.set(k, v);
            }
        }
    }

    // Map art leaves have no log nearby: without persistent=true they decay once pasted.
    if (name.endsWith('_leaves') && !properties.has('persistent')) {
        properties.set('persistent', 'true');
    }

    return {
        name,
        properties: [...properties].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    };
}

/** Formats a canonical state back to `minecraft:id[key=value,...]`. */
export function formatBlockState(state: CanonicalBlockState): string {
    if (state.properties.length === 0) {
        return state.name;
    }
    return `${state.name}[${state.properties.map(([k, v]) => `${k}=${v}`).join(',')}]`;
}
