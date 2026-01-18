import { Link } from 'react-router-dom';
import { useMapart, type BuildMode, type BlockSupport } from '../../context/MapartContext';
import { Settings2, Grid, Layers, Box, Droplets, Palette as PaletteIcon, Info } from 'lucide-react';

export const ControlPanel = () => {
    const {
        paletteVersion, setPaletteVersion,
        imageSettings, setImageSettings,
        gridDimensions, setGridDimensions,
        buildMode, setBuildMode,
        blockSupport, setBlockSupport,
        dithering, setDithering,
        transparency, setTransparency
    } = useMapart();

    return (
        <div className="h-full flex flex-col space-y-6 text-sm">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Settings2 size={20} /> Parameters
                </h2>
                <Link to="/about" className="text-zinc-500 hover:text-blue-400 transition-colors" title="About">
                    <Info size={18} />
                </Link>
            </div>

            {/* Version */}
            <div className="space-y-2">
                <label className="text-zinc-400 font-medium block">Game Version</label>
                <select
                    value={paletteVersion}
                    onChange={(e) => setPaletteVersion(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-md p-2 text-zinc-200 focus:ring-1 focus:ring-blue-500 outline-none"
                >
                    <option value="1.21.11">1.21.11 (Latest)</option>
                    {/* Add more versions if available */}
                </select>
            </div>

            {/* Image Adjustments */}
            <div className="space-y-4">
                <label className="text-zinc-400 font-medium block flex items-center gap-2">
                    <PaletteIcon size={16} /> Image Adjustments
                </label>

                <div className="space-y-1">
                    <div className="flex justify-between text-xs text-zinc-500">
                        <span>Saturation</span>
                        <span>{imageSettings.saturation}%</span>
                    </div>
                    <input
                        type="range" min="0" max="200"
                        value={imageSettings.saturation}
                        onChange={(e) => setImageSettings({ saturation: parseInt(e.target.value) })}
                        className="w-full accent-blue-500"
                    />
                </div>

                <div className="space-y-1">
                    <div className="flex justify-between text-xs text-zinc-500">
                        <span>Brightness</span>
                        <span>{imageSettings.brightness}</span>
                    </div>
                    <input
                        type="range" min="-100" max="100"
                        value={imageSettings.brightness}
                        onChange={(e) => setImageSettings({ brightness: parseInt(e.target.value) })}
                        className="w-full accent-blue-500"
                    />
                </div>

                <div className="space-y-1">
                    <div className="flex justify-between text-xs text-zinc-500">
                        <span>Contrast</span>
                        <span>{imageSettings.contrast}</span>
                    </div>
                    <input
                        type="range" min="-100" max="100"
                        value={imageSettings.contrast}
                        onChange={(e) => setImageSettings({ contrast: parseInt(e.target.value) })}
                        className="w-full accent-blue-500"
                    />
                </div>
            </div>

            {/* Grid Dimensions */}
            <div className="space-y-2">
                <label className="text-zinc-400 font-medium block flex items-center gap-2">
                    <Grid size={16} /> Dimensions (Map Count)
                </label>
                <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col">
                        <span className="text-xs text-zinc-500 mb-1">Width (X)</span>
                        <input
                            type="number" min="1" max="10"
                            value={gridDimensions.x}
                            onChange={(e) => setGridDimensions({ ...gridDimensions, x: Math.max(1, parseInt(e.target.value) || 1) })}
                            className="bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-200"
                        />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-xs text-zinc-500 mb-1">Height (Y)</span>
                        <input
                            type="number" min="1" max="10"
                            value={gridDimensions.y}
                            onChange={(e) => setGridDimensions({ ...gridDimensions, y: Math.max(1, parseInt(e.target.value) || 1) })}
                            className="bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-200"
                        />
                    </div>
                </div>
                <div className="text-xs text-zinc-500 text-right">
                    Total Blocks: {gridDimensions.x * 128} x {gridDimensions.y * 128}
                </div>
            </div>

            {/* Build Mode */}
            <div className="space-y-2">
                <label className="text-zinc-400 font-medium block flex items-center gap-2">
                    <Layers size={16} /> Build Mode
                </label>
                <div className="flex flex-col gap-2">
                    {(['2d', '3d_valley', '3d_valley_lossy'] as BuildMode[]).map((mode) => (
                        <label key={mode} className="flex items-center gap-2 cursor-pointer hover:bg-zinc-800/50 p-2 rounded transition-colors">
                            <input
                                type="radio"
                                name="buildMode"
                                checked={buildMode === mode}
                                onChange={() => setBuildMode(mode)}
                                className="accent-blue-500"
                            />
                            <span className="capitalize">{mode.replace(/_/g, ' ')}</span>
                        </label>
                    ))}
                </div>
            </div>

            {/* Block Support */}
            <div className="space-y-2">
                <label className="text-zinc-400 font-medium block flex items-center gap-2">
                    <Box size={16} /> Block Support
                </label>
                <select
                    value={blockSupport}
                    onChange={(e) => setBlockSupport(e.target.value as BlockSupport)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-md p-2 text-zinc-200 focus:ring-1 focus:ring-blue-500 outline-none capitalize"
                >
                    <option value="all">All Blocks</option>
                    <option value="needed">Only Needed</option>
                    <option value="survival">Survival Optimized</option>
                </select>
            </div>

            {/* Dithering */}
            <div className="space-y-2">
                <label className="text-zinc-400 font-medium block flex items-center gap-2">
                    <Droplets size={16} /> Dithering
                </label>
                <select
                    value={dithering}
                    onChange={(e) => setDithering(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-md p-2 text-zinc-200 focus:ring-1 focus:ring-blue-500 outline-none capitalize"
                >
                    <option value="none">None</option>
                    <option value="floyd-steinberg">Floyd-Steinberg</option>
                    <option value="ordered">Ordered</option>
                </select>
            </div>

            {/* Transparency */}
            <div className="space-y-2 p-3 border border-zinc-800 rounded-lg bg-zinc-900/50">
                <div className="flex items-center justify-between">
                    <label className="text-zinc-300 font-medium flex items-center gap-2 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={transparency.enabled}
                            onChange={(e) => setTransparency({ enabled: e.target.checked })}
                            className="rounded accent-blue-500"
                        />
                        Transparency
                    </label>
                    {transparency.enabled && (
                        <input
                            type="color"
                            value={transparency.color}
                            onChange={(e) => setTransparency({ color: e.target.value })}
                            className="bg-transparent border-none w-8 h-8 cursor-pointer rounded overflow-hidden p-0"
                            title="Background Color"
                        />
                    )}
                </div>
                <p className="text-xs text-zinc-500 mt-1">
                    {transparency.enabled ? "Pick background color for transparent pixels." : "Transparent pixels ignored."}
                </p>
            </div>

        </div>
    );
};
