import { useState, useCallback, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, ZoomIn, ZoomOut, RotateCw, Move } from 'lucide-react';
import { useMapart } from '../../context/MapartContext';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const MainCanvas = () => {
    const { uploadedImage, setUploadedImage, previewUrl } = useMapart();
    const [scale, setScale] = useState(1);
    const [rotation, setRotation] = useState(0);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const imageRef = useRef<HTMLImageElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const onDrop = useCallback((acceptedFiles: File[]) => {
        if (acceptedFiles.length > 0) {
            const file = acceptedFiles[0];
            // Validate aspect ratio
            const img = new Image();
            img.onload = () => {
                if (Math.abs(img.width - img.height) > 1) { // Allow 1px diff
                    // Ideally show toast or rejection message
                    console.warn("Aspect ratio must be 1:1");
                }
                setUploadedImage(file);
                // Reset transforms
                setScale(1);
                setRotation(0);
                setPosition({ x: 0, y: 0 });
            };
            img.src = URL.createObjectURL(file);
        }
    }, [setUploadedImage]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'image/png': [],
            'image/jpeg': [],
            'image/webp': []
        },
        maxFiles: 1,
        multiple: false
    });

    const handleWheel = (e: React.WheelEvent) => {
        if (!uploadedImage) return;
        e.preventDefault();
        const delta = e.deltaY * -0.001;
        const newScale = Math.min(Math.max(.1, scale + delta), 5);
        setScale(newScale);
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!uploadedImage || e.button !== 0) return; // Only left click
        setIsDragging(true);
        setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging) return;
        setPosition({
            x: e.clientX - dragStart.x,
            y: e.clientY - dragStart.y
        });
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    // Add styles for dragging when mouse leaves component
    useEffect(() => {
        if (isDragging) {
            const up = () => setIsDragging(false);
            window.addEventListener('mouseup', up);
            return () => window.removeEventListener('mouseup', up);
        }
    }, [isDragging]);

    return (
        <div
            className="flex-1 h-full relative bg-zinc-800 overflow-hidden flex flex-col"
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
        >
            {uploadedImage ? (
                <>
                    {/* Toolbar */}
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-zinc-900/90 backdrop-blur-sm p-2 rounded-lg border border-zinc-700 shadow-xl">
                        <button onClick={() => setScale(s => Math.max(0.1, s - 0.1))} className="p-2 hover:bg-zinc-700 rounded text-zinc-300">
                            <ZoomOut size={18} />
                        </button>
                        <span className="text-xs w-12 text-center font-mono text-zinc-400">{Math.round(scale * 100)}%</span>
                        <button onClick={() => setScale(s => Math.min(5, s + 0.1))} className="p-2 hover:bg-zinc-700 rounded text-zinc-300">
                            <ZoomIn size={18} />
                        </button>
                        <div className="w-px h-6 bg-zinc-700 mx-1" />
                        <button onClick={() => setRotation(r => (r + 90) % 360)} className="p-2 hover:bg-zinc-700 rounded text-zinc-300">
                            <RotateCw size={18} />
                        </button>
                        <button
                            className={clsx("p-2 hover:bg-zinc-700 rounded text-zinc-300", isDragging && "text-blue-400 bg-zinc-800")}
                            title="Drag to Pan"
                        >
                            <Move size={18} />
                        </button>
                        <button onClick={() => setUploadedImage(null)} className="p-2 hover:bg-red-900/50 hover:text-red-400 rounded text-zinc-300 ml-2">
                            X
                        </button>
                    </div>

                    {/* Canvas Area */}
                    <div
                        ref={containerRef}
                        className="flex-1 flex items-center justify-center overflow-hidden cursor-move bg-zinc-800 bg-[radial-gradient(#333_1px,transparent_1px)] bg-[size:20px_20px]"
                        onWheel={handleWheel}
                        onMouseDown={handleMouseDown}
                    >
                        <div
                            style={{
                                transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
                                transition: isDragging ? 'none' : 'transform 0.1s ease-out'
                            }}
                            className="origin-center shadow-2xl"
                        >
                            <img
                                ref={imageRef}
                                src={previewUrl!}
                                alt="Mapart Preview"
                                className="max-w-none pointer-events-none select-none"
                                draggable={false}
                            />
                        </div>
                    </div>
                </>
            ) : (
                <div className="flex-1 flex items-center justify-center p-8">
                    <div
                        {...getRootProps()}
                        className={twMerge(
                            "w-full max-w-2xl aspect-square max-h-[600px] border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all",
                            isDragActive
                                ? "border-blue-500 bg-blue-500/10 scale-[1.02]"
                                : "border-zinc-600 hover:border-zinc-500 hover:bg-zinc-700/30"
                        )}
                    >
                        <input {...getInputProps()} />
                        <div className="bg-zinc-700/50 p-6 rounded-full mb-6">
                            <Upload className="w-12 h-12 text-zinc-400" />
                        </div>
                        <h3 className="text-xl font-medium text-zinc-200 mb-2">
                            {isDragActive ? "Drop image here" : "Upload Image"}
                        </h3>
                        <p className="text-zinc-400 text-sm max-w-xs text-center">
                            Drag & drop or click to select.
                            <br />
                            <span className="opacity-70 mt-2 block">Supports PNG, JPG, WEBP (1:1 Ratio Recommended)</span>
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};
