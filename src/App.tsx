import { useState, useEffect } from 'react';
import { Home } from './pages/Home';
import { CreateSwapPage } from './pages/CreateSwap';
import { ExploreSwapsPage } from './pages/ExploreSwaps';
import { AboutPage } from './pages/About';

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

  useEffect(() => {
    if (path === '/create-swap') {
      document.title = 'Create Swap — Skillswap';
    } else if (path === '/about') {
      document.title = 'About — SkillSwap';
    } else {
      document.title = 'Skillswap — Skills are your currency';
    }
  }, [path]);

  if (path === '/create-swap') {
    return <CreateSwapPage onNavigate={navigate} />;
  }

  if (path === '/explore') {
    return <ExploreSwapsPage onNavigate={navigate} />;
  }

  if (path === '/about') {
    return <AboutPage onNavigate={navigate} />;
  }

  return <Home onNavigate={navigate} />;
}
