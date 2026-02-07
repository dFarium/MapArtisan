import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Grid } from '@react-three/drei';
import { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { Move, ZoomIn, Rotate3D, type LucideIcon } from 'lucide-react';
import { optimizeColumnHeights } from '../../../utils/mapartProcessing';
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
                dpr={[1, 2]}
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
    const { width, height, data } = imageData;
    const dummy = useMemo(() => new THREE.Object3D(), []);

    const { blocks, instanceCount } = useMemo(() => {
        const blocks: { x: number, y: number, z: number, color: THREE.Color }[] = [];

        // Find support block color from palette
        let supportColor = new THREE.Color(0.5, 0.5, 0.5);
        if (supportBlockId) {
            const palette = (paletteData as unknown as PaletteData).colors;
            for (const color of palette) {
                if (color.blocks.some(b => b.id === supportBlockId)) {
                    const { r, g, b } = color.brightnessValues.normal;
                    supportColor = new THREE.Color(r / 255, g / 255, b / 255);
                    break;
                }
            }
        }

        // 1. Generate all potentially visible blocks
        for (let x = 0; x < width; x++) {
            // Filter by previewSection X if provided
            if (previewSection) {
                const sectionMinX = previewSection.x * 128;
                const sectionMaxX = (previewSection.x + 1) * 128;
                if (x < sectionMinX || x >= sectionMaxX) continue;
            }

            const tones = [];
            for (let y = 0; y < height; y++) {
                tones.push(toneMap ? toneMap[y * width + x] : 0);
            }

            // Track baselines for independent maps to render nooblines correctly
            const sectionBaselines: Record<number, number> = {};

            // Path generation and Grounding
            const path: number[] = new Array(height).fill(0);
            const useIndependentSD = independentMaps && exportMode === 'sections';

            if (useIndependentSD) {
                const numMaps = Math.ceil(height / 128);
                for (let m = 0; m < numMaps; m++) {
                    const zStart = m * 128;
                    const zEnd = Math.min((m + 1) * 128, height);
                    const chunkTones = tones.slice(zStart, zEnd);
                    const { path: mapPath } = optimizeColumnHeights(chunkTones);

                    const minChunkY = Math.min(...mapPath, 0);
                    const shiftY = -minChunkY;
                    sectionBaselines[m] = shiftY;

                    for (let i = 0; i < mapPath.length; i++) {
                        path[zStart + i] = mapPath[i] + shiftY;
                    }
                }
            } else {
                const { path: globalPath } = optimizeColumnHeights(tones);
                const minPathY = Math.min(...globalPath, 0);
                const shiftY = -minPathY;
                for (let i = 0; i < globalPath.length; i++) {
                    path[i] = globalPath[i] + shiftY;
                }
            }

            for (let y = -1; y < height; y++) {
                let isNoobline = false;
                // Filter by previewSection Y if provided
                if (exportMode === 'sections' && previewSection) {
                    const sectionMinY = previewSection.y * 128;
                    const sectionMaxY = (previewSection.y + 1) * 128;
                    const nooblineY = sectionMinY - 1;

                    if (y < sectionMinY || y >= sectionMaxY) {
                        if (y === nooblineY) {
                            isNoobline = true;
                        } else {
                            continue;
                        }
                    }
                } else if (y === -1) {
                    // row -1 is the global noobline
                    isNoobline = true;
                }

                let blockY = y === -1 ? 0 : path[y];
                let blockColor: THREE.Color;

                if (isNoobline) {
                    // For any noobline row, determine the correct height
                    if (independentMaps) {
                        const m = previewSection ? previewSection.y : (y === -1 ? 0 : Math.floor(y / 128));
                        blockY = sectionBaselines[m] ?? 0;
                    } else {
                        // Global mode: noobline is at shifts relative to 0
                        // path already has shifts applied if we did it globally.
                        // Actually, if y = -1, we use path[0]'s baseline? No, baseline is 0+shiftY.
                        if (y === -1) {
                            // Find any block in the column to get global shift
                            // path[0] minus tones[0] is one way.
                            // But cleaner: optimizeColumnHeights returns neutral if tones are 0.
                            // Globally path = optimized(tones) + shiftY.
                            // Baseline is shiftY.
                            const { path: globalPath } = optimizeColumnHeights(tones);
                            const minPathY = Math.min(...globalPath, 0);
                            const shiftY = -minPathY;
                            blockY = shiftY;
                        } else {
                            // Boundary sharing noobline (e.g. y=127 for map 1)
                            blockY = path[y];
                        }
                    }
                    blockColor = supportColor;
                } else {
                    const r = data[(y * width + x) * 4] / 255;
                    const g = data[(y * width + x) * 4 + 1] / 255;
                    const b = data[(y * width + x) * 4 + 2] / 255;
                    blockColor = new THREE.Color(r, g, b);
                }

                // Centering Logic (Half-pixel offset to align boundaries with integer grid lines)
                let worldX, worldZ;
                if (previewSection) {
                    worldX = x - (previewSection.x * 128 + 63.5);
                    worldZ = y - (previewSection.y * 128 + 63.5);
                } else {
                    worldX = x - (width - 1) / 2;
                    worldZ = y - (height - 1) / 2;
                }

                blocks.push({
                    x: worldX,
                    y: blockY,
                    z: worldZ,
                    color: blockColor
                });

                // Add Support Placeholder (will be grounded later)
                if (blockY > 0) {
                    let addSupport = false;
                    if (blockSupport === 'all') addSupport = true;
                    else if (blockSupport === 'gravity' && needsSupportMap) {
                        addSupport = needsSupportMap[y * width + x] === 1;
                    }

                    if (addSupport) {
                        blocks.push({
                            x: worldX,
                            y: blockY - 1,
                            z: worldZ,
                            color: supportColor
                        });
                    }
                }
            }
        }

        return { blocks, instanceCount: blocks.length };
    }, [toneMap, width, height, data, blockSupport, supportBlockId, exportMode, independentMaps, previewSection, needsSupportMap]);

    useEffect(() => {
        if (!meshRef.current) return;

        blocks.forEach((block, i) => {
            dummy.position.set(block.x, block.y, block.z);
            dummy.updateMatrix();
            meshRef.current!.setMatrixAt(i, dummy.matrix);
            meshRef.current!.setColorAt(i, block.color);
        });
        meshRef.current.instanceMatrix.needsUpdate = true;
        if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
    }, [blocks, dummy]);

    return (
        <instancedMesh
            ref={meshRef}
            args={[undefined, undefined, instanceCount]}
            position={[0, 0.5, 0]}
            frustumCulled={false}
        >
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial roughness={1} metalness={0} />
        </instancedMesh>
    );
}
