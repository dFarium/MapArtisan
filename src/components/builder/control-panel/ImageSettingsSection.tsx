import { useMapartStore as useMapart } from '../../../store/useMapartStore';
import { CollapsibleSection } from '../../ui/CollapsibleSection';
import { PrecisionSlider } from '../../ui/PrecisionSlider';
import { Crop, ImageIcon, Maximize, RefreshCw } from 'lucide-react';
import { Label } from '../../ui/Label';
import { Input } from '../../ui/Input';
import { Button } from '../../ui/Button';
import { cn } from '../../../utils/cn';
import { MAX_MAPS_TOTAL } from '../../../utils/memory';

interface SectionProps {
    isOpen?: boolean;
    onToggle?: () => void;
}

export const ImageSettingsSection = ({ isOpen, onToggle }: SectionProps) => {
    const {
        gridDimensions, setGridDimensions, memoryEstimate,
        imageFitMode, setImageFitMode,
        cropSettings, setCropSettings, resetCropSettings,
        imageSettings, setImageSettings
    } = useMapart();

    const riskColor = memoryEstimate.riskLevel === 'low'
        ? 'text-emerald-400'
        : memoryEstimate.riskLevel === 'medium'
            ? 'text-amber-400'
            : memoryEstimate.riskLevel === 'high'
                ? 'text-orange-400'
                : 'text-red-400';

    const barColor = memoryEstimate.riskLevel === 'low'
        ? 'bg-emerald-500'
        : memoryEstimate.riskLevel === 'medium'
            ? 'bg-amber-500'
            : memoryEstimate.riskLevel === 'high'
                ? 'bg-orange-500'
                : 'bg-red-500';

    return (
        <CollapsibleSection
            title="1. Image & Layout"
            icon={<ImageIcon size={16} />}
            defaultOpen={true}
            isOpen={isOpen}
            onToggle={onToggle}
        >
            {/* Resolution / Grid */}
            <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                        <span className="text-xs text-zinc-600 font-semibold uppercase">Maps X</span>
                        <Input
                            type="number" min="1" max={MAX_MAPS_TOTAL}
                            value={gridDimensions.x}
                            onChange={(e) => setGridDimensions({ ...gridDimensions, x: Math.max(1, parseInt(e.target.value) || 1) })}
                            className="font-mono h-8 text-xs"
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <span className="text-xs text-zinc-600 font-semibold uppercase">Maps Y</span>
                        <Input
                            type="number" min="1" max={MAX_MAPS_TOTAL}
                            value={gridDimensions.y}
                            onChange={(e) => setGridDimensions({ ...gridDimensions, y: Math.max(1, parseInt(e.target.value) || 1) })}
                            className="font-mono h-8 text-xs"
                        />
                    </div>
                </div>

                {/* Memory Estimate */}
                <div className="p-2 bg-zinc-950/50 rounded-lg border border-zinc-800/50 space-y-1.5">
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-500 font-semibold uppercase">Memory Estimate</span>
                        <span className={`text-xs font-mono font-bold ${riskColor}`}>
                            ~{memoryEstimate.estimatedMB} MB
                        </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-zinc-500">
                        <span>{memoryEstimate.width} × {memoryEstimate.height} px</span>
                        <span>{memoryEstimate.totalMaps} / {MAX_MAPS_TOTAL} maps</span>
                    </div>
                    <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-200 ${barColor}`}
                            style={{ width: `${memoryEstimate.usagePercent}%` }}
                        />
                    </div>
                    {memoryEstimate.exceedsSoftLimit && (
                        <span className="text-xs text-amber-400/80">
                            ⚠ High memory usage — may slow down your browser
                        </span>
                    )}
                </div>
            </div>

            <div className="h-px bg-zinc-800/50 -mx-1" />

            {/* Fit & Crop */}
            <div className="space-y-2">
                <Label icon={<Crop size={14} />} className="text-xs mb-1">Image Fit</Label>

                <div className="flex gap-2 p-1 bg-zinc-950 rounded-lg border border-zinc-800">
                    <Button
                        variant={imageFitMode === 'adjust' ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setImageFitMode('adjust')}
                        className={cn("flex-1 text-xs h-7 font-bold gap-2", imageFitMode !== 'adjust' && "text-zinc-500 hover:text-zinc-300")}
                    >
                        <Maximize size={12} /> ADJUST
                    </Button>
                    <Button
                        variant={imageFitMode === 'crop' ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setImageFitMode('crop')}
                        className={cn("flex-1 text-xs h-7 font-bold gap-2", imageFitMode === 'crop' && "bg-emerald-600 hover:bg-emerald-700", imageFitMode !== 'crop' && "text-zinc-500 hover:text-zinc-300")}
                    >
                        <Crop size={12} /> CROP
                    </Button>
                </div>

                {imageFitMode === 'crop' && (
                    <div className="space-y-2 p-2 bg-zinc-950/50 rounded-lg border border-zinc-800/50">
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-emerald-500 font-black tracking-widest uppercase">Precision Crop</span>
                            <button
                                onClick={resetCropSettings}
                                className="p-1.5 hover:bg-red-500/10 text-zinc-400 hover:text-red-400 rounded transition-colors disabled:opacity-50"
                                title={`Reset Crop`}
                            >
                                <RefreshCw size={14} />
                            </button>
                        </div>
                        <PrecisionSlider label="Zoom" value={cropSettings.zoom} min={1} max={8} step={0.01} unit="x" onChange={(zoom) => setCropSettings({ zoom })} accentColor="accent-emerald-500" />
                        <PrecisionSlider label="X" value={cropSettings.offsetX} min={-1} max={1} step={0.01} unit="%" onChange={(offsetX) => setCropSettings({ offsetX })} accentColor="accent-emerald-500" />
                        <PrecisionSlider label="Y" value={cropSettings.offsetY} min={-1} max={1} step={0.01} unit="%" onChange={(offsetY) => setCropSettings({ offsetY })} accentColor="accent-emerald-500" />
                    </div>
                )}
            </div>

            <div className="h-px bg-zinc-800/50 -mx-1" />

            {/* Color Grading */}
            <div className="space-y-2 p-2 bg-zinc-950/50 rounded-lg border border-zinc-800/50">
                <div className="flex items-center justify-between">
                    <Label className="mb-0 text-xs text-zinc-400">Color Adjustments</Label>
                    <button
                        onClick={() => setImageSettings({ saturation: 100, brightness: 0, contrast: 0 })}
                        className="p-1.5 hover:bg-red-500/10 text-zinc-400 hover:text-red-400 rounded transition-colors disabled:opacity-50"
                        title={`Reset Adjustments`}
                    >
                        <RefreshCw size={14} />
                    </button>
                </div>
                <PrecisionSlider label="Saturation" value={imageSettings.saturation} min={0} max={200} step={1} unit="%" onChange={(saturation) => setImageSettings({ saturation })} />
                <PrecisionSlider label="Brightness" value={imageSettings.brightness} min={-100} max={100} step={1} onChange={(brightness) => setImageSettings({ brightness })} />
                <PrecisionSlider label="Contrast" value={imageSettings.contrast} min={-100} max={100} step={1} onChange={(contrast) => setImageSettings({ contrast })} />
            </div>
        </CollapsibleSection>
    );
};
