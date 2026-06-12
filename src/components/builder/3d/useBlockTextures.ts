/**
 * useBlockTextures.ts
 *
 * React hook that lazily loads and caches Minecraft block textures from
 * /textures/{blockName}.png. Uses THREE.TextureLoader with NearestFilter
 * to preserve the pixel-art look. Missing textures return null (caller
 * falls back to solid color).
 */

import { useEffect, useState } from 'react';
import * as THREE from 'three';

// Shared loader and cache so we don't reload the same texture twice across renders
const loader = new THREE.TextureLoader();
const globalCache = new Map<string, THREE.Texture | null>();

/** Convert a full block ID like 'minecraft:grass_block' to its PNG path */
export function blockIdToTexturePath(blockId: string): string {
    const name = blockId.replace(/^minecraft:/, '');
    return `/textures/${name}.png`;
}

/**
 * Loads textures for a list of block IDs.
 * Returns a stable Record<blockId, Texture | null> — null means the texture
 * failed to load (file not found) — callers should fall back to solid color.
 *
 * The record is updated incrementally as each texture resolves, triggering
 * a re-render only when new textures finish loading.
 */
export function useBlockTextures(blockIds: string[]): Record<string, THREE.Texture | null> {
    const [prevIds, setPrevIds] = useState<string[]>(blockIds);
    const [textures, setTextures] = useState<Record<string, THREE.Texture | null>>(() => {
        const initial: Record<string, THREE.Texture | null> = {};
        for (const id of blockIds) {
            if (globalCache.has(id)) {
                initial[id] = globalCache.get(id)!;
            }
        }
        return initial;
    });

    const joinedIds = blockIds.join(',');
    const prevJoinedIds = prevIds.join(',');

    if (joinedIds !== prevJoinedIds) {
        setPrevIds(blockIds);
        const next: Record<string, THREE.Texture | null> = {};
        for (const id of blockIds) {
            if (globalCache.has(id)) {
                next[id] = globalCache.get(id)!;
            } else if (textures[id] !== undefined) {
                next[id] = textures[id];
            }
        }
        setTextures(next);
    }

    useEffect(() => {
        if (blockIds.length === 0) return;

        let cancelled = false;

        const loadOne = async (blockId: string) => {
            const path = blockIdToTexturePath(blockId);
            try {
                const tex = await loader.loadAsync(path);
                tex.magFilter = THREE.NearestFilter;
                tex.minFilter = THREE.NearestFilter;
                tex.generateMipmaps = false;
                tex.colorSpace = THREE.SRGBColorSpace;
                globalCache.set(blockId, tex);
                if (!cancelled) {
                    setTextures(prev => ({ ...prev, [blockId]: tex }));
                }
            } catch {
                globalCache.set(blockId, null);
                if (!cancelled) {
                    setTextures(prev => ({ ...prev, [blockId]: null }));
                }
            }
        };

        const toLoad = blockIds.filter(id => !globalCache.has(id));
        for (const id of toLoad) {
            loadOne(id);
        }

        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [joinedIds]);

    return textures;
}
