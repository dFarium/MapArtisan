import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';

const Builder = lazy(() => import('./pages/Builder'));
const About = lazy(() => import('./pages/About'));

const PageLoader = () => (
  <div role="status" aria-label="Loading" className="min-h-screen bg-background flex items-center justify-center opacity-0 animate-[fadeIn_0.3s_ease-in_0.3s_forwards]">
    <Loader2 className="size-8 animate-spin text-primary" />
  </div>
);

const NotFound = () => (
  <div className="min-h-screen bg-background flex items-center justify-center text-center px-6">
    <div className="flex flex-col items-center">
      <div className="relative mb-6">
        <h1 className="text-[10rem] leading-none font-black bg-gradient-to-b from-muted-foreground to-muted bg-clip-text text-transparent select-none">
          404
        </h1>
        <div className="absolute inset-0 bg-primary/10 blur-3xl rounded-full pointer-events-none animate-pulse" />
      </div>
      <p className="text-2xl font-semibold text-foreground mb-2">Lost in the blocks</p>
      <p className="text-muted-foreground mb-10 max-w-sm">The page you're looking for doesn't exist or has been moved.</p>
      <Button asChild className="h-12 gap-2 rounded-xl px-8 text-sm font-semibold shadow-lg shadow-primary/20 transition-transform hover:scale-105">
        <Link to="/">
          <ArrowLeft /> Back to MapArtisan
        </Link>
      </Button>
    </div>
  </div>
);

function App() {
  return (
    <TooltipProvider>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Builder />} />
            <Route path="/about" element={<About />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
      <Toaster position="bottom-right" />
    </TooltipProvider>
  );
}

export default App;
