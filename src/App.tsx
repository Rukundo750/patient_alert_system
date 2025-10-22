import { useEffect, useState } from 'react';
import { Sun, Moon, Activity, Heart, AlertTriangle, Users, Shield, BarChart3 } from 'lucide-react';
import Sidebar from './components/Sidebar';
import DashboardView from './components/DashboardView';
import PatientsView from './components/PatientsView';
import VitalsView from './components/VitalsView';
import AlertsView from './components/AlertsView';
import RoomsView from './components/RoomsView';
import ChartsView from './components/ChartsView';
import ReportsView from './components/ReportsView';
import { useAuth } from './components/AuthContext';
import Login from './components/Login';
import StaffView from './components/StaffView';
import NurseDashboard from './components/NurseDashboard';
import SettingsView from './components/SettingsView';

function App() {
  const { user } = useAuth();
  const [activeView, setActiveView] = useState('dashboard');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark' || saved === 'light') return saved;
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'dark' : 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  const renderView = () => {
    switch (activeView) {
      case 'dashboard':
        return user?.role === 'nurse' ? <NurseDashboard /> : <DashboardView />;
      case 'patients':
        return <PatientsView />;
      case 'vitals':
        return <VitalsView />;
      case 'alerts':
        return <AlertsView />;
      case 'rooms':
        return <RoomsView />;
      case 'charts':
        return <ChartsView />;
      case 'reports':
        return <ReportsView />;
      case 'staff':
        return <StaffView />;
      case 'settings':
        return <SettingsView />;
      default:
        return user?.role === 'nurse' ? <NurseDashboard /> : <DashboardView />;
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-slate-950 text-gray-900 dark:text-gray-100 animate-fade-in flex items-center">
        <div className="w-full max-w-6xl mx-auto px-6 py-10">
          <div className="mb-10 text-center animate-fade-in-up">
            <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 text-sm font-medium [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)] relative overflow-hidden">
              <span className="absolute inset-0 bg-gradient-shimmer animate-shimmer opacity-40" />
              <Activity className="w-4 h-4" /> Real-time Health Monitoring
            </div>
            <h1 className="mt-4 text-3xl md:text-4xl font-extrabold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent animate-fade-in-up [animation-delay:120ms]">HealthMonitor</h1>
            <p className="mt-2 text-gray-600 dark:text-gray-300 animate-fade-in-up [animation-delay:220ms]">Secure patient monitoring with live vitals, actionable alerts, and role-based access.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-stretch md:justify-items-center md:min-h-[70vh]">
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 animate-pop-in w-full max-w-xl place-self-center h-full flex flex-col justify-center">
              <div className="mb-4">
                <span className="text-sm text-gray-600 dark:text-gray-300">Login as Admin (Doctor) or Nurse</span>
              </div>
              <Login />
            </div>

            <div className="hidden md:block w-full max-w-xl place-self-center h-full">
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 h-full flex flex-col justify-center">
                <div className="grid grid-cols-2 auto-rows-fr gap-4">
                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 hover:shadow-glow transition-shadow animate-fade-in-up [animation-delay:120ms] h-full">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-red-50 to-pink-50 dark:from-red-900/20 dark:to-pink-900/20 flex items-center justify-center mb-3">
                      <Heart className="w-5 h-5 text-red-500" />
                    </div>
                    <h3 className="font-semibold mb-1">Live Vitals</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300">Track heart rate and SpO2 from connected devices.</p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 hover:shadow-glow transition-shadow animate-fade-in-up [animation-delay:180ms] h-full">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 flex items-center justify-center mb-3">
                      <AlertTriangle className="w-5 h-5 text-amber-600" />
                    </div>
                    <h3 className="font-semibold mb-1">Smart Alerts</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300">Receive and accept critical notifications instantly.</p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 hover:shadow-glow transition-shadow animate-fade-in-up [animation-delay:240ms] h-full">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 flex items-center justify-center mb-3">
                      <BarChart3 className="w-5 h-5 text-emerald-600" />
                    </div>
                    <h3 className="font-semibold mb-1">Charts & Trends</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300">Visualize trends for better clinical decisions.</p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 hover:shadow-glow transition-shadow animate-fade-in-up [animation-delay:300ms] h-full">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-sky-50 to-indigo-50 dark:from-sky-900/20 dark:to-indigo-900/20 flex items-center justify-center mb-3">
                      <Users className="w-5 h-5 text-sky-600" />
                    </div>
                    <h3 className="font-semibold mb-1">Staff Roles</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300">Doctor and nurse workflows with secure access.</p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 hover:shadow-glow transition-shadow animate-fade-in-up [animation-delay:360ms] h-full">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-slate-50 to-gray-100 dark:from-slate-900/20 dark:to-gray-900/20 flex items-center justify-center mb-3">
                      <Shield className="w-5 h-5 text-slate-600" />
                    </div>
                    <h3 className="font-semibold mb-1">Secure Auth</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300">Token-based sign-in with role-based permissions.</p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 hover:shadow-glow transition-shadow animate-fade-in-up [animation-delay:420ms]">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-fuchsia-50 to-purple-50 dark:from-fuchsia-900/20 dark:to-purple-900/20 flex items-center justify-center mb-3">
                      <Activity className="w-5 h-5 text-fuchsia-600" />
                    </div>
                    <h3 className="font-semibold mb-1">System Health</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300">Monitor connectivity and device activity.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-100 dark:bg-slate-950 animate-fade-in">
      <div className="hidden md:block">
        <Sidebar activeView={activeView} onViewChange={setActiveView} />
      </div>
      <main className="flex-1 p-8 overflow-auto text-gray-900 dark:text-gray-100 animate-fade-in-up">
        {/* Floating theme toggle at top-right */}
        <div className="fixed top-4 right-4 z-50">
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 mr-2"
          >
            {theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            <span className="text-sm hidden sm:inline">{theme === 'dark' ? 'Dark' : 'Light'}</span>
          </button>
        </div>
        <div className="fixed top-4 left-4 z-50 md:hidden">
          <button
            onClick={() => setMobileSidebarOpen(true)}
            aria-label="Open menu"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
            <span className="text-sm">Menu</span>
          </button>
        </div>
        {mobileSidebarOpen && (
          <div
            className="fixed inset-0 z-40 md:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          >
            <div className="absolute inset-0 bg-black/40" />
            <div className="absolute left-0 top-0 h-full w-80 bg-white dark:bg-gray-800 shadow-xl transform transition-transform duration-300">
              <Sidebar activeView={activeView} onViewChange={(v) => { setActiveView(v); setMobileSidebarOpen(false); }} />
            </div>
          </div>
        )}
        {renderView()}
      </main>
    </div>
  );
}

export default App;
