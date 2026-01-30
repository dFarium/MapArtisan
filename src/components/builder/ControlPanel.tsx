
import { Link } from 'react-router-dom';
import { useMapart, type BuildMode, type BlockSupport } from '../../context/MapartContext';
import {
    Settings2,
    Grid,
    Layers,
    Box,
    Droplets,
    Palette as PaletteIcon,
    Info,
    Bug,
    Crop,
    Maximize,
    RefreshCw,
    ImageIcon,
    Zap,
    Hammer,
    Eye,
    Sparkles
} from 'lucide-react';
import { suggestDitheringMode } from '../../utils/mapartProcessing';
import { PrecisionSlider } from '../ui/PrecisionSlider';
import { CollapsibleSection } from '../ui/CollapsibleSection';




export const ControlPanel = () => {
    const context = useMapart();
    const {
        paletteVersion, setPaletteVersion,
        imageSettings, setImageSettings,
        gridDimensions, setGridDimensions,
        buildMode, setBuildMode,
        blockSupport, setBlockSupport,
        dithering, setDithering,
        transparency, setTransparency,
        imageFitMode, setImageFitMode,
        cropSettings, setCropSettings, resetCropSettings,
        threeDPrecision, setThreeDPrecision,
        useCielab, setUseCielab,
        hybridStrength, setHybridStrength,
        independentMaps, setIndependentMaps,
        previewUrl
    } = context;

    const handleAutoDetect = () => {
        if (!previewUrl) return;

        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => {
            const canvas = document.createElement('canvas');
            // Limit analysis size for performance if image is huge
            const MAX_SIZE = 1000;
            let width = img.width;
            let height = img.height;

            if (width > MAX_SIZE || height > MAX_SIZE) {
                const ratio = Math.min(MAX_SIZE / width, MAX_SIZE / height);
                width = Math.round(width * ratio);
                height = Math.round(height * ratio);
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            ctx.drawImage(img, 0, 0, width, height);
            const imageData = ctx.getImageData(0, 0, width, height);

            const result = suggestDitheringMode(imageData);
            setDithering(result.mode);
            if (result.mode === 'hybrid') {
                setHybridStrength(result.strength);
            }
        };
        img.src = previewUrl;
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
                    <button
                        onClick={() => console.log('Mapart Configuration:', context)}
                        className="p-2 text-zinc-500 hover:bg-zinc-800 hover:text-amber-400 rounded-md transition-all"
                        title="Log Profile"
                    >
                        <Bug size={20} />
                    </button>
                    <Link to="/about" className="p-2 text-zinc-500 hover:bg-zinc-800 hover:text-blue-400 rounded-md transition-all" title="About">
                        <Info size={20} />
                    </Link>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-6">

                {/* STAGE 1: IMAGE SETUP */}
                <CollapsibleSection title="1. Image & Layout" icon={<ImageIcon size={16} />} defaultOpen={true}>
                    {/* Resolution / Grid */}
                    <div className="space-y-4">
                        <label className="text-xs text-zinc-500 uppercase font-bold flex items-center gap-2 tracking-wider">
                            <Grid size={14} /> Grid Size
                        </label>
                        <div className="flex items-center justify-between text-xs text-zinc-400 bg-zinc-950/50 p-2 rounded border border-zinc-800/50">
                            <span className="font-semibold">Reset Height per Map</span>
                            <button
                                onClick={() => setIndependentMaps(!independentMaps)}
                                className={`w-8 h-4 rounded-full transition-colors relative ${independentMaps ? 'bg-blue-600' : 'bg-zinc-700'}`}
                            >
                                <div className={`absolute top-0.5 bottom-0.5 w-3 bg-white rounded-full transition-all ${independentMaps ? 'left-4.5' : 'left-0.5'}`} style={{ left: independentMaps ? '18px' : '2px' }} />
                            </button>
                        </div>

                        <div className="text-xs text-zinc-500 text-right font-mono bg-black/20 p-1 rounded">
                            Target: <span className="text-zinc-300 font-bold">{gridDimensions.x * 128}</span> × <span className="text-zinc-300 font-bold">{gridDimensions.y * 128}</span> pixels
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="flex flex-col gap-1.5">
                                <span className="text-xs text-zinc-600 font-semibold uppercase">Maps X</span>
                                <input
                                    type="number" min="1" max="100"
                                    value={gridDimensions.x}
                                    onChange={(e) => setGridDimensions({ ...gridDimensions, x: Math.max(1, parseInt(e.target.value) || 1) })}
                                    className="bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-zinc-100 text-sm outline-none focus:border-blue-500 transition-colors font-mono"
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <span className="text-xs text-zinc-600 font-semibold uppercase">Maps Y</span>
                                <input
                                    type="number" min="1" max="100"
                                    value={gridDimensions.y}
                                    onChange={(e) => setGridDimensions({ ...gridDimensions, y: Math.max(1, parseInt(e.target.value) || 1) })}
                                    className="bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-zinc-100 text-sm outline-none focus:border-blue-500 transition-colors font-mono"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="h-px bg-zinc-800/50 mx-[-4px]" />

                    {/* Fit & Crop */}
                    <div className="space-y-4">
                        <label className="text-xs text-zinc-500 uppercase font-bold flex items-center gap-2 tracking-wider">
                            <Crop size={14} /> Fitting Strategy
                        </label>
                        <div className="flex gap-1.5 p-1.5 bg-zinc-950 rounded-lg border border-zinc-800">
                            <button
                                onClick={() => setImageFitMode('adjust')}
                                className={`flex-1 py-2 rounded-md text-xs font-bold flex items-center justify-center gap-2 transition-all ${imageFitMode === 'adjust' ? 'bg-blue-600 shadow-lg shadow-blue-900/20 text-white' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
                                    }`}
                            >
                                <Maximize size={14} /> ADJUST
                            </button>
                            <button
                                onClick={() => setImageFitMode('crop')}
                                className={`flex-1 py-2 rounded-md text-xs font-bold flex items-center justify-center gap-2 transition-all ${imageFitMode === 'crop' ? 'bg-green-600 shadow-lg shadow-green-900/20 text-white' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
                                    }`}
                            >
                                <Crop size={14} /> CROP
                            </button>
                        </div>

                        {imageFitMode === 'crop' && (
                            <div className="space-y-4 p-3 bg-zinc-950/50 rounded-lg border border-zinc-800/50">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] text-green-500 font-black tracking-widest uppercase">Precision Crop</span>
                                    <button onClick={resetCropSettings} className="text-zinc-600 hover:text-zinc-400 p-1 rounded hover:bg-zinc-800 transition-all">
                                        <RefreshCw size={12} />
                                    </button>
                                </div>
                                <PrecisionSlider label="Zoom Level" value={cropSettings.zoom} min={1} max={8} step={0.01} unit="x" onChange={(zoom) => setCropSettings({ zoom })} accentColor="accent-green-500" />
                                <PrecisionSlider label="Offset X" value={cropSettings.offsetX} min={-1} max={1} step={0.01} unit="%" onChange={(offsetX) => setCropSettings({ offsetX })} accentColor="accent-green-500" />
                                <PrecisionSlider label="Offset Y" value={cropSettings.offsetY} min={-1} max={1} step={0.01} unit="%" onChange={(offsetY) => setCropSettings({ offsetY })} accentColor="accent-green-500" />
                            </div>
                        )}
                    </div>

                    <div className="h-px bg-zinc-800/50 mx-[-4px]" />

                    {/* Color Grading */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <label className="text-xs text-zinc-500 uppercase font-bold flex items-center gap-2 tracking-wider">
                                <PaletteIcon size={14} /> Pre-Processing Filters
                            </label>
                            <button
                                onClick={() => setImageSettings({ saturation: 100, brightness: 0, contrast: 0 })}
                                className="text-zinc-600 hover:text-zinc-400 p-1 rounded hover:bg-zinc-800 transition-all"
                                title="Reset Filters"
                            >
                                <RefreshCw size={12} />
                            </button>
                        </div>
                        <PrecisionSlider label="Saturation" value={imageSettings.saturation} min={0} max={200} step={1} unit="%" onChange={(saturation) => setImageSettings({ saturation })} />
                        <PrecisionSlider label="Brightness" value={imageSettings.brightness} min={-100} max={100} step={1} onChange={(brightness) => setImageSettings({ brightness })} />
                        <PrecisionSlider label="Contrast" value={imageSettings.contrast} min={-100} max={100} step={1} onChange={(contrast) => setImageSettings({ contrast })} />
                    </div>
                </CollapsibleSection>


                {/* STAGE 2: PROCESSING */}
                <CollapsibleSection title="2. Color Processing" icon={<Zap size={16} />} defaultOpen={true}>
                    {/* Dithering */}
                    <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                            <label className="text-xs text-zinc-500 uppercase font-bold flex items-center gap-2 tracking-wider">
                                <Droplets size={14} /> Quantization Algorithm
                            </label>
                            <button
                                onClick={handleAutoDetect}
                                disabled={!previewUrl}
                                className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 px-2 py-1 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Auto-detect best settings based on image"
                            >
                                <Sparkles size={12} /> Auto
                            </button>
                        </div>
                        <select
                            value={dithering}
                            onChange={(e) => setDithering(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-zinc-200 text-sm focus:border-blue-500 outline-none cursor-pointer hover:border-zinc-700 transition-colors"
                        >
                            <option value="hybrid">Smart (Hybrid F-S)</option>
                            <option value="floyd-steinberg">Standard (Floyd-Steinberg)</option>
                            <option value="ordered">Retro 4x4 (Bayer)</option>
                            <option value="ordered-8x8">Retro 8x8 (Bayer)</option>
                            <option value="adaptive">Smooth (Adaptive F-S)</option>
                            <option value="atkinson">High Contrast (Atkinson)</option>
                            <option value="stucki">Soft Detail (Stucki)</option>
                            <option value="burkes">Balanced (Burkes)</option>
                            <option value="sierra-lite">Fast (Sierra-Lite)</option>
                            <option value="none">Disabled (No Dithering)</option>
                        </select>
                    </div>

                    {/* Hybrid Strength Slider - Only shown when hybrid is selected */}
                    {dithering === 'hybrid' && (
                        <div className="p-3 bg-zinc-950/50 rounded-lg border border-zinc-800/50">
                            <PrecisionSlider
                                label="Hybrid Strength"
                                value={hybridStrength}
                                min={0}
                                max={100}
                                step={1}
                                unit="%"
                                onChange={setHybridStrength}
                                accentColor="accent-cyan-500"
                            />
                            <p className="text-[10px] text-zinc-500 mt-2">
                                0% = Aggressive noise reduction, 100% = More detail preservation
                            </p>
                        </div>
                    )}

                    {/* Transparency */}
                    <div className="space-y-2.5 p-3 bg-zinc-950/30 rounded-lg border border-zinc-800/50">
                        <div className="flex items-center justify-between">
                            <label className="text-xs text-zinc-400 uppercase font-bold flex items-center gap-2 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={transparency.enabled}
                                    onChange={(e) => setTransparency({ enabled: e.target.checked })}
                                    className="w-4 h-4 rounded accent-blue-500 transition-all cursor-pointer"
                                />
                                ALPHA MASKING
                            </label>
                            {transparency.enabled && (
                                <input
                                    type="color"
                                    value={transparency.color}
                                    onChange={(e) => setTransparency({ color: e.target.value })}
                                    className="bg-transparent border-none w-8 h-8 cursor-pointer rounded-full overflow-hidden p-0 ring-2 ring-zinc-800"
                                />
                            )}
                        </div>
                        <p className="text-[10px] text-zinc-500 font-medium">
                            {transparency.enabled ? "REPLACING TRANSPARENCY WITH PICKED COLOR" : "IGNORING ALPHA CHANNEL"}
                        </p>
                    </div>

                    {/* CIELAB Toggle */}
                    <div className="space-y-2.5 p-3 bg-zinc-950/30 rounded-lg border border-zinc-800/50">
                        <label className="text-xs text-zinc-400 uppercase font-bold flex items-center gap-2 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={useCielab}
                                onChange={(e) => setUseCielab(e.target.checked)}
                                className="w-4 h-4 rounded accent-purple-500 transition-all cursor-pointer"
                            />
                            CIELAB COLOR SPACE
                        </label>
                        <p className="text-[10px] text-zinc-500 font-medium">
                            {useCielab ? "PERCEPTUALLY UNIFORM (RECOMMENDED)" : "FASTER RGB DISTANCE"}
                        </p>
                    </div>

                    {/* Game Version */}
                    <div className="space-y-2.5">
                        <label className="text-xs text-zinc-500 uppercase font-bold flex items-center gap-2 tracking-wider">
                            <Eye size={14} /> Target Minecraft Palette
                        </label>
                        <select
                            value={paletteVersion}
                            onChange={(e) => setPaletteVersion(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-zinc-200 text-sm focus:border-blue-500 outline-none cursor-pointer hover:border-zinc-700 transition-colors"
                        >
                            <option value="1.21.11">MINECRAFT 1.21.x</option>
                        </select>
                    </div>
                </CollapsibleSection>


                {/* STAGE 3: CONSTRUCTION */}
                <CollapsibleSection title="3. Construction Model" icon={<Hammer size={16} />} defaultOpen={false}>
                    {/* Build Mode */}
                    <div className="space-y-3">
                        <label className="text-xs text-zinc-500 uppercase font-bold flex items-center gap-2 tracking-wider">
                            <Layers size={14} /> Placement Logic
                        </label>
                        <div className="flex flex-col gap-2">
                            {(['2d', '3d_valley', '3d_valley_lossy'] as BuildMode[]).map((mode) => (
                                <label key={mode} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${buildMode === mode
                                    ? 'bg-blue-600/10 border-blue-600 text-blue-100 ring-1 ring-blue-600/50'
                                    : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:border-zinc-700'
                                    }`}>
                                    <input
                                        type="radio"
                                        name="buildMode"
                                        checked={buildMode === mode}
                                        onChange={() => setBuildMode(mode)}
                                        className="w-4 h-4 accent-blue-500"
                                    />
                                    <span className="capitalize text-sm font-bold tracking-wide">{mode.replace(/_/g, ' ')}</span>
                                </label>
                            ))}
                        </div>

                        {/* 3D Precision Slider - Only for 3D Lossy mode */}
                        {buildMode === '3d_valley_lossy' && (
                            <div className="mt-4 p-3 bg-zinc-950/50 rounded-lg border border-zinc-800/50">
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
                                <p className="text-[10px] text-zinc-500 mt-2">
                                    0% = Flat map, 100% = Full 3D precision
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Block Support */}
                    <div className="space-y-2.5">
                        <label className="text-xs text-zinc-500 uppercase font-bold flex items-center gap-2 tracking-wider">
                            <Box size={14} /> Structural Strategy
                        </label>
                        <select
                            value={blockSupport}
                            onChange={(e) => setBlockSupport(e.target.value as BlockSupport)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-zinc-200 text-sm focus:border-blue-500 outline-none cursor-pointer capitalize hover:border-zinc-700 transition-colors"
                        >
                            <option value="all">Include Physical Support</option>
                            <option value="needed">Floating Blocks ONLY</option>
                            <option value="survival">Survival Resource Efficient</option>
                        </select>
                    </div>
                </CollapsibleSection>

                {/* Footer space */}
                <div className="h-8" />
            </div>
        </div>
    );
};
