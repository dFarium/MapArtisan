import { Link } from 'react-router-dom';
import {
    Paintbrush,
    Box,
    Download,
    Layers,
    Zap,
    Move3d,
    ArrowLeft,
    Github,
    Heart
} from 'lucide-react';

const About: React.FC = () => {
    return (
        <div className="min-h-screen bg-zinc-900 text-zinc-100 selection:bg-blue-500/30 overflow-y-auto custom-scrollbar">
            {/* Navigation */}
            <nav className="fixed top-0 w-full bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800 z-50">
                <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Link to="/" className="flex items-center gap-2 group">
                            <span className="text-2xl font-black italic tracking-tight text-blue-400">
                                MapAr<span className="bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">tisan</span>
                            </span>
                        </Link>
                    </div>

                    <Link
                        to="/"
                        className="flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-900 border border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800 transition-all text-sm font-medium"
                    >
                        <ArrowLeft size={16} />
                        Back to Builder
                    </Link>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="relative pt-32 pb-20 px-6 overflow-hidden min-h-[80vh] flex flex-col justify-center items-center">

                {/* Background Image with Fade */}
                <div className="absolute inset-0 z-0 select-none">
                    <div className="absolute inset-0 bg-zinc-900" />
                    <img
                        src="/img/hero-showcase.webp"
                        alt="Background"
                        className="w-full h-full object-cover object-top opacity-40 [mask-image:linear-gradient(to_bottom,rgba(0,0,0,1)_50%,transparent_100%)]"
                    />
                    {/* Additional bottom gradient for smoother transition */}
                    <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-zinc-900 to-transparent" />
                </div>





                <div className="max-w-4xl mx-auto relative z-10 text-center mt-32">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900/90 border border-blue-500/30 text-blue-400 text-xs font-bold uppercase tracking-wider mb-8 mx-auto shadow-lg backdrop-blur-md">
                        <Zap size={12} className="fill-current" />
                        A Powerful Map Art Tool Suite
                    </div>

                    <h1 className="text-5xl md:text-8xl font-black tracking-tight mb-8 bg-gradient-to-b from-white to-zinc-400 bg-clip-text text-transparent drop-shadow-2xl">
                        Create Amazing <br />
                        <span className="bg-gradient-to-r from-blue-400 via-emerald-400 to-blue-400 bg-clip-text text-transparent animate-gradient bg-[length:200%_auto]">Minecraft Map Art</span>
                    </h1>

                    <p className="text-xl md:text-2xl text-zinc-300 mb-12 leading-relaxed max-w-2xl mx-auto drop-shadow-lg">
                        A powerful web-based tool for creating Minecraft Map Art. Convert any image into schematics with 3D preview, custom palettes, Litematica export, and survival-friendly features.
                    </p>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
                        <Link
                            to="/"
                            className="px-8 py-4 rounded-xl bg-blue-600 hover:bg-blue-500 !text-white font-bold text-lg transition-all hover:scale-105 shadow-xl shadow-blue-500/20 flex items-center gap-2"
                        >
                            <Paintbrush className="fill-white/20" />
                            Start Creating Now
                        </Link>
                        <a
                            href="https://github.com/dFarium/MapArtisan"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-8 py-4 rounded-xl bg-zinc-900/80 border border-zinc-700 hover:bg-zinc-800/80 !text-zinc-200 font-medium text-lg transition-all flex items-center gap-2 backdrop-blur-sm"
                        >
                            <Github size={20} />
                            View on GitHub
                        </a>
                    </div>
                </div>
            </section>


            {/* Features Grid */}
            <section className="py-20 px-6 relative overflow-hidden">
                <div className="max-w-7xl mx-auto relative z-10">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-b from-white to-zinc-500 pb-2">Everything you need.</h2>
                        <p className="text-zinc-400 mt-4 text-lg">Powerful features for both casual builders and technical players.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        <FeatureCard
                            icon={<Move3d className="text-blue-400" size={32} />}
                            title="Real-time 3D Preview"
                            description="Visualize your Map Art in 3D before you build. Toggle between 2D flat view and 3D staircased view instantly to catch errors."
                            image="/img/3d-feature.webp"
                        />
                        <FeatureCard
                            icon={<Layers className="text-emerald-400" size={32} />}
                            title="Smart Staircasing"
                            description="Maximize color depth using height variation. Our 'Smart Drop' algorithm optimizes for survival building by minimizing unnecessary jumping."
                        />
                        <FeatureCard
                            icon={<Download className="text-amber-400" size={32} />}
                            title="Litematica Export"
                            description="Download ready-to-build schematic files (.litematic) directly compatible with Litematica mod. No external converters needed."
                        />
                        <FeatureCard
                            icon={<Paintbrush className="text-purple-400" size={32} />}
                            title="Pixel Perfect Editor"
                            description="Fine-tune your art with built-in pixel editing tools. Fix individual blocks or draw new details directly in the browser."
                            image="/img/pixel-editor-feature.webp"
                        />
                        <FeatureCard
                            icon={<Box className="text-red-400" size={32} />}
                            title="Custom Materials"
                            description="Select exactly which blocks you have available. Toggle survival-friendly filters or exclude specific hard-to-get materials."
                            image="/img/materials-feature.webp"
                        />
                        <FeatureCard
                            icon={<Zap className="text-cyan-400" size={32} />}
                            title="Easy to Use"
                            description="Intuitive interface designed to get you from image to schematic without the headache. No installation required."
                        />
                    </div>
                </div>
            </section>

            {/* How It Works */}
            <section className="py-20 px-6">
                <div className="max-w-4xl mx-auto">
                    <h2 className="text-3xl font-bold mb-12 text-center">How to Create Map Art</h2>

                    <div className="space-y-0">
                        <Step
                            number="1"
                            title="Upload & Configure"
                            description="Drag and drop your image. Adjust sizing, dithering algorithms, and brightness settings to get the perfect look."
                        />
                        <Step
                            number="2"
                            title="Preview & Edit"
                            description="Check the 3D preview to see how height variation improves colors. Use the pixel editor to touch up any details manually."
                        />
                        <Step
                            number="3"
                            title="Export & Build"
                            description="Download the .litematic file. Load it in-game using Litematica, gather your materials using the generated list, and start building!"
                            isLast={true}
                        />
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="py-12 px-6 border-t border-zinc-800 bg-zinc-900/50">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 text-zinc-500 text-sm">
                    <div className="flex items-center gap-2">
                        <span>© {new Date().getFullYear()} MapArtisan</span>
                        <span>•</span>
                        <span>Created by <a href="https://dfarium.com" className="hover:text-blue-400 transition-colors">dFarium</a></span>
                    </div>

                    <div className="flex items-center gap-6">
                        <a href="https://github.com/dFarium/MapArtisan" className="hover:text-zinc-300 transition-colors flex items-center gap-1.5">
                            <Github size={16} /> GitHub
                        </a>
                        <span className="flex items-center gap-1.5 text-zinc-600">
                            Made with <Heart size={14} className="fill-rose-500 text-rose-500" /> for the Minecraft community
                        </span>
                    </div>
                </div>
            </footer>
        </div>
    );
};

const FeatureCard = ({ icon, title, description, image }: { icon: React.ReactNode, title: string, description: string, image?: string }) => (
    <div className="p-6 rounded-2xl bg-zinc-800/40 border border-zinc-700/50 hover:border-zinc-600/50 transition-colors group flex flex-col h-full">
        <div className="flex items-start justify-between mb-4">
            <div className="p-3 bg-zinc-800/60 rounded-xl w-fit group-hover:scale-110 transition-transform duration-300">
                {icon}
            </div>
        </div>

        <h3 className="text-xl font-bold mb-2 text-zinc-100">{title}</h3>
        <p className="text-zinc-400 leading-relaxed text-sm mb-4 flex-1">
            {description}
        </p>

        {image && (
            <div className="mt-auto rounded-lg overflow-hidden border border-zinc-700/50 group-hover:border-zinc-600/50 transition-colors relative">
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 to-transparent opacity-50"></div>
                <img src={image} alt={title} className="w-full aspect-[4/3] object-cover" />
            </div>
        )}
    </div>
);

const Step = ({ number, title, description, isLast = false }: { number: string, title: string, description: string, isLast?: boolean }) => (
    <div className="relative pl-16 pb-12 last:pb-0">
        {!isLast && (
            <div className="absolute left-[19px] top-4 bottom-0 w-0.5 bg-zinc-800" />
        )}
        <div className="absolute left-0 top-0 w-10 h-10 rounded-full bg-zinc-800/60 border border-zinc-600 flex items-center justify-center font-bold text-blue-400 shadow-[0_0_0_4px_rgb(24,24,27)] z-10">
            {number}
        </div>
        <h3 className="text-xl font-bold mb-2 text-zinc-100">{title}</h3>
        <p className="text-zinc-400 leading-relaxed">
            {description}
        </p>
    </div>
);

export default About;
