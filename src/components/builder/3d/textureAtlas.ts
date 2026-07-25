import * as THREE from 'three';

const MAX_TEXTURE_CACHE = 256;
const imageCache = new Map<string, HTMLImageElement | null>();

function cacheSet(blockId: string, image: HTMLImageElement | null): void {
    if (imageCache.has(blockId)) {
        imageCache.delete(blockId);
    } else if (imageCache.size >= MAX_TEXTURE_CACHE) {
        const oldestKey = imageCache.keys().next().value;
        if (oldestKey !== undefined) imageCache.delete(oldestKey);
    }
    imageCache.set(blockId, image);
}

/** Clears the entire texture cache and releases all image references. */
export function clearTextureCache(): void {
    imageCache.clear();
}

/** Loads block textures into a WebGL2 texture array and returns a cancellation handle. */
export function loadTextureAtlas(
    blockIds: string[],
    onReady: (atlas: THREE.DataArrayTexture, idxMap: Int16Array) => void
): () => void {
    if (blockIds.length === 0) return () => undefined;

    const size = 16;
    let cancelled = false;
    const idxMap = new Int16Array(blockIds.length).fill(-1);
    let pending = blockIds.length;

    const tryBuild = () => {
        if (pending > 0) return;

        const data = new Uint8Array(blockIds.length * size * size * 4);
        for (let layer = 0; layer < blockIds.length; layer++) {
            const image = imageCache.get(blockIds[layer]);
            if (!image) continue;

            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const context = canvas.getContext('2d')!;
            context.drawImage(image, 0, 0, size, size);
            const pixels = context.getImageData(0, 0, size, size).data;
            data.set(pixels, layer * size * size * 4);
            idxMap[layer] = layer;
        }

        const atlas = new THREE.DataArrayTexture(data, size, size, blockIds.length);
        atlas.format = THREE.RGBAFormat;
        atlas.type = THREE.UnsignedByteType;
        atlas.magFilter = THREE.NearestFilter;
        atlas.minFilter = THREE.NearestFilter;
        atlas.generateMipmaps = false;
        atlas.colorSpace = THREE.SRGBColorSpace;
        atlas.needsUpdate = true;

        if (cancelled) atlas.dispose();
        else onReady(atlas, idxMap);
    };

    for (const blockId of blockIds) {
        if (imageCache.has(blockId)) {
            cacheSet(blockId, imageCache.get(blockId)!);
            pending--;
            tryBuild();
            continue;
        }

        const name = blockId.replace(/^minecraft:/, '');
        const image = new Image();
        image.onload = () => {
            cacheSet(blockId, image);
            pending--;
            tryBuild();
        };
        image.onerror = () => {
            cacheSet(blockId, null);
            pending--;
            tryBuild();
        };
        image.src = `/textures/${name}.png`;
    }

    return () => {
        cancelled = true;
    };
}
