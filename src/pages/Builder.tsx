import React from 'react';
import { PaletteSidebar } from '../components/builder/PaletteSidebar';
import { MainCanvas } from '../components/builder/MainCanvas';
import { ControlPanel } from '../components/builder/ControlPanel';

const Builder: React.FC = () => {
    return (
        <div className="h-screen w-full flex text-white overflow-hidden relative">
            {/* Sidebar Palette */}
            <PaletteSidebar />

            {/* Main Canvas */}
            <MainCanvas />

            {/* Control Panel (Anchored to the right) */}
            <div className="w-80 h-full bg-zinc-900/95 border-l border-zinc-700 p-4 overflow-y-auto custom-scrollbar shadow-2xl z-20">
                <ControlPanel />
            </div>
        </div>
    );
};

export default Builder;
