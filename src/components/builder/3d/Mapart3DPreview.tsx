import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Grid } from '@react-three/drei';
import { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { Move, ZoomIn, Rotate3D, type LucideIcon } from 'lucide-react';
import { build3DGeometry } from './build3DGeometry';
import paletteData from '../../../data/palette.json';
import { type PaletteData, type PreviewSection } from '../../../types/mapart';

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

    // ── Build typed array buffers (positions + colors) ─────────────────────
    // supportColor is computed inline here rather than in a separate useMemo
    // to avoid the React Compiler "memoization could not be preserved" warning
    // (returning a new object literal from useMemo breaks reference identity).
    const geometry = useMemo(() => {
        // Resolve support block color from palette
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
        });
    }, [imageData, toneMap, blockSupport, supportBlockId, exportMode, independentMaps, previewSection, needsSupportMap]);

    // ── Upload buffers to GPU in one shot ──────────────────────────────────
    useEffect(() => {
        const mesh = meshRef.current;
        if (!mesh || geometry.count === 0) return;

        // Build 4×4 translation-only matrices (identity + position) directly
        // in a Float32Array — no THREE.Object3D, no dummy.updateMatrix() per block.
        const matrices = new Float32Array(geometry.count * 16);
        const { positions } = geometry;
        for (let i = 0; i < geometry.count; i++) {
            const m = i * 16;
            const p = i * 3;
            // Column-major identity matrix with translation in column 3
            matrices[m] = 1; matrices[m + 1] = 0; matrices[m + 2] = 0; matrices[m + 3] = 0;
            matrices[m + 4] = 0; matrices[m + 5] = 1; matrices[m + 6] = 0; matrices[m + 7] = 0;
            matrices[m + 8] = 0; matrices[m + 9] = 0; matrices[m + 10] = 1; matrices[m + 11] = 0;
            matrices[m + 12] = positions[p]; matrices[m + 13] = positions[p + 1]; matrices[m + 14] = positions[p + 2]; matrices[m + 15] = 1;
        }

        // Single attribute upload for matrices
        mesh.instanceMatrix = new THREE.InstancedBufferAttribute(matrices, 16);
        mesh.instanceMatrix.needsUpdate = true;

        // Single attribute upload for colors (r,g,b normalized 0-1)
        mesh.instanceColor = new THREE.InstancedBufferAttribute(geometry.colors.slice(), 3);
        mesh.instanceColor.needsUpdate = true;

        // Compute bounding sphere so frustum culling works correctly (see Opt #3)
        mesh.computeBoundingSphere();

    }, [geometry]);

    return (
        <instancedMesh
            ref={meshRef}
            args={[undefined, undefined, geometry.count]}
            position={[0, 0.5, 0]}
        >
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial roughness={1} metalness={0} />
        </instancedMesh>
    );
}

