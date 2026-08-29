import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Home } from './pages/Home';
import { CreateSwapPage } from './pages/CreateSwap';
import { ExploreSwapsPage } from './pages/ExploreSwaps';
import { AboutPage } from './pages/About';
import { HowItWorksPage } from './pages/HowItWorks';
import { SwapRequestsPage } from './pages/SwapRequests';
import { ActiveSwapsPage } from './pages/ActiveSwaps';
import { LoginPage } from './pages/Login';
import { SignupPage } from './pages/Signup';
import { ForgotPasswordPage } from './pages/ForgotPassword';
import { ResetPasswordPage } from './pages/ResetPassword';
import { ThemeToggle } from './components/ui/ThemeToggle';

function AppContent() {
  const [path, setPath] = useState(window.location.pathname);
  const { user, loading } = useAuth();

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
    if (path === '/active-swaps') {
      document.title = 'Active Swaps — SkillSwap';
    } else if (path === '/swap-requests') {
      document.title = 'Swap Requests — SkillSwap';
    } else if (path === '/create-swap') {
      document.title = 'Create Swap — Skillswap';
    } else if (path === '/explore') {
      document.title = 'Explore Swaps — SkillSwap';
    } else if (path === '/about') {
      document.title = 'About — SkillSwap';
    } else if (path === '/how-it-works') {
      document.title = 'How It Works — SkillSwap';
    } else if (path.startsWith('/login')) {
      document.title = 'Log In — SkillSwap';
    } else if (path.startsWith('/signup')) {
      document.title = 'Sign Up — SkillSwap';
    } else if (path === '/forgot-password') {
      document.title = 'Forgot Password — SkillSwap';
    } else if (path === '/reset-password') {
      document.title = 'Reset Password — SkillSwap';
    } else {
      document.title = 'Skillswap — Skills are your currency';
    }
  }, [path]);

  // Protected route list
  const protectedRoutes = ['/create-swap', '/swap-requests', '/active-swaps'];

  // Parse query params for login/signup redirection
  const urlParams = new URLSearchParams(window.location.search);
  const redirectToParam = urlParams.get('redirectTo') || undefined;

  // Protected route enforcement
  if (!loading && !user && protectedRoutes.some((route) => path.startsWith(route))) {
    const loginUrl = `/login?redirectTo=${encodeURIComponent(path)}`;
    window.history.replaceState({}, '', loginUrl);
    return <LoginPage onNavigate={navigate} redirectTo={path} />;
  }

  if (path.startsWith('/login')) {
    return <LoginPage onNavigate={navigate} redirectTo={redirectToParam} />;
  }

  if (path.startsWith('/signup')) {
    return <SignupPage onNavigate={navigate} redirectTo={redirectToParam} />;
  }

  if (path === '/forgot-password') {
    return <ForgotPasswordPage onNavigate={navigate} />;
  }

  if (path === '/reset-password') {
    return <ResetPasswordPage onNavigate={navigate} />;
  }

  if (path === '/active-swaps') {
    return <ActiveSwapsPage onNavigate={navigate} />;
  }

  if (path === '/swap-requests') {
    return <SwapRequestsPage onNavigate={navigate} />;
  }

  if (path === '/create-swap') {
    return <CreateSwapPage onNavigate={navigate} />;
  }

  if (path === '/explore') {
    return <ExploreSwapsPage onNavigate={navigate} />;
  }

  if (path === '/about') {
    return <AboutPage onNavigate={navigate} />;
  }

  if (path === '/how-it-works') {
    return <HowItWorksPage onNavigate={navigate} />;
  }

  return <Home onNavigate={navigate} />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
      <ThemeToggle />
    </AuthProvider>
  );
}
