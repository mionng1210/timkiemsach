import { useState, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import ViewerPanel from './components/ViewerPanel';
import type { SearchResult } from './types';

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

  return (
    <div className="app-layout">
      <Sidebar
        onResultSelect={handleResultSelect}
        selectedResult={selectedResult}
        campus={campus}
        onCampusChange={handleCampusChange}
      />
      <ViewerPanel selectedResult={selectedResult} campus={campus} />
    </div>
  );
}
