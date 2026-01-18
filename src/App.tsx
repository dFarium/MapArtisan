import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { MapartProvider } from './context/MapartContext';
import Builder from './pages/Builder';
import About from './pages/About';

function App() {
  return (
    <MapartProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Builder />} />
          <Route path="/about" element={<About />} />
        </Routes>
      </BrowserRouter>
    </MapartProvider>
  );
}

export default App;
