import { useState, useCallback } from 'react';

export function useStateHistory() {
  const [history, setHistory] = useState([]);

  const appendSnapshot = useCallback((snapshot) => {
    setHistory(prev => [...prev, snapshot]);
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  return { history, appendSnapshot, clearHistory };
}
