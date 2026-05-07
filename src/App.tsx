import { useState, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import ViewerPanel from './components/ViewerPanel';
import type { SearchResult, ShelfInfo } from './types';

export default function App() {
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);
  const [campus, setCampus] = useState('Thu Duc');

  const handleResultSelect = useCallback((result: SearchResult) => {
    setSelectedResult(result);
    setCampus(result.campus);
  }, []);

  const handleCampusChange = useCallback((newCampus: string) => {
    setCampus(newCampus);
    setSelectedResult(null);
  }, []);

  // Khi click vào 1 bay cụ thể trên 3D
  const handleBayClick = useCallback((shelf: ShelfInfo) => {
    setSelectedResult({ shelf, campus });
  }, [campus]);

  return (
    <div className="app-layout">
      <Sidebar
        onResultSelect={handleResultSelect}
        selectedResult={selectedResult}
        campus={campus}
        onCampusChange={handleCampusChange}
      />
      <ViewerPanel
        selectedResult={selectedResult}
        campus={campus}
        onBayClick={handleBayClick}
      />
    </div>
  );
}
