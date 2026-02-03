import { ChevronDown, ChevronUp, RotateCcw, Save, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { usePalettePresets } from '../../../utils/usePalettePresets';

interface PresetsToolbarProps {
    presetsHook: ReturnType<typeof usePalettePresets>; // Re-use the hook's return type or pass individual props
    onReset: () => void;
}

export const PresetsToolbar = ({ presetsHook, onReset }: PresetsToolbarProps) => {
    const { customPresets, applyPreset, saveCurrentAsPreset, deletePreset } = presetsHook;
    const [isPresetsOpen, setIsPresetsOpen] = useState(false);

    return (
        <div className="flex flex-col gap-2">
            <div
                className="flex items-center justify-between cursor-pointer text-zinc-400 hover:text-zinc-200 transition-colors"
                onClick={() => setIsPresetsOpen(!isPresetsOpen)}
            >
                <span className="text-xs font-semibold uppercase tracking-wider">Presets</span>
                {isPresetsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </div>

            {isPresetsOpen && (
                <div className="bg-zinc-950/50 rounded border border-zinc-800 p-2 flex flex-col gap-2 animate-in fade-in slide-in-from-top-1">
                    <div className="grid grid-cols-3 gap-1.5">
                        <button
                            onClick={() => applyPreset('all')}
                            className="!px-1 !py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-300 font-medium whitespace-nowrap"
                        >
                            All Colors
                        </button>
                        <button
                            onClick={() => applyPreset('basic')}
                            className="!px-1 !py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-300 font-medium whitespace-nowrap"
                        >
                            Basic (16)
                        </button>
                        <button
                            onClick={() => applyPreset('easy')}
                            className="!px-1 !py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-300 font-medium whitespace-nowrap"
                        >
                            Easy
                        </button>
                    </div>

                    {/* Custom Presets */}
                    {customPresets.length > 0 && (
                        <div className="border-t border-zinc-800/50 pt-2 flex flex-col gap-1">
                            <span className="text-xs text-zinc-500 uppercase font-bold px-1">My Presets</span>
                            {customPresets.map((p, i) => (
                                <div key={i} className="flex items-center gap-1 group/p">
                                    <button
                                        onClick={() => applyPreset('custom', p.selection)}
                                        className="flex-1 text-left !px-2 !py-1 text-xs bg-zinc-900/50 hover:bg-zinc-800 border-zinc-800 text-zinc-400 hover:text-zinc-200 truncate"
                                    >
                                        {p.name}
                                    </button>
                                    <button
                                        onClick={() => deletePreset(i)}
                                        className="!p-1 text-zinc-600 hover:text-red-400 opacity-0 group-hover/p:opacity-100 transition-all bg-transparent border-none"
                                        title="Delete"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="flex gap-1.5 border-t border-zinc-800/50 pt-2">
                        <button
                            onClick={onReset}
                            className="flex-1 flex items-center justify-center gap-1 !py-1 text-xs bg-red-900/10 hover:bg-red-900/20 border-red-900/30 text-red-500/80 font-medium"
                        >
                            <RotateCcw size={10} /> Reset
                        </button>
                        <button
                            onClick={saveCurrentAsPreset}
                            className="flex-[2] flex items-center justify-center gap-1 !py-1 text-xs bg-blue-900/20 hover:bg-blue-900/40 border-blue-900/30 text-blue-400 font-bold"
                        >
                            <Save size={10} /> Save Current
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
