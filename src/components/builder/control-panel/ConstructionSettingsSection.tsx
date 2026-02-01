
import { useMapart, type BuildMode, type BlockSupport } from '../../../context/MapartContext';
import { CollapsibleSection } from '../../ui/CollapsibleSection';
import { PrecisionSlider } from '../../ui/PrecisionSlider';
import { Hammer, Layers, Box } from 'lucide-react';
import { Label } from '../../ui/Label';
import { Select } from '../../ui/Select';
import { cn } from '../../../utils/cn';

interface SectionProps {
    isOpen?: boolean;
    onToggle?: () => void;
}

export const ConstructionSettingsSection = ({ isOpen, onToggle }: SectionProps) => {
    const {
        buildMode, setBuildMode,
        threeDPrecision, setThreeDPrecision,
        blockSupport, setBlockSupport
    } = useMapart();

    return (
        <CollapsibleSection
            title="3. Construction Model"
            icon={<Hammer size={16} />}
            defaultOpen={false}
            isOpen={isOpen}
            onToggle={onToggle}
        >
            {/* Build Mode */}
            <div className="space-y-2">
                <Label icon={<Layers size={14} />} className="text-xs">Placement Logic</Label>
                <div className="flex flex-col gap-1">
                    {(['2d', '3d_valley'] as BuildMode[]).map((mode) => (
                        <label key={mode} className={cn(
                            "flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all",
                            buildMode === mode
                                ? "bg-blue-600/10 border-blue-600 text-blue-100 ring-1 ring-blue-600/50"
                                : "bg-zinc-950 border-zinc-800 text-zinc-500 hover:border-zinc-700"
                        )}>
                            <input
                                type="radio"
                                name="buildMode"
                                checked={buildMode === mode}
                                onChange={() => setBuildMode(mode)}
                                className="w-3 h-3 accent-blue-500"
                            />
                            <span className="capitalize text-xs font-bold tracking-wide">{mode.replace(/_/g, ' ')}</span>
                        </label>
                    ))}
                </div>

                {/* 3D Precision Slider - Only for 3D modes */}
                {buildMode === '3d_valley' && (
                    <div className="mt-2 p-2 bg-zinc-950/50 rounded-lg border border-zinc-800/50">
                        <PrecisionSlider
                            label="3D Precision"
                            value={threeDPrecision}
                            min={0}
                            max={100}
                            step={1}
                            unit="%"
                            onChange={setThreeDPrecision}
                            accentColor="accent-purple-500"
                        />
                        <p className="text-[10px] text-zinc-500 mt-1">
                            0% = Flat map, 100% = Full 3D precision
                        </p>
                    </div>
                )}
            </div>

            {/* Block Support */}
            <div className="space-y-2">
                <Label icon={<Box size={14} />} className="text-xs">Structural Strategy</Label>
                <Select
                    value={blockSupport}
                    onChange={(e) => setBlockSupport(e.target.value as BlockSupport)}
                    className="h-8 text-xs"
                >
                    <option value="all">Include Physical Support</option>
                    <option value="needed">Floating Blocks ONLY</option>
                    <option value="survival">Survival Resource Efficient</option>
                </Select>
            </div>
        </CollapsibleSection>
    );
};
