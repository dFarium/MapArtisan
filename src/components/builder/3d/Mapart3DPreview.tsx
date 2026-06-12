import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Grid } from '@react-three/drei';
import { useMemo, useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { Move, ZoomIn, Rotate3D, type LucideIcon } from 'lucide-react';
import type { Build3DGeometryProps } from './build3DGeometry';
import paletteData from '../../../data/palette.json';
import { type PaletteData, type PreviewSection } from '../../../types/mapart';
import { getValidColors } from '../../../utils/mapartProcessing';
import { useMapartStore } from '../../../store/useMapartStore';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Snapshot of InstanceGeometry returned by the worker.
 * All typed arrays arrive as Transferable buffers (zero-copy from the worker).
 */
interface WorkerGeometry {
    positions: Float32Array;
    colors: Float32Array;
    textureIds: Int16Array;
    uniqueTextureIds: string[];
    count: number;
}

interface Mapart3DPreviewProps {
    imageData: ImageData | null;
    packedResults?: Uint32Array | null;
    /** Precomputed column-major height path from processMapart, passed straight to the worker */
    heightPath?: Int32Array | null;
    stats?: { minHeight: number; maxHeight: number };
    blockSupport: 'all' | 'needed' | 'gravity';
    supportBlockId?: string;
    exportMode?: 'full' | 'sections';
    independentMaps?: boolean;
    previewSection?: PreviewSection;
    /** Async function that delegates geometry calculation to the web worker */
    build3DGeometryAsync: (props: Build3DGeometryProps) => Promise<WorkerGeometry | null>;
}

interface HintItemProps {
    icon: LucideIcon;
    label: string;
    bind: string;
}

// ── Small UI components ───────────────────────────────────────────────────────

const HintItem = ({ icon: Icon, label, bind }: HintItemProps) => (
    <div className="flex items-center gap-1.5">
        <Icon size={14} className="text-zinc-400" />
        <span className="text-zinc-300">{label}:</span>
        <span className="text-white font-semibold">{bind}</span>
    </div>
);

const applyGridOffset = (factor: number) => (node: THREE.Mesh) => {
    if (node?.material) {
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        materials.forEach((m: any) => {
            m.polygonOffset = true;
            m.polygonOffsetFactor = factor;
            m.polygonOffsetUnits = factor;
            m.needsUpdate = true;
        });
    }
};

// ── Root component ────────────────────────────────────────────────────────────

export const Mapart3DPreview = ({
    imageData,
    packedResults,
    heightPath,
    blockSupport,
    supportBlockId,
    exportMode,
    independentMaps,
    previewSection,
    build3DGeometryAsync,
}: Mapart3DPreviewProps) => {
    if (!imageData) return null;

    return (
        <div className="w-full h-full bg-zinc-900 relative">
            <Canvas
                shadows
                dpr={[1, 1.5]}
                gl={{
                    toneMapping: THREE.NoToneMapping,
                    antialias: true,
                    alpha: false,
                    powerPreference: "high-performance",
                    stencil: false,
                    depth: true
                }}
            >
                <PerspectiveCamera makeDefault position={[0, 100, 100]} fov={50} near={0.1} />
                <ambientLight intensity={2.5} />
                <directionalLight position={[10, 20, 10]} intensity={0.25} castShadow />

                <MapartMesh
                    imageData={imageData}
                    packedResults={packedResults}
                    heightPath={heightPath}
                    blockSupport={blockSupport}
                    supportBlockId={supportBlockId}
                    exportMode={exportMode}
                    independentMaps={independentMaps}
                    previewSection={previewSection}
                    build3DGeometryAsync={build3DGeometryAsync}
                />

                <OrbitControls minDistance={10} maxDistance={500} />
                {/* 1x1 Minimal Grid - Only visible when close */}
                <Grid
                    ref={applyGridOffset(1)}
                    position={[0, -0.01, 0]}
                    args={[10, 10]}
                    cellSize={1}
                    sectionSize={0}
                    cellThickness={1}
                    cellColor="#444444"
                    fadeDistance={100}
                    fadeStrength={5}
                    renderOrder={1}
                    infiniteGrid
                />
                {/* 16x16 Chunk Grid - Always visible from afar */}
                <Grid
                    ref={applyGridOffset(2)}
                    position={[0, -0.05, 0]}
                    args={[10, 10]}
                    cellSize={0}
                    sectionSize={16}
                    sectionThickness={1.5}
                    sectionColor="#444444"
                    fadeDistance={1200}
                    fadeStrength={5}
                    renderOrder={0}
                    infiniteGrid
                />
            </Canvas>

            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/80 text-xs px-3 py-2 rounded-full backdrop-blur-md pointer-events-none select-none z-30 font-sans tracking-wide transition-all duration-300 border border-white/10 shadow-xl">
                <div className="flex items-center gap-4">
                    <HintItem icon={Rotate3D} label="Rotate" bind="LMB" />
                    <div className="w-px h-3 bg-white/20" />
                    <HintItem icon={Move} label="Pan" bind="RMB" />
                    <div className="w-px h-3 bg-white/20" />
                    <HintItem icon={ZoomIn} label="Zoom" bind="Wheel" />
                </div>
            </div>
        </div>
    );
};

// ── Texture atlas loader ───────────────────────────────────────────────────────
// Loads all block textures into a single DataArrayTexture (WebGL2 texture array).
// One load per unique blockId, cached globally. Returns the atlas + index map.
const imageCache = new Map<string, HTMLImageElement | null>();

function loadTextureAtlas(
    blockIds: string[],
    onReady: (atlas: THREE.DataArrayTexture, idxMap: Int16Array) => void
): void {
    if (blockIds.length === 0) return;

    const SIZE = 16;
    const idxMap = new Int16Array(blockIds.length).fill(-1);
    let pending = 0;

    const tryBuild = () => {
        if (pending > 0) return;

        // Build atlas from loaded images
        const data = new Uint8Array(blockIds.length * SIZE * SIZE * 4);
        for (let layer = 0; layer < blockIds.length; layer++) {
            const img = imageCache.get(blockIds[layer]);
            if (img) {
                // Draw to offscreen canvas to get pixel data
                const canvas = document.createElement('canvas');
                canvas.width = SIZE;
                canvas.height = SIZE;
                const ctx = canvas.getContext('2d')!;
                ctx.drawImage(img, 0, 0, SIZE, SIZE);
                const pixels = ctx.getImageData(0, 0, SIZE, SIZE).data;
                data.set(pixels, layer * SIZE * SIZE * 4);
                idxMap[layer] = layer;
            }
            // If img is null (missing texture), layer stays as -1, gray fallback via vertex color
        }

        const atlas = new THREE.DataArrayTexture(data, SIZE, SIZE, blockIds.length);
        atlas.format = THREE.RGBAFormat;
        atlas.type = THREE.UnsignedByteType;
        atlas.magFilter = THREE.NearestFilter;
        atlas.minFilter = THREE.NearestFilter;
        atlas.generateMipmaps = false;
        atlas.colorSpace = THREE.SRGBColorSpace;
        atlas.needsUpdate = true;

        onReady(atlas, idxMap);
    };

    pending = blockIds.length;

    for (const blockId of blockIds) {
        if (imageCache.has(blockId)) {
            pending--;
            tryBuild();
            continue;
        }

        const name = blockId.replace(/^minecraft:/, '');
        const img = new Image();
        img.onload = () => {
            imageCache.set(blockId, img);
            pending--;
            tryBuild();
        };
        img.onerror = () => {
            imageCache.set(blockId, null); // null = missing, gray fallback
            pending--;
            tryBuild();
        };
        img.src = `/textures/${name}.png`;
    }
}

// ── MapartMesh ──────────────────────────────────────────────────────────────────

const MapartMesh = ({
    imageData,
    packedResults,
    heightPath,
    blockSupport,
    supportBlockId,
    exportMode,
    independentMaps,
    previewSection,
    build3DGeometryAsync,
}: {
    imageData: ImageData;
    packedResults?: Uint32Array | null;
    heightPath?: Int32Array | null;
    blockSupport: 'all' | 'needed' | 'gravity';
    supportBlockId?: string;
    exportMode?: 'full' | 'sections';
    independentMaps?: boolean;
    previewSection?: PreviewSection;
    build3DGeometryAsync: (props: Build3DGeometryProps) => Promise<WorkerGeometry | null>;
}) => {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const atlasRef = useRef<THREE.DataArrayTexture | null>(null);
    const capacityRef = useRef<number>(0);
    const matricesRef = useRef<Float32Array | null>(null);
    const colorsRef = useRef<Float32Array | null>(null);
    const texLayersRef = useRef<Float32Array | null>(null);

    // Subscribe only to palette-relevant state
    const selectedPaletteItems = useMapartStore(s => s.selectedPaletteItems);
    const buildMode = useMapartStore(s => s.buildMode);

    // Build candidateBlocks array corresponding to candidate indices
    const candidateBlocks = useMemo(() => {
        const candidates = getValidColors(selectedPaletteItems, buildMode);
        return candidates.map(c => c.blockId);
    }, [selectedPaletteItems, buildMode]);

    // eslint-disable-next-line react-hooks/preserve-manual-memoization
    const supportColor = useMemo(() => {
        if (supportBlockId) {
            const palette = (paletteData as unknown as PaletteData).colors;
            for (const color of palette) {
                if (color.blocks.some(b => b.id === supportBlockId)) {
                    const { r, g, b } = color.brightnessValues.normal;
                    return { r, g, b };
                }
            }
        }
        return { r: 128, g: 128, b: 128 };
    }, [supportBlockId]);

    // ── Worker-based async geometry state ─────────────────────────────────────
    // Holds the last successfully computed WorkerGeometry.
    // We keep the previous result visible while a new one is in-flight
    // (no flash / blank frame during transitions).
    const [geometry, setGeometry] = useState<WorkerGeometry | null>(null);

    // Use a ref to track the in-flight request so stale results are discarded.
    const requestIdRef = useRef(0);

    useEffect(() => {
        const reqId = ++requestIdRef.current;

        build3DGeometryAsync({
            imageData,
            packedResults: packedResults ?? new Uint32Array(0),
            blockSupport,
            supportColor,
            exportMode,
            independentMaps,
            previewSection,
            candidateBlocks,
            supportBlockId,
            precomputedHeightPath: heightPath ?? null,
        }).then(result => {
            // Discard if a newer request has already been dispatched
            if (reqId !== requestIdRef.current) return;
            if (result) setGeometry(result);
        });
    }, [
        imageData, packedResults, heightPath, blockSupport, supportColor,
        exportMode, independentMaps, previewSection,
        candidateBlocks, supportBlockId, build3DGeometryAsync
    ]);

    // Create stable material with atlas shader set up ONCE.
    // onBeforeCompile is called by Three.js the first time the shader compiles.
    // We save a ref to the compiled shader's uniforms so we can update them
    // dynamically (new atlas) without triggering a shader recompile.
    const shaderUniformsRef = useRef<Record<string, THREE.IUniform> | null>(null);
    // Pending atlas: in case the atlas arrives BEFORE onBeforeCompile runs.
    const pendingAtlasRef = useRef<THREE.DataArrayTexture | null>(null);
    const pendingLayersRef = useRef<number>(0);

    const [mat] = useState(() => {
        const m = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, vertexColors: true });

        m.onBeforeCompile = (shader) => {
            // Use any atlas already available, or null placeholder
            shader.uniforms.uAtlas = { value: pendingAtlasRef.current };
            shader.uniforms.uAtlasLayers = { value: pendingLayersRef.current };

            // Save ref so future atlas updates can write directly to .value
            shaderUniformsRef.current = shader.uniforms;

            // Vertex: inject per-instance attribute + varyings
            shader.vertexShader = `
attribute float aTexLayer;
varying float vTexLayer;
varying vec2 vAtlasUv;
` + shader.vertexShader.replace(
                '#include <uv_vertex>',
                `#include <uv_vertex>
vTexLayer = aTexLayer;
vAtlasUv = uv;`
            );

            // Fragment: inject atlas sampling pre-lighting (after color_fragment)
            // so the texture color participates in PBR lighting normally.
            shader.fragmentShader = `
uniform sampler2DArray uAtlas;
uniform int uAtlasLayers;
varying float vTexLayer;
varying vec2 vAtlasUv;
` + shader.fragmentShader.replace(
                '#include <color_fragment>',
                `#include <color_fragment>
if (vTexLayer >= 0.0) {
    int layer = int(vTexLayer);
    if (layer < uAtlasLayers) {
        diffuseColor.rgb = texture(uAtlas, vec3(vAtlasUv, float(layer))).rgb;
    }
}`
            );
        };

        return m;
    });


    // ── Upload geometry (matrices + colors + textureIdx attribute) ────────────
    // Performance optimization: Uses a buffer pooling strategy to recycle the Float32Arrays 
    // and the InstancedBufferAttributes on the GPU. Instead of allocating and creating new 
    // buffers/attributes every time the user updates the map (which causes garbage collection 
    // pressure and expensive GPU re-allocation stalls), we keep the buffers allocated in refs.
    // If the new instance count fits within the existing capacity, we write directly to the 
    // arrays and set `needsUpdate = true` with a restricted `updateRange`. If the count exceeds 
    // the current capacity, we grow the buffers by 10% headroom to prevent immediate future reallocations.
    useEffect(() => {
        const mesh = meshRef.current;
        if (!mesh || !mat || !geometry || geometry.count === 0) return;

        const { positions, colors, textureIds, count } = geometry;

        // Determine if capacity is sufficient
        let needsNewAttributes = false;
        if (count > capacityRef.current) {
            // Allocate with 10% headroom to avoid frequent re-allocation if count fluctuates slightly
            const newCapacity = Math.ceil(count * 1.1);
            capacityRef.current = newCapacity;

            matricesRef.current = new Float32Array(newCapacity * 16);
            colorsRef.current = new Float32Array(newCapacity * 3);
            texLayersRef.current = new Float32Array(newCapacity);

            needsNewAttributes = true;
        }

        // Fill the matrices buffer
        const matrices = matricesRef.current!;
        for (let i = 0; i < count; i++) {
            const m = i * 16;
            const p = i * 3;
            // Column-major identity matrix with offset positions
            matrices[m] = 1; matrices[m + 1] = 0; matrices[m + 2] = 0; matrices[m + 3] = 0;
            matrices[m + 4] = 0; matrices[m + 5] = 1; matrices[m + 6] = 0; matrices[m + 7] = 0;
            matrices[m + 8] = 0; matrices[m + 9] = 0; matrices[m + 10] = 1; matrices[m + 11] = 0;
            matrices[m + 12] = positions[p];
            matrices[m + 13] = positions[p + 1];
            matrices[m + 14] = positions[p + 2];
            matrices[m + 15] = 1;
        }

        // Fill the colors buffer
        colorsRef.current!.set(colors);

        // Fill the texture layers buffer
        const texLayers = texLayersRef.current!;
        for (let i = 0; i < count; i++) {
            texLayers[i] = textureIds[i]; // -1 or atlas layer index
        }

        if (needsNewAttributes) {
            // Free old GPU buffers by detaching their arrays (allows GC to reclaim memory early)
            if (mesh.instanceMatrix) {
                mesh.instanceMatrix.array = new Float32Array(0);
            }
            if (mesh.instanceColor) {
                mesh.instanceColor.array = new Float32Array(0);
            }
            const oldTexAttr = mesh.geometry.getAttribute('aTexLayer') as THREE.InstancedBufferAttribute;
            if (oldTexAttr) {
                oldTexAttr.array = new Float32Array(0);
                mesh.geometry.deleteAttribute('aTexLayer');
            }

            mesh.instanceMatrix = new THREE.InstancedBufferAttribute(matrices, 16);
            mesh.instanceColor = new THREE.InstancedBufferAttribute(colorsRef.current!, 3);

            const texAttr = new THREE.InstancedBufferAttribute(texLayers, 1);
            mesh.geometry.setAttribute('aTexLayer', texAttr);
        } else {
            // Recycle existing attributes and notify Three.js of changes
            mesh.instanceMatrix.needsUpdate = true;
            if (mesh.instanceColor) {
                mesh.instanceColor.needsUpdate = true;
            }

            const texAttr = mesh.geometry.getAttribute('aTexLayer') as THREE.InstancedBufferAttribute;
            if (texAttr) {
                texAttr.needsUpdate = true;
            }
        }

        // Optimize GPU bandwidth: upload only the active range rather than the full capacity
        mesh.instanceMatrix.clearUpdateRanges();
        mesh.instanceMatrix.addUpdateRange(0, count * 16);

        if (mesh.instanceColor) {
            mesh.instanceColor.clearUpdateRanges();
            mesh.instanceColor.addUpdateRange(0, count * 3);
        }

        const activeTexAttr = mesh.geometry.getAttribute('aTexLayer') as THREE.InstancedBufferAttribute;
        if (activeTexAttr) {
            activeTexAttr.clearUpdateRanges();
            activeTexAttr.addUpdateRange(0, count);
        }

        // Update the instanced mesh's active count to match the number of current blocks
        mesh.count = count;

        mesh.computeBoundingSphere();
    }, [geometry, mat]);

    // ── Load texture atlas asynchronously (doesn't block geometry render) ─────
    useEffect(() => {
        if (!geometry || geometry.uniqueTextureIds.length === 0) return;
        const { uniqueTextureIds } = geometry;

        loadTextureAtlas(uniqueTextureIds, (atlas) => {
            if (!meshRef.current) return;

            // Dispose old atlas
            if (atlasRef.current) atlasRef.current.dispose();
            atlasRef.current = atlas;

            // Always store as pending so onBeforeCompile picks it up even if not compiled yet
            pendingAtlasRef.current = atlas;
            pendingLayersRef.current = uniqueTextureIds.length;

            if (shaderUniformsRef.current) {
                // Shader already compiled — update uniform values directly (no recompile).
                shaderUniformsRef.current.uAtlas.value = atlas;
                shaderUniformsRef.current.uAtlasLayers.value = uniqueTextureIds.length;
            }
            // If shader not compiled yet: onBeforeCompile will read from pendingAtlasRef.
        });

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [geometry?.uniqueTextureIds.join(',')]);


    // ── Dispose on unmount ─────────────────────────────────────────────────────
    useEffect(() => {
        return () => {
            mat.dispose();
            atlasRef.current?.dispose();
        };
    }, [mat]);

    return (
        <instancedMesh
            ref={meshRef}
            args={[undefined, mat, 0]}
            position={[0, 0.5, 0]}
        >
            <boxGeometry args={[1, 1, 1]} />
        </instancedMesh>
    );
};
