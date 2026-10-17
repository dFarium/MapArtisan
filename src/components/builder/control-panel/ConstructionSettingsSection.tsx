import { useState, useEffect, useId } from 'react';
import { useMapartFields, type BlockSupport } from '../../../store/useMapartStore';
import type { BuildMode, ExportFormat, ExportMode } from '../../../types/mapart';
import { HEIGHT_LIMIT_STYLES, type HeightLimitStyle } from '../../../utils/processing';
import { CollapsibleSection } from '@/components/controls/CollapsibleSection';
import { FieldLabel } from '@/components/controls/FieldLabel';
import { PrecisionSlider } from '@/components/controls/PrecisionSlider';
import { SegmentedControl, type SegmentedOption } from '@/components/controls/SegmentedControl';
import { Hammer, Layers, Box } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConnectorSlot } from './ConnectorSlot';

interface SectionProps {
    isOpen?: boolean;
    onToggle?: () => void;
}

const DEFAULT_HEIGHT_LIMIT = 32;

const HEIGHT_LIMIT_STYLE_INFO: Record<HeightLimitStyle, { label: string; hint: string }> = {
    lines: { label: 'Lines', hint: 'Resets line up across columns: faint horizontal lines on flat areas, least grain.' },
    balanced: { label: 'Balanced', hint: 'Resets spread out gradually: few lines and light grain.' },
    noise: { label: 'Noise', hint: 'Resets scatter at random: no lines, slightly more grain.' },
};

const BUILD_MODE_OPTIONS: SegmentedOption<BuildMode>[] = [
    { value: '2d', label: '2D' },
    { value: '3d_valley', label: '3D Valley' },
];

const HEIGHT_LIMIT_STYLE_OPTIONS: SegmentedOption<HeightLimitStyle>[] = HEIGHT_LIMIT_STYLES.map((style) => ({
    value: style,
    label: HEIGHT_LIMIT_STYLE_INFO[style].label,
}));

const EXPORT_FORMAT_OPTIONS: SegmentedOption<ExportFormat>[] = [
    { value: 'litematic', label: 'Litematica' },
    { value: 'nbt', label: 'Vanilla NBT' },
];

const EXPORT_MODE_OPTIONS: SegmentedOption<ExportMode>[] = [
    { value: 'full', label: 'Single File' },
    { value: 'sections', label: 'Multiple Files' },
];

const hintClass = 'px-1 text-xs text-muted-foreground';

interface SupportBlockIdEditorProps {
    id: string;
    supportBlockId: string;
    onApply: (supportBlockId: string) => void;
}

const SupportBlockIdEditor = ({ id, supportBlockId, onApply }: SupportBlockIdEditorProps) => {
    const [localSupportId, setLocalSupportId] = useState(supportBlockId);

    return (
        <div className="flex gap-2">
            <Input
                id={id}
                value={localSupportId}
                onChange={(e) => setLocalSupportId(e.target.value)}
                className="font-mono"
                placeholder="minecraft:cobblestone"
            />
            <Button
                onClick={() => onApply(localSupportId)}
                disabled={localSupportId === supportBlockId}
            >
                Apply
            </Button>
        </div>
    );
};

export const ConstructionSettingsSection = ({ isOpen, onToggle }: SectionProps) => {
    const {
        buildMode, setBuildMode,
        heightLimit, setHeightLimit,
        heightLimitStyle, setHeightLimitStyle,
        blockSupport, setBlockSupport,
        supportBlockId, setSupportBlockId,
        exportMode, setExportMode,
        exportFormat, setExportFormat,
        previewSection, setPreviewSection,
        gridDimensions
    } = useMapartFields(
        'buildMode', 'setBuildMode', 'heightLimit', 'setHeightLimit', 'heightLimitStyle', 'setHeightLimitStyle',
        'blockSupport', 'setBlockSupport', 'supportBlockId', 'setSupportBlockId', 'exportMode', 'setExportMode',
        'exportFormat', 'setExportFormat', 'previewSection', 'setPreviewSection', 'gridDimensions'
    );
    const [lastHeightLimit, setLastHeightLimit] = useState(heightLimit > 0 ? heightLimit : DEFAULT_HEIGHT_LIMIT);
    const heightLimitId = useId();
    const blockSupportId = useId();
    const supportBlockInputId = useId();
    const previewSectionId = useId();

    const changeHeightLimit = (value: number) => {
        setLastHeightLimit(value);
        setHeightLimit(value);
    };

    // Enforce selection constraints based on export mode
    useEffect(() => {
        if (exportMode === 'sections') {
            if (!previewSection) {
                setPreviewSection({ x: 0, y: 0 });
            }
        } else {
            // mode is 'full'
            if (previewSection !== null) {
                setPreviewSection(null);
            }
        }
    }, [exportMode, previewSection, setPreviewSection]);

    return (
        <CollapsibleSection
            title="3. Construction Model"
            icon={<Hammer />}
            defaultOpen={false}
            isOpen={isOpen}
            onToggle={onToggle}
        >
            {/* Build Mode */}
            <div className="space-y-2">
                <FieldLabel icon={<Layers />}>Build Mode</FieldLabel>
                <SegmentedControl aria-label="Build mode" value={buildMode} onValueChange={setBuildMode} options={BUILD_MODE_OPTIONS} />

                {/* Height Limit - Only for 3D modes */}
                {buildMode === '3d_valley' && (
                    <div className="space-y-3 rounded-lg border bg-muted/30 p-2">
                        <div className="flex items-center justify-between">
                            <FieldLabel htmlFor={heightLimitId}>Limit build height</FieldLabel>
                            <Switch
                                id={heightLimitId}
                                checked={heightLimit > 0}
                                onCheckedChange={(checked) => setHeightLimit(checked ? lastHeightLimit : 0)}
                            />
                        </div>
                        {heightLimit > 0 ? (
                            <>
                                <PrecisionSlider
                                    label="Max Height"
                                    value={heightLimit}
                                    min={1}
                                    max={128}
                                    step={1}
                                    unit=" blocks"
                                    onChange={changeHeightLimit}
                                />
                                <SegmentedControl
                                    aria-label="Height limit style"
                                    value={heightLimitStyle}
                                    onValueChange={setHeightLimitStyle}
                                    options={HEIGHT_LIMIT_STYLE_OPTIONS}
                                />
                                <p className={hintClass}>
                                    {HEIGHT_LIMIT_STYLE_INFO[heightLimitStyle].hint}
                                </p>
                            </>
                        ) : (
                            <p className={hintClass}>
                                Full color accuracy. Columns grow as tall as the image needs.
                            </p>
                        )}
                    </div>
                )}
            </div>

            {/* Block Support */}
            <div className="space-y-2">
                <FieldLabel htmlFor={blockSupportId} icon={<Box />}>Block Support</FieldLabel>
                <Select value={blockSupport} onValueChange={(value) => setBlockSupport(value as BlockSupport)}>
                    <SelectTrigger id={blockSupportId} className="w-full">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Include Physical Support</SelectItem>
                        <SelectItem value="needed">No Support (Floating)</SelectItem>
                        <SelectItem value="gravity">Support Where Needed</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Support Block ID */}
            {blockSupport !== 'needed' && (
                <div className="space-y-2 border-t pt-2">
                    <FieldLabel htmlFor={supportBlockInputId}>Support Block ID</FieldLabel>
                    <SupportBlockIdEditor
                        key={supportBlockId}
                        id={supportBlockInputId}
                        supportBlockId={supportBlockId}
                        onApply={setSupportBlockId}
                    />
                </div>
            )}

            {/* File Format */}
            <div className="space-y-2 border-t pt-2">
                <FieldLabel>File Format</FieldLabel>
                <SegmentedControl aria-label="File format" value={exportFormat} onValueChange={setExportFormat} options={EXPORT_FORMAT_OPTIONS} />
                <p className={hintClass}>
                    {exportFormat === 'litematic'
                        ? "Export as .litematic for Litematica mod."
                        : "Export as .nbt for Vanilla Minecraft Structure Blocks."}
                </p>
            </div>

            {/* Export Mode */}
            <div className="space-y-2 border-t pt-2">
                <FieldLabel>File Layout</FieldLabel>
                <SegmentedControl aria-label="File layout" value={exportMode} onValueChange={setExportMode} options={EXPORT_MODE_OPTIONS} />
                <p className={hintClass}>
                    {exportMode === 'full'
                        ? `Export the entire project as one large ${exportFormat === 'nbt' ? 'NBT structure' : 'litematic'} file.`
                        : "Split into 128x128 sections (recommended for large maps) packed in a ZIP file."}
                </p>
            </div>

            {/* 3D Preview Section */}
            <div className="space-y-2 border-t pt-2">
                <div className="flex items-center justify-between">
                    <FieldLabel htmlFor={previewSectionId}>3D Preview Area</FieldLabel>
                    {exportMode === 'sections' && (
                        <span className="text-xs text-muted-foreground">Section view required</span>
                    )}
                </div>
                <Select
                    value={previewSection ? `${previewSection.x},${previewSection.y}` : 'all'}
                    onValueChange={(val) => {
                        if (val === 'all') {
                            setPreviewSection(null);
                        } else {
                            const [x, y] = val.split(',').map(Number);
                            setPreviewSection({ x, y });
                        }
                    }}
                    disabled={exportMode === 'full'}
                >
                    <SelectTrigger id={previewSectionId} className="w-full">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {exportMode === 'full' ? (
                            <SelectItem value="all">Show Entire Map Art</SelectItem>
                        ) : (
                            Array.from({ length: gridDimensions.y }).map((_, y) => (
                                Array.from({ length: gridDimensions.x }).map((_, x) => (
                                    <SelectItem key={`${x}_${y}`} value={`${x},${y}`}>
                                        Section {x}, {y}
                                    </SelectItem>
                                ))
                            ))
                        )}
                    </SelectContent>
                </Select>
            </div>

            <ConnectorSlot />
        </CollapsibleSection>
    );
};
