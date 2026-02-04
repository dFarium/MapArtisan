
import { useMapart } from '../../../context/MapartContext';
import { CollapsibleSection } from '../../ui/CollapsibleSection';
import { PrecisionSlider } from '../../ui/PrecisionSlider';
import { Zap, Droplets, Sparkles, Eye } from 'lucide-react';
import { Checkbox } from '../../ui/Checkbox';
import { Label } from '../../ui/Label';
import { Select } from '../../ui/Select';
import { Button } from '../../ui/Button';
import { suggestDitheringMode } from '../../../utils/mapartProcessing';
import { SUPPORTED_VERSIONS } from '../../../data/supportedVersions';

interface SectionProps {
    isOpen?: boolean;
    onToggle?: () => void;
}

export const ProcessingSettingsSection = ({ isOpen, onToggle }: SectionProps) => {
    const {
        dithering, setDithering,
        hybridStrength, setHybridStrength,
        useCielab, setUseCielab,
        paletteVersion, setPaletteVersion,
        previewUrl
    } = useMapart();

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
            if (result.mode === 'hybrid') {
                setHybridStrength(result.strength);
            }
        };
        img.src = previewUrl;
    };

    return (
        <CollapsibleSection
            title="2. Color Processing"
            icon={<Zap size={16} />}
            defaultOpen={true}
            isOpen={isOpen}
            onToggle={onToggle}
        >
            {/* Dithering */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <Label icon={<Droplets size={14} />} className="text-xs">Quantization Algorithm</Label>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleAutoDetect}
                        disabled={!previewUrl}
                        className="h-5 text-xs uppercase font-bold text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 px-2"
                        title="Auto-detect best settings based on image"
                    >
                        <Sparkles size={10} className="mr-1" /> Auto
                    </Button>
                </div>
                <Select
                    value={dithering}
                    onChange={(e) => setDithering(e.target.value)}
                    className="h-8 text-xs"
                >
                    <option value="hybrid">Smart (Hybrid F-S)</option>
                    <option value="floyd-steinberg">Standard (Floyd-Steinberg)</option>
                    <option value="ordered">Retro 4x4 (Bayer)</option>
                    <option value="ordered-8x8">Retro 8x8 (Bayer)</option>
                    <option value="adaptive">Smooth (Adaptive F-S)</option>
                    <option value="atkinson">High Contrast (Atkinson)</option>
                    <option value="stucki">Soft Detail (Stucki)</option>
                    <option value="burkes">Balanced (Burkes)</option>
                    <option value="sierra-lite">Fast (Sierra-Lite)</option>
                    <option value="none">Disabled (No Dithering)</option>
                </Select>
            </div>

            {/* Hybrid Strength Slider */}
            {dithering === 'hybrid' && (
                <div className="p-2 bg-zinc-950/50 rounded-lg border border-zinc-800/50">
                    <PrecisionSlider
                        label="Hybrid Strength"
                        value={hybridStrength}
                        min={0}
                        max={100}
                        step={1}
                        unit="%"
                        onChange={setHybridStrength}
                        accentColor="accent-cyan-500"
                    />
                    <p className="text-xs text-zinc-500 mt-1">
                        0% = Aggressive noise reduction, 100% = More detail
                    </p>
                </div>
            )}

            {/* CIELAB Toggle */}
            <div className="space-y-1 p-2 bg-zinc-950/30 rounded-lg border border-zinc-800/50">
                <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-400 font-bold uppercase">CIELAB Color Space</span>
                    <Checkbox
                        checked={useCielab}
                        onCheckedChange={setUseCielab}
                    />
                </div>
                <p className="text-xs text-zinc-500 font-medium">
                    {useCielab ? "Perceptually uniform (Recommended)" : "Faster RGB Distance"}
                </p>
            </div>

            {/* Game Version */}
            <div className="space-y-3">
                <Label icon={<Eye size={14} />}>Target Minecraft Palette</Label>
                <Select
                    value={paletteVersion}
                    onChange={(e) => setPaletteVersion(e.target.value)}
                >
                    {SUPPORTED_VERSIONS.map(v => (
                        <option key={v.value} value={v.value}>{v.label}</option>
                    ))}
                </Select>
            </div>
        </CollapsibleSection>
    );
};
