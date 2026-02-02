import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { optimizeColumnHeights } from '../../../utils/mapartProcessing';

interface Mapart3DPreviewProps {
    imageData: ImageData | null;
    toneMap?: Int8Array;
    stats?: { minHeight: number; maxHeight: number };
    blockSupport: 'all' | 'needed' | 'gravity';
}

export const Mapart3DPreview = ({ imageData, toneMap, blockSupport }: Mapart3DPreviewProps) => {
    if (!imageData) return null;

    return (
        <div className="w-full h-full bg-zinc-900 relative">
            <Canvas shadows dpr={[1, 2]} gl={{ toneMapping: THREE.NoToneMapping }}>
                <PerspectiveCamera makeDefault position={[0, 100, 100]} fov={50} />
                <ambientLight intensity={2.5} />
                <directionalLight position={[10, 20, 10]} intensity={0.25} castShadow />

                <MapartMesh imageData={imageData} toneMap={toneMap} blockSupport={blockSupport} />

                <OrbitControls minDistance={10} maxDistance={500} />
                <gridHelper args={[200, 20]} position={[0, -0.1, 0]} />
            </Canvas>

            <div className="absolute bottom-4 right-4 bg-black/60 text-white text-xs px-2 py-1 rounded backdrop-blur-sm pointer-events-none">
                LMB: Rotate | RMB: Pan | Wheel: Zoom
            </div>
        </div>
    );
};

const MapartMesh = ({ imageData, toneMap, blockSupport }: { imageData: ImageData; toneMap?: Int8Array; blockSupport: 'all' | 'needed' | 'gravity' }) => {
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

                // Add Support Block
                // Logic: If block is elevated (y > 0), add support at y - 1
                // We only show supports if blockSupport is 'all' (since we can't check gravity without block IDs)
                // For 'gravity' or 'needed', we skip for now to avoid clutter/inaccuracy without IDs.
                // Or if user specifically asked for supports, we assume 'all' is the primary mode to verify.
                if (blockY > 0 && blockSupport === 'all') {
                    blocks.push({
                        x: worldX,
                        y: worldY - 1,
                        z: worldZ,
                        color: new THREE.Color(0.5, 0.5, 0.5) // Grey stone-like support
                    });
                }
            }
        }
        return { blocks, instanceCount: blocks.length };
    }, [imageData, toneMap, width, height, data, blockSupport]);

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
