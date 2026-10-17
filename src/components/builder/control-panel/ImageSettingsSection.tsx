import { useId } from 'react';
import { useMapartStore as useMapart, type ImageFitMode } from '../../../store/useMapartStore';
import { CollapsibleSection } from '@/components/controls/CollapsibleSection';
import { FieldLabel } from '@/components/controls/FieldLabel';
import { PrecisionSlider } from '@/components/controls/PrecisionSlider';
import { SegmentedControl, type SegmentedOption } from '@/components/controls/SegmentedControl';
import { Crop, Grid3x3, ImageIcon, Maximize, RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { MAX_MAPS_TOTAL } from '../../../utils/memory';
import type { ResamplingMode } from '../../../utils/processing';

interface SectionProps {
    isOpen?: boolean;
    onToggle?: () => void;
}

const RISK_TEXT = {
    low: 'text-success',
    medium: 'text-warning',
    high: 'text-warning',
    critical: 'text-destructive',
} as const;

const RISK_BAR = {
    low: 'bg-success',
    medium: 'bg-warning',
    high: 'bg-warning',
    critical: 'bg-destructive',
} as const;

const FIT_OPTIONS: SegmentedOption<ImageFitMode>[] = [
    { value: 'adjust', label: 'Adjust', icon: <Maximize /> },
    { value: 'crop', label: 'Crop', icon: <Crop /> },
];

const RESAMPLING_OPTIONS: SegmentedOption<ResamplingMode>[] = [
    { value: 'smooth', label: 'Smooth', icon: <Sparkles />, tooltip: 'Average every source pixel a block covers. Best for photos and art.' },
    { value: 'sharp', label: 'Sharp', icon: <Grid3x3 />, tooltip: 'Take the nearest source pixel. Keeps hard edges in pixel art.' },
];

const ResetButton = ({ label, onClick }: { label: string; onClick: () => void }) => (
    <Tooltip>
        <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={label} onClick={onClick}>
                <RefreshCw />
            </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
    </Tooltip>
);

export const ImageSettingsSection = ({ isOpen, onToggle }: SectionProps) => {
    const {
        gridDimensions, setGridDimensions, memoryEstimate,
        imageFitMode, setImageFitMode,
        resampling, setResampling,
        cropSettings, setCropSettings, resetCropSettings,
        imageSettings, setImageSettings
    } = useMapart();
    const mapsXId = useId();
    const mapsYId = useId();

    return (
        <CollapsibleSection
            title="1. Image & Layout"
            icon={<ImageIcon />}
            defaultOpen={true}
            isOpen={isOpen}
            onToggle={onToggle}
        >
            {/* Resolution / Grid */}
            <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1.5">
                        <FieldLabel htmlFor={mapsXId}>Maps X</FieldLabel>
                        <Input
                            id={mapsXId}
                            type="number" min="1" max={MAX_MAPS_TOTAL}
                            value={gridDimensions.x}
                            onChange={(e) => setGridDimensions({ ...gridDimensions, x: Math.max(1, parseInt(e.target.value) || 1) })}
                            className="font-mono"
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <FieldLabel htmlFor={mapsYId}>Maps Y</FieldLabel>
                        <Input
                            id={mapsYId}
                            type="number" min="1" max={MAX_MAPS_TOTAL}
                            value={gridDimensions.y}
                            onChange={(e) => setGridDimensions({ ...gridDimensions, y: Math.max(1, parseInt(e.target.value) || 1) })}
                            className="font-mono"
                        />
                    </div>
                </div>

                {/* Memory Estimate */}
                <div className="space-y-1.5 rounded-lg border bg-muted/30 p-2">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Memory Estimate</span>
                        <span className={cn('font-mono text-xs font-bold', RISK_TEXT[memoryEstimate.riskLevel])}>
                            ~{memoryEstimate.estimatedMB} MB
                        </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{memoryEstimate.width} × {memoryEstimate.height} px</span>
                        <span>{memoryEstimate.totalMaps} / {MAX_MAPS_TOTAL} maps</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                            className={cn('h-full rounded-full transition-all duration-200', RISK_BAR[memoryEstimate.riskLevel])}
                            style={{ width: `${memoryEstimate.usagePercent}%` }}
                        />
                    </div>
                    {memoryEstimate.exceedsSoftLimit && (
                        <p className="text-xs text-warning">
                            ⚠ High memory usage — may slow down your browser
                        </p>
                    )}
                </div>
            </div>

            <Separator />

            {/* Fit & Crop */}
            <div className="space-y-2">
                <FieldLabel icon={<Crop />}>Image Fit</FieldLabel>
                <SegmentedControl aria-label="Image fit" value={imageFitMode} onValueChange={setImageFitMode} options={FIT_OPTIONS} />
                <SegmentedControl aria-label="Resampling" value={resampling} onValueChange={setResampling} options={RESAMPLING_OPTIONS} />
                <p className="px-1 text-xs text-muted-foreground">
                    {resampling === 'smooth'
                        ? 'Smooth: averages each block\'s area. Best for photos and art.'
                        : 'Sharp: nearest pixel. For pixel art that does not line up with the map grid.'}
                </p>

                {imageFitMode === 'crop' && (
                    <div className="space-y-3 rounded-lg border bg-muted/30 p-2">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Precision Crop</span>
                            <ResetButton label="Reset Crop" onClick={resetCropSettings} />
                        </div>
                        <PrecisionSlider label="Zoom" value={cropSettings.zoom} min={1} max={8} step={0.01} unit="x" onChange={(zoom) => setCropSettings({ zoom })} />
                        <PrecisionSlider label="X" value={cropSettings.offsetX} min={-1} max={1} step={0.01} unit="%" onChange={(offsetX) => setCropSettings({ offsetX })} />
                        <PrecisionSlider label="Y" value={cropSettings.offsetY} min={-1} max={1} step={0.01} unit="%" onChange={(offsetY) => setCropSettings({ offsetY })} />
                    </div>
                )}
            </div>

            <Separator />

            {/* Color Grading */}
            <div className="space-y-3 rounded-lg border bg-muted/30 p-2">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Color Adjustments</span>
                    <ResetButton label="Reset Adjustments" onClick={() => setImageSettings({ saturation: 100, brightness: 0, contrast: 0 })} />
                </div>
                <PrecisionSlider label="Saturation" value={imageSettings.saturation} min={0} max={200} step={1} unit="%" onChange={(saturation) => setImageSettings({ saturation })} />
                <PrecisionSlider label="Brightness" value={imageSettings.brightness} min={-100} max={100} step={1} onChange={(brightness) => setImageSettings({ brightness })} />
                <PrecisionSlider label="Contrast" value={imageSettings.contrast} min={-100} max={100} step={1} onChange={(contrast) => setImageSettings({ contrast })} />
            </div>
        </CollapsibleSection>
    );
};
