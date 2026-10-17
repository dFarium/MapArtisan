import { Upload } from 'lucide-react';
import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { cn } from '@/lib/utils';

interface ImageUploaderProps {
    onUpload: (file: File) => void;
    gridDimensions: { x: number; y: number };
    mapartResolution: { width: number; height: number };
}

export const ImageUploader = ({ onUpload, gridDimensions, mapartResolution }: ImageUploaderProps) => {
    const onDrop = useCallback((acceptedFiles: File[]) => {
        if (acceptedFiles.length > 0) {
            onUpload(acceptedFiles[0]);
        }
    }, [onUpload]);

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

    return (
        <div className="flex-1 flex items-center justify-center p-8">
            <div
                {...getRootProps()}
                className={cn(
                    "w-full max-w-2xl aspect-square max-h-[600px] border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all",
                    isDragActive
                        ? "border-primary bg-primary/10 scale-[1.02]"
                        : "border-border hover:border-ring hover:bg-accent/30"
                )}
            >
                <input {...getInputProps()} />
                <div className="bg-accent p-6 rounded-full mb-6">
                    <Upload className="size-12 text-muted-foreground" />
                </div>
                <h3 className="text-xl font-medium text-foreground mb-2">
                    {isDragActive ? "Drop image here" : "Upload Image"}
                </h3>
                <p className="text-muted-foreground text-sm max-w-xs text-center">
                    Drag & drop or click to select.
                    <br />
                    <span className="opacity-70 mt-2 block">Supports PNG, JPG, WEBP</span>
                </p>
                <div className="mt-4 text-xs text-muted-foreground">
                    Current grid: <span className="text-foreground font-mono">{gridDimensions.x} × {gridDimensions.y}</span> =
                    <span className="text-foreground font-mono ml-1">{mapartResolution.width} × {mapartResolution.height}</span> px
                </div>
            </div>
        </div>
    );
};
