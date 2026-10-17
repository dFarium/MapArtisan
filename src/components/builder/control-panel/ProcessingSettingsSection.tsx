import { useId } from 'react';
import { useMapartStore as useMapart } from '../../../store/useMapartStore';
import { CollapsibleSection } from '@/components/controls/CollapsibleSection';
import { FieldLabel } from '@/components/controls/FieldLabel';
import { PrecisionSlider } from '@/components/controls/PrecisionSlider';
import { Zap, Droplets, Sparkles, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
    Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { isDitheringMode, suggestDitheringMode, type DitheringMode } from '../../../utils/processing';
import { SUPPORTED_VERSIONS } from '../../../data/supportedVersions';

interface SectionProps {
    isOpen?: boolean;
    onToggle?: () => void;
}

const DITHERING_GROUPS: { label: string; options: { value: DitheringMode; label: string }[] }[] = [
    {
        label: 'Smart',
        options: [
            { value: 'hybrid-v2', label: 'Smart V2 (Adaptive Hybrid)' },
            { value: 'hybrid', label: 'Smart V1 (Hybrid)' },
        ],
    },
    {
        label: 'Error diffusion',
        options: [
            { value: 'floyd-steinberg', label: 'Standard (Floyd-Steinberg)' },
            { value: 'adaptive', label: 'Smooth (Adaptive F-S)' },
            { value: 'atkinson', label: 'High Contrast (Atkinson)' },
            { value: 'stucki', label: 'Soft Detail (Stucki)' },
            { value: 'burkes', label: 'Balanced (Burkes)' },
            { value: 'sierra-lite', label: 'Fast (Sierra-Lite)' },
        ],
    },
    {
        label: 'Ordered',
        options: [
            { value: 'ordered', label: 'Retro 4x4 (Bayer)' },
            { value: 'ordered-8x8', label: 'Retro 8x8 (Bayer)' },
        ],
    },
];

export const ProcessingSettingsSection = ({ isOpen, onToggle }: SectionProps) => {
    const {
        dithering, setDithering,
        hybridStrength, setHybridStrength,
        usePerceptual, setUsePerceptual,
        paletteVersion, setPaletteVersion,
        previewUrl
    } = useMapart();
    const ditheringId = useId();
    const oklabId = useId();
    const versionId = useId();

    const handleAutoDetect = () => {
        if (!previewUrl) return;
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_SIZE = 1000;
            let width = img.width;
            let height = img.height;
            if (width > MAX_SIZE || height > MAX_SIZE) {
                const ratio = Math.min(MAX_SIZE / width, MAX_SIZE / height);
                width = Math.round(width * ratio);
                height = Math.round(height * ratio);
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            ctx.drawImage(img, 0, 0, width, height);
            const imageData = ctx.getImageData(0, 0, width, height);
            const result = suggestDitheringMode(imageData);
            setDithering(result.mode);
            if (result.mode === 'hybrid' || result.mode === 'hybrid-v2') {
                setHybridStrength(result.strength);
            }
        };
        img.src = previewUrl;
    };

    return (
        <CollapsibleSection
            title="2. Color Processing"
            icon={<Zap />}
            defaultOpen={true}
            isOpen={isOpen}
            onToggle={onToggle}
        >
            {/* Dithering */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <FieldLabel htmlFor={ditheringId} icon={<Droplets />}>Dithering</FieldLabel>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleAutoDetect}
                                disabled={!previewUrl}
                                className="uppercase"
                            >
                                <Sparkles /> Auto
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Auto-detect best settings based on image</TooltipContent>
                    </Tooltip>
                </div>
                <Select
                    value={dithering}
                    onValueChange={(value) => {
                        if (isDitheringMode(value)) {
                            setDithering(value);
                        }
                    }}
                >
                    <SelectTrigger id={ditheringId} className="w-full">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {DITHERING_GROUPS.map((group) => (
                            <SelectGroup key={group.label}>
                                <SelectLabel>{group.label}</SelectLabel>
                                {group.options.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                ))}
                            </SelectGroup>
                        ))}
                        <SelectSeparator />
                        <SelectItem value="none">Disabled (No Dithering)</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Hybrid Strength Slider */}
            {(dithering === 'hybrid' || dithering === 'hybrid-v2') && (
                <div className="space-y-2 rounded-lg border bg-muted/30 p-2">
                    <PrecisionSlider
                        label={dithering === 'hybrid-v2' ? "Strength" : "Hybrid Strength"}
                        value={hybridStrength}
                        min={0}
                        max={100}
                        step={1}
                        unit="%"
                        onChange={setHybridStrength}
                    />
                    <p className="text-xs text-muted-foreground">
                        {dithering === 'hybrid-v2'
                            ? "0% = No dithering, 50% = Adaptive, 100% = Floyd-Steinberg"
                            : "0% = Aggressive noise reduction, 100% = More detail"}
                    </p>
                </div>
            )}

            {/* OKLab Toggle */}
            <div className="space-y-1 rounded-lg border bg-muted/30 p-2">
                <div className="flex items-center justify-between">
                    <FieldLabel htmlFor={oklabId}>OKLab Color Space</FieldLabel>
                    <Switch
                        id={oklabId}
                        checked={usePerceptual}
                        onCheckedChange={setUsePerceptual}
                    />
                </div>
                <p className="text-xs text-muted-foreground">
                    {usePerceptual ? "Perceptually uniform · OKLab (Recommended)" : "Faster RGB Distance"}
                </p>
            </div>

            {/* Game Version */}
            <div className="space-y-2">
                <FieldLabel htmlFor={versionId} icon={<Eye />}>Minecraft Version</FieldLabel>
                <Select value={paletteVersion} onValueChange={setPaletteVersion}>
                    <SelectTrigger id={versionId} className="w-full">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {SUPPORTED_VERSIONS.map(v => (
                            <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </CollapsibleSection>
    );
};
