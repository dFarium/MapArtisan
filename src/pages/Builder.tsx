import React from 'react';
import { PaletteSidebar } from '../components/builder/PaletteSidebar';
import { MainCanvas } from '../components/builder/MainCanvas';
import { ControlPanel } from '../components/builder/ControlPanel';

const Builder: React.FC = () => {
    return (
        <div className="h-screen flex text-white overflow-hidden">
            {/* Sidebar Palette */}
            <PaletteSidebar />

            {/* Main Canvas */}
            <MainCanvas />

            {/* Control Panel */}
            <div className="w-80 bg-zinc-900 border-l border-zinc-700 p-4 overflow-y-auto custom-scrollbar">
                <ControlPanel />
            </div>
        </div>
    );
};

export default Builder;
