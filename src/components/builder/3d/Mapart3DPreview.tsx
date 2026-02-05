import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { Move, ZoomIn, Rotate3D, type LucideIcon } from 'lucide-react';
import { optimizeColumnHeights } from '../../../utils/mapartProcessing';

interface Mapart3DPreviewProps {
    imageData: ImageData | null;
    toneMap?: Int8Array;
    stats?: { minHeight: number; maxHeight: number };
    blockSupport: 'all' | 'needed' | 'gravity';
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

export const Mapart3DPreview = ({ imageData, toneMap, blockSupport, needsSupportMap }: Mapart3DPreviewProps) => {
    if (!imageData) return null;

    return (
        <div className="w-full h-full bg-zinc-900 relative">
            <Canvas shadows dpr={[1, 2]} gl={{ toneMapping: THREE.NoToneMapping }}>
                <PerspectiveCamera makeDefault position={[0, 100, 100]} fov={50} />
                <ambientLight intensity={2.5} />
                <directionalLight position={[10, 20, 10]} intensity={0.25} castShadow />

                <MapartMesh imageData={imageData} toneMap={toneMap} blockSupport={blockSupport} needsSupportMap={needsSupportMap} />

                <OrbitControls minDistance={10} maxDistance={500} />
                <gridHelper args={[200, 20]} position={[0, -0.1, 0]} />
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

const MapartMesh = ({ imageData, toneMap, blockSupport, needsSupportMap }: { imageData: ImageData; toneMap?: Int8Array; blockSupport: 'all' | 'needed' | 'gravity'; needsSupportMap?: Uint8Array }) => {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const { width, height, data } = imageData;
    const dummy = useMemo(() => new THREE.Object3D(), []);

    const { blocks, instanceCount } = useMemo(() => {
        const blocks: { x: number, y: number, z: number, color: THREE.Color }[] = [];

        for (let x = 0; x < width; x++) {
            const tones = [];
            for (let y = 0; y < height; y++) {
                tones.push(toneMap ? toneMap[y * width + x] : 0);
            }

            const { path } = optimizeColumnHeights(tones);

            // --- Column Grounding Logic (Match litematicaExport.ts) ---
            // We want the lowest MAP block of the column to align with Y=0.
            // shiftY = -min(0, min(path))
            let minPathY = 0;
            if (path.length > 0) {
                minPathY = Math.min(...path);
            }
            const shiftY = -Math.min(0, minPathY);

            for (let y = 0; y < height; y++) {
                const blockY = path[y] + shiftY;
                const r = data[(y * width + x) * 4] / 255;
                const g = data[(y * width + x) * 4 + 1] / 255;
                const b = data[(y * width + x) * 4 + 2] / 255;

                const worldX = x - width / 2;
                const worldZ = y - height / 2;
                const worldY = blockY; // Y is height

                // Add Map Block
                blocks.push({
                    x: worldX,
                    y: worldY,
                    z: worldZ,
                    color: new THREE.Color(r, g, b)
                });

                // Add Support Block (if needed)
                if (blockY > 0) {
                    let addSupport = false;

                    if (blockSupport === 'all') {
                        // Include physical support for all elevated blocks
                        addSupport = true;
                    } else if (blockSupport === 'gravity' && needsSupportMap) {
                        // Support only for blocks that need it (from palette.json)
                        const pixelIndex = y * width + x;
                        addSupport = needsSupportMap[pixelIndex] === 1;
                    }
                    // 'needed' mode: no supports (addSupport stays false)

                    if (addSupport) {
                        blocks.push({
                            x: worldX,
                            y: worldY - 1,
                            z: worldZ,
                            color: new THREE.Color(0.5, 0.5, 0.5) // Grey stone-like support
                        });
                    }
                }
            }
        }
        return { blocks, instanceCount: blocks.length };
    }, [toneMap, width, height, data, blockSupport, needsSupportMap]);

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
        <instancedMesh ref={meshRef} args={[undefined, undefined, instanceCount]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial roughness={1} metalness={0} />
        </instancedMesh>
    );
}
