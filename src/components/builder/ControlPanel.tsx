import { useState, memo } from 'react';
import { Link } from 'react-router-dom';

import {
    Settings2,
    ClipboardList,
    Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ImageSettingsSection } from './control-panel/ImageSettingsSection';
import { ProcessingSettingsSection } from './control-panel/ProcessingSettingsSection';
import { ConstructionSettingsSection } from './control-panel/ConstructionSettingsSection';


interface ControlPanelProps {
    onOpenMaterials: () => void;
}

export const ControlPanel = memo(function ControlPanel({ onOpenMaterials }: ControlPanelProps) {

    const [activeSection, setActiveSection] = useState<string>('image');

    const handleToggle = (section: string) => {
        setActiveSection(prev => prev === section ? '' : section);
    };

    return (
        <aside className="h-full flex flex-col space-y-3 text-sm">
            {/* Branding */}
            <div className="mb-6">
                <div className="flex items-center justify-between">
                    {/* Brand colors, intentionally outside the theme tokens. */}
                    <h1 className="text-3xl font-black italic tracking-tight text-blue-400 mb-1">
                        MapAr<span className="bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">tisan</span>
                    </h1>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon-lg" asChild>
                                <Link to="/about" aria-label="About">
                                    <Info />
                                </Link>
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>About</TooltipContent>
                    </Tooltip>
                </div>
                <p className="text-xs text-muted-foreground font-medium tracking-wide">MINECRAFT MAP ART TOOL</p>
            </div>

            {/* Header */}
            <div className="flex items-center justify-between border-b pb-4 mb-2">
                <h2 className="text-xl font-bold flex items-center gap-2 text-foreground italic">
                    <Settings2 className="size-5.5 text-primary" />
                    PARAMETERS
                </h2>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon-lg" onClick={onOpenMaterials} aria-label="Material List">
                            <ClipboardList />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Material List</TooltipContent>
                </Tooltip>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 space-y-2">
                <ImageSettingsSection
                    isOpen={activeSection === 'image'}
                    onToggle={() => handleToggle('image')}
                />
                <ProcessingSettingsSection
                    isOpen={activeSection === 'processing'}
                    onToggle={() => handleToggle('processing')}
                />
                <ConstructionSettingsSection
                    isOpen={activeSection === 'construction'}
                    onToggle={() => handleToggle('construction')}
                />

                {/* Footer space */}
                <div className="h-8" />
            </div>
        </aside>
    );
});
