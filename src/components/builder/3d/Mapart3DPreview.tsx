import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Grid } from '@react-three/drei';
import { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { Move, ZoomIn, Rotate3D, type LucideIcon } from 'lucide-react';
import { build3DGeometry } from './build3DGeometry';
import paletteData from '../../../data/palette.json';
import { type PaletteData, type PreviewSection } from '../../../types/mapart';
import { getValidColors } from '../../../utils/mapartProcessing';
import { useMapartStore } from '../../../store/useMapartStore';

interface Mapart3DPreviewProps {
    imageData: ImageData | null;
    toneMap?: Int8Array;
    stats?: { minHeight: number; maxHeight: number };
    blockSupport: 'all' | 'needed' | 'gravity';
    supportBlockId?: string;
    exportMode?: 'full' | 'sections';
    independentMaps?: boolean;
    previewSection?: PreviewSection;
    needsSupportMap?: Uint8Array;
}

interface HintItemProps {
    icon: LucideIcon;
    label: string;
    bind: string;
}

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

export const Mapart3DPreview = ({ imageData, toneMap, blockSupport, supportBlockId, exportMode, independentMaps, previewSection, needsSupportMap }: Mapart3DPreviewProps) => {
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
                    toneMap={toneMap}
                    blockSupport={blockSupport}
                    supportBlockId={supportBlockId}
                    exportMode={exportMode}
                    independentMaps={independentMaps}
                    previewSection={previewSection}
                    needsSupportMap={needsSupportMap}
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
    toneMap,
    blockSupport,
    supportBlockId,
    exportMode,
    independentMaps,
    previewSection,
    needsSupportMap
}: {
    imageData: ImageData;
    toneMap?: Int8Array;
    blockSupport: 'all' | 'needed' | 'gravity';
    supportBlockId?: string;
    exportMode?: 'full' | 'sections';
    independentMaps?: boolean;
    previewSection?: PreviewSection;
    needsSupportMap?: Uint8Array
}) => {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const matRef = useRef<THREE.MeshStandardMaterial | null>(null);
    const atlasRef = useRef<THREE.DataArrayTexture | null>(null);
    const texIdxAttrRef = useRef<THREE.InstancedBufferAttribute | null>(null);

    // Subscribe only to palette-relevant state
    const selectedPaletteItems = useMapartStore(s => s.selectedPaletteItems);
    const buildMode = useMapartStore(s => s.buildMode);

    // Build blockIdMap: RGB-hex → blockId
    const blockIdMap = useMemo(() => {
        const candidates = getValidColors(selectedPaletteItems, buildMode);
        const map: Record<string, string> = {};
        for (const c of candidates) {
            const r = c.rgb.r.toString(16).padStart(2, '0');
            const g = c.rgb.g.toString(16).padStart(2, '0');
            const b = c.rgb.b.toString(16).padStart(2, '0');
            map[`#${r}${g}${b}`] = c.blockId;
        }
        return map;
    }, [selectedPaletteItems, buildMode]);

    // Build geometry (positions, colors, textureIds)
    const geometry = useMemo(() => {
        let supportColor = { r: 128, g: 128, b: 128 };
        if (supportBlockId) {
            const palette = (paletteData as unknown as PaletteData).colors;
            for (const color of palette) {
                if (color.blocks.some(b => b.id === supportBlockId)) {
                    const { r, g, b } = color.brightnessValues.normal;
                    supportColor = { r, g, b };
                    break;
                }
            }
        }
        return build3DGeometry({
            imageData,
            toneMap: toneMap ?? null,
            blockSupport,
            supportColor,
            exportMode,
            independentMaps,
            previewSection,
            needsSupportMap: needsSupportMap ?? null,
            blockIdMap,
            supportBlockId,
        });
    }, [imageData, toneMap, blockSupport, supportBlockId, exportMode, independentMaps, previewSection, needsSupportMap, blockIdMap]);

    // Create stable material with atlas shader set up ONCE.
    // onBeforeCompile is called by Three.js the first time the shader compiles.
    // We save a ref to the compiled shader's uniforms so we can update them
    // dynamically (new atlas) without triggering a shader recompile.
    const shaderUniformsRef = useRef<Record<string, THREE.IUniform> | null>(null);
    // Pending atlas: in case the atlas arrives BEFORE onBeforeCompile runs.
    const pendingAtlasRef = useRef<THREE.DataArrayTexture | null>(null);
    const pendingLayersRef = useRef<number>(0);

    if (!matRef.current) {
        const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, vertexColors: true });

        mat.onBeforeCompile = (shader) => {
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

        matRef.current = mat;
    }


    // ── Upload geometry (matrices + colors + textureIdx attribute) ────────────
    useEffect(() => {
        const mesh = meshRef.current;
        const mat = matRef.current;
        if (!mesh || !mat || geometry.count === 0) return;

        const { positions, colors, textureIds, count } = geometry;

        // Build matrix buffer
        const matrices = new Float32Array(count * 16);
        for (let i = 0; i < count; i++) {
            const m = i * 16;
            const p = i * 3;
            matrices[m] = 1; matrices[m + 5] = 1; matrices[m + 10] = 1; matrices[m + 15] = 1;
            matrices[m + 12] = positions[p];
            matrices[m + 13] = positions[p + 1];
            matrices[m + 14] = positions[p + 2];
        }

        // Free old GPU buffers
        if (mesh.instanceMatrix) mesh.instanceMatrix.array = new Float32Array(0);
        if (mesh.instanceColor) mesh.instanceColor.array = new Float32Array(0);
        if (texIdxAttrRef.current) texIdxAttrRef.current.array = new Float32Array(0);

        mesh.instanceMatrix = new THREE.InstancedBufferAttribute(matrices, 16);
        mesh.instanceMatrix.needsUpdate = true;

        // CRITICAL: update mesh.count — args=[...count] is constructor-only in R3F
        // and won't update on re-renders when geometry.count changes.
        mesh.count = count;

        // Per-instance color (used as fallback when texture layer = -1)
        mesh.instanceColor = new THREE.InstancedBufferAttribute(colors.slice(), 3);
        mesh.instanceColor.needsUpdate = true;

        // Per-instance textureLayer attribute (float, -1.0 = no texture)
        const texLayers = new Float32Array(count);
        for (let i = 0; i < count; i++) {
            texLayers[i] = textureIds[i]; // -1 or atlas layer index
        }
        const texAttr = new THREE.InstancedBufferAttribute(texLayers, 1);
        texAttr.needsUpdate = true;
        texIdxAttrRef.current = texAttr;
        mesh.geometry.setAttribute('aTexLayer', texAttr);

        mesh.computeBoundingSphere();
    }, [geometry]);

    // ── Load texture atlas asynchronously (doesn't block geometry render) ─────
    useEffect(() => {
        const { uniqueTextureIds } = geometry;
        if (uniqueTextureIds.length === 0) return;

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
    }, [geometry.uniqueTextureIds.join(',')]);


    // ── Dispose on unmount ─────────────────────────────────────────────────────
    useEffect(() => {
        return () => {
            matRef.current?.dispose();
            atlasRef.current?.dispose();
        };
    }, []);

    return (
        <instancedMesh
            ref={meshRef}
            args={[undefined, matRef.current, geometry.count]}
            position={[0, 0.5, 0]}
        >
            <boxGeometry args={[1, 1, 1]} />
        </instancedMesh>
    );
};
