import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { ToastProvider } from './components/ui/Toast';

const Builder = lazy(() => import('./pages/Builder'));
const About = lazy(() => import('./pages/About'));

const PageLoader = () => (
  <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
  </div>
);

const NotFound = () => (
  <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-center px-6">
    <div className="flex flex-col items-center">
      <div className="relative mb-6">
        <h1 className="text-[10rem] leading-none font-black bg-gradient-to-b from-zinc-400 to-zinc-800 bg-clip-text text-transparent select-none">
          404
        </h1>
        <div className="absolute inset-0 bg-blue-500/10 blur-3xl rounded-full pointer-events-none animate-pulse" />
      </div>
      <p className="text-2xl font-semibold text-zinc-300 mb-2">Lost in the blocks</p>
      <p className="text-zinc-500 mb-10 max-w-sm">The page you're looking for doesn't exist or has been moved.</p>
      <Link
        to="/"
        className="group inline-flex items-center gap-2 px-8 py-3.5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white !text-white rounded-xl transition-all duration-300 font-semibold shadow-lg shadow-blue-600/20 hover:shadow-blue-500/30 hover:scale-105"
      >
        <span>←</span> Back to MapArtisan
      </Link>
    </div>
  </div>
);

function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Builder />} />
            <Route path="/about" element={<About />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ToastProvider>
  );
}

export default App;
