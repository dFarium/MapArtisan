
import { useState, useEffect } from 'react';
import { X, ClipboardList, RefreshCw, Box } from 'lucide-react';

interface MaterialListProps {
    isOpen: boolean;
    onClose: () => void;
    onCalculate: () => Promise<Record<string, number> | null>;
}

export const MaterialList = ({ isOpen, onClose, onCalculate }: MaterialListProps) => {
    const [materials, setMaterials] = useState<Record<string, number> | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            loadMaterials();
        } else {
            // Reset when closed so next open refreshes? 
            // Actually, keep it if we want, but better refresh to ensure accuracy.
            setMaterials(null);
        }
    }, [isOpen, onCalculate]);

    const loadMaterials = async () => {
        setIsLoading(true);
        const data = await onCalculate();
        setMaterials(data);
        setIsLoading(false);
    };

    if (!isOpen) return null;

    const formatBlockName = (id: string) => {
        return id.replace('minecraft:', '')
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    };

    const getTextureUrl = (blockId: string) => {
        const cleanName = blockId.replace('minecraft:', '');
        return `/textures/${cleanName}.png`;
    };

    const getMaterialRows = () => {
        if (!materials) return [];
        return Object.entries(materials)
            .sort(([, a], [, b]) => b - a)
            .map(([id, count]) => {
                const stacks = Math.floor(count / 64);
                const remainder = count % 64;
                const shulkers = (count / (64 * 27)).toFixed(1);

                return (
                    <tr key={id} className="border-b border-zinc-800 last:border-0 hover:bg-zinc-800/30 transition-colors">
                        <td className="py-2 px-3 flex items-center gap-3">
                            <div
                                className="w-8 h-8 bg-zinc-800 rounded flex items-center justify-center overflow-hidden border border-zinc-700"
                                style={{ imageRendering: 'pixelated' }}
                            >
                                <img
                                    src={getTextureUrl(id)}
                                    alt={formatBlockName(id)}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                        e.currentTarget.style.display = 'none';
                                        e.currentTarget.parentElement?.classList.add('flex', 'items-center', 'justify-center');
                                        const icon = document.createElement('span');
                                        icon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-box"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" x2="12" y1="22.08" y2="12"/></svg>';
                                        e.currentTarget.parentElement?.appendChild(icon);
                                    }}
                                />
                            </div>
                            <span className="text-zinc-300 font-medium">{formatBlockName(id)}</span>
                        </td>
                        <td className="py-2 px-3 text-right text-zinc-400 font-mono text-xs">
                            {parseInt(shulkers) > 0 ? (
                                <span className={Number(shulkers) >= 1 ? "text-amber-400 font-bold" : ""}>{shulkers} SB</span>
                            ) : '-'}
                        </td>
                        <td className="py-2 px-3 text-right text-zinc-400 font-mono text-xs">
                            {stacks > 0 && <span className="text-zinc-300">{stacks}st</span>}
                            {stacks > 0 && remainder > 0 && <span className="text-zinc-600 mx-1">+</span>}
                            {remainder > 0 && <span>{remainder}</span>}
                        </td>
                        <td className="py-2 px-3 text-right text-zinc-200 font-bold font-mono">
                            {count.toLocaleString()}
                        </td>
                    </tr>
                );
            });
    };

    const totalBlocks = materials ? Object.values(materials).reduce((a, b) => a + b, 0) : 0;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-zinc-900 w-full max-w-2xl max-h-[85vh] rounded-xl border border-zinc-700 shadow-2xl flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-900/50 rounded-t-xl">
                    <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                        <ClipboardList className="text-blue-500" size={20} />
                        Material List
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-white transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-0 custom-scrollbar relative min-h-[300px]">
                    {isLoading ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-zinc-500">
                            <RefreshCw className="animate-spin text-blue-500" size={32} />
                            <p className="text-sm font-medium animate-pulse">Calculating materials...</p>
                        </div>
                    ) : !materials ? (
                        <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-2">
                            <Box size={48} className="text-zinc-700" />
                            <p>No data available</p>
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse">
                            <thead className="sticky top-0 bg-zinc-900/95 backdrop-blur z-10 border-b border-zinc-800 shadow-sm">
                                <tr>
                                    <th className="py-3 px-3 text-xs font-bold text-zinc-500 uppercase tracking-wider">Block Type</th>
                                    <th className="py-3 px-3 text-right text-xs font-bold text-zinc-500 uppercase tracking-wider">Shulkers</th>
                                    <th className="py-3 px-3 text-right text-xs font-bold text-zinc-500 uppercase tracking-wider">Stacks</th>
                                    <th className="py-3 px-3 text-right text-xs font-bold text-zinc-500 uppercase tracking-wider">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {getMaterialRows()}
                            </tbody>
                            <tfoot className="sticky bottom-0 bg-zinc-900/95 border-t border-zinc-800 font-bold text-zinc-100">
                                <tr>
                                    <td className="py-3 px-3">TOTAL BLOCKS</td>
                                    <td colSpan={3} className="py-3 px-3 text-right text-blue-400">
                                        {totalBlocks.toLocaleString()}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-zinc-800 bg-zinc-950/30 rounded-b-xl flex justify-between items-center text-xs text-zinc-500">
                    <p>Estimates based on current configuration.</p>
                </div>
            </div>
        </div>
    );
};
