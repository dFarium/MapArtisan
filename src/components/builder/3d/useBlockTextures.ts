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
const pendingLoads = new Map<string, Promise<THREE.Texture | null>>();

function loadTexture(blockId: string): Promise<THREE.Texture | null> {
    const pending = pendingLoads.get(blockId);
    if (pending) return pending;

    const request = loader.loadAsync(blockIdToTexturePath(blockId))
        .then(texture => {
            texture.magFilter = THREE.NearestFilter;
            texture.minFilter = THREE.NearestFilter;
            texture.generateMipmaps = false;
            texture.colorSpace = THREE.SRGBColorSpace;
            globalCache.set(blockId, texture);
            return texture;
        })
        .catch(() => {
            globalCache.set(blockId, null);
            return null;
        })
        .finally(() => {
            pendingLoads.delete(blockId);
        });

    pendingLoads.set(blockId, request);
    return request;
}

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
    const [, setRevision] = useState(0);

    const joinedIds = blockIds.join(',');

    useEffect(() => {
        const requestedIds = joinedIds ? joinedIds.split(',') : [];
        if (requestedIds.length === 0) return;

        let cancelled = false;

        const toLoad = requestedIds.filter(id => !globalCache.has(id));
        for (const id of toLoad) {
            void loadTexture(id).then(() => {
                if (!cancelled) setRevision(revision => revision + 1);
            });
        }

        return () => { cancelled = true; };
    }, [joinedIds]);

    const textures: Record<string, THREE.Texture | null> = {};
    for (const id of blockIds) {
        if (globalCache.has(id)) textures[id] = globalCache.get(id)!;
    }
    return textures;
}
