import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMapart } from '../../context/MapartContext';
import {
    Settings2,
    Box,
    Info,
    Bug
} from 'lucide-react';
import { ImageSettingsSection } from './control-panel/ImageSettingsSection';
import { ProcessingSettingsSection } from './control-panel/ProcessingSettingsSection';
import { ConstructionSettingsSection } from './control-panel/ConstructionSettingsSection';
import { Button } from '../ui/Button';

interface ControlPanelProps {
    onOpenMaterials: () => void;
}

export const ControlPanel = ({ onOpenMaterials }: ControlPanelProps) => {
    const context = useMapart();
    const [activeSection, setActiveSection] = useState<string>('image');

    const handleToggle = (section: string) => {
        setActiveSection(prev => prev === section ? '' : section);
    };

    return (
        <div className="h-full flex flex-col space-y-3 text-sm">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4 mb-2">
                <h2 className="text-xl font-bold flex items-center gap-2 text-zinc-100 italic">
                    <Settings2 size={22} className="text-blue-500" />
                    PARAMETERS
                </h2>
                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onOpenMaterials}
                        className="text-zinc-500 hover:text-emerald-400"
                        title="Material List"
                    >
                        <Box size={20} />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => console.log('Mapart Configuration:', context)}
                        className="text-zinc-500 hover:text-amber-400"
                        title="Log Profile"
                    >
                        <Bug size={20} />
                    </Button>
                    <Link to="/about">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="text-zinc-500 hover:text-blue-400"
                            title="About"
                        >
                            <Info size={20} />
                        </Button>
                    </Link>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-2">
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
        </div>
    );
};
