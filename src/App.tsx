import { useState, useEffect } from 'react';
import { Home } from './pages/Home';
import { CreateSwapPage } from './pages/CreateSwap';

export default function App() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const handlePopState = () => {
      setPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (toPath: string) => {
    window.history.pushState({}, '', toPath);
    setPath(toPath);
    window.scrollTo(0, 0);
  };

  if (path === '/create-swap') {
    return <CreateSwapPage onNavigate={navigate} />;
  }

  return <Home onNavigate={navigate} />;
}
