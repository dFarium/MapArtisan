import { BrowserRouter, Routes, Route } from 'react-router-dom';

import Builder from './pages/Builder';
import About from './pages/About';
import { ToastProvider } from './components/ui/Toast';

function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Builder />} />
          <Route path="/about" element={<About />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}

export default App;
