import { Search, X } from 'lucide-react';

interface PaletteSearchProps {
    value: string;
    onChange: (val: string) => void;
}

export const PaletteSearch = ({ value, onChange }: PaletteSearchProps) => {
    return (
        <div className="p-4 border-b border-zinc-700 bg-zinc-900 sticky top-0 z-10">
            <h2 className="text-zinc-400 text-xs font-bold uppercase tracking-wider mb-3">Block Palette</h2>
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                    type="text"
                    placeholder="Search blocks..."
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-md pl-9 pr-8 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-all"
                />
                {value && (
                    <button
                        onClick={() => onChange('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-zinc-700 rounded-full text-zinc-500 hover:text-zinc-300"
                    >
                        <X size={12} />
                    </button>
                )}
            </div>
        </div>
    );
};
