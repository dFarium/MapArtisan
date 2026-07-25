import { memo, useEffect, useRef, type CSSProperties } from 'react';

interface ImageDataCanvasProps {
    imageData: ImageData;
    className?: string;
    style?: CSSProperties;
}

/** Renders ImageData into one persistent DOM canvas without PNG/Blob churn. */
export const ImageDataCanvas = memo(({ imageData, className, style }: ImageDataCanvasProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        if (canvas.width !== imageData.width || canvas.height !== imageData.height) {
            canvas.width = imageData.width;
            canvas.height = imageData.height;
        }
        canvas.getContext('2d')?.putImageData(imageData, 0, 0);
    }, [imageData]);

    return (
        <canvas
            ref={canvasRef}
            width={imageData.width}
            height={imageData.height}
            className={className}
            style={style}
        />
    );
});
