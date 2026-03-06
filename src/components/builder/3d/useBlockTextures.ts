/**
 * useBlockTextures.ts
 *
 * React hook that lazily loads and caches Minecraft block textures from
 * /textures/{blockName}.png. Uses THREE.TextureLoader with NearestFilter
 * to preserve the pixel-art look. Missing textures return null (caller
 * falls back to solid color).
 */

import { useEffect, useRef, useState } from 'react';
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
    // Stable ref for the accumulated texture record; only triggers re-render via state
    const texturesRef = useRef<Record<string, THREE.Texture | null>>({});
    const [, forceUpdate] = useState(0);

    useEffect(() => {
        if (blockIds.length === 0) return;

        let cancelled = false;

        const loadOne = async (blockId: string) => {
            // Already in cache — use immediately
            if (globalCache.has(blockId)) {
                texturesRef.current[blockId] = globalCache.get(blockId)!;
                return;
            }

            const path = blockIdToTexturePath(blockId);
            try {
                const tex = await loader.loadAsync(path);
                // Pixelated, no mip-map blur — matches Minecraft's look
                tex.magFilter = THREE.NearestFilter;
                tex.minFilter = THREE.NearestFilter;
                tex.generateMipmaps = false;
                tex.colorSpace = THREE.SRGBColorSpace;
                globalCache.set(blockId, tex);
                if (!cancelled) {
                    texturesRef.current = { ...texturesRef.current, [blockId]: tex };
                    forceUpdate(n => n + 1);
                }
            } catch {
                // Texture not found — record null so caller uses solid color fallback
                globalCache.set(blockId, null);
                if (!cancelled) {
                    texturesRef.current = { ...texturesRef.current, [blockId]: null };
                    forceUpdate(n => n + 1);
                }
            }
        };

        // Kick off all loads in parallel; already-cached entries resolve synchronously
        const alreadyCached = blockIds.filter(id => globalCache.has(id));
        const toLoad = blockIds.filter(id => !globalCache.has(id));

        // Apply cached entries immediately without triggering a re-render yet
        if (alreadyCached.length > 0) {
            for (const id of alreadyCached) {
                texturesRef.current[id] = globalCache.get(id)!;
            }
            // Still need a re-render if the ref didn't have these before
            forceUpdate(n => n + 1);
        }

        for (const id of toLoad) {
            loadOne(id);
        }

        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [blockIds.join(',')]);

    return texturesRef.current;
}
