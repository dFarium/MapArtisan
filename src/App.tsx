import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ToastProvider } from './components/ui/Toast';

const Builder = lazy(() => import('./pages/Builder'));
const About = lazy(() => import('./pages/About'));

const PageLoader = () => (
  <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
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
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ToastProvider>
  );
}

export default App;
