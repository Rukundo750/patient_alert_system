import { Activity, Users, Bell, LayoutDashboard, Settings, User, LogOut, Shield } from 'lucide-react';
import { useAuth } from './AuthContext';

interface SidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
}

export default function Sidebar({ activeView, onViewChange }: SidebarProps) {
  const { user, logout } = useAuth();
  
  const baseItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, color: 'text-blue-600' },
    { id: 'vitals', label: 'Live Vitals', icon: Activity, color: 'text-emerald-600' },
    { id: 'alerts', label: 'Alerts', icon: Bell, color: 'text-red-600' },
    { id: 'charts', label: 'Charts Analysis', icon: Activity, color: 'text-indigo-600' },
  ];
  
  const adminItems = [
    { id: 'patients', label: 'Patient Management', icon: Users, color: 'text-purple-600' },
    { id: 'rooms', label: 'Room Allocation', icon: LayoutDashboard, color: 'text-amber-600' },
    { id: 'reports', label: 'Reports', icon: Shield, color: 'text-gray-600' },
  ];

  let menuItems = user?.role === 'nurse' ? baseItems : [...baseItems, ...adminItems];
  
  if (user && user.role === 'doctor' && (user as any).is_admin) {
    menuItems = [...menuItems, { id: 'staff', label: 'Staff Management', icon: Users, color: 'text-cyan-600' }];
  }
  
  menuItems = [...menuItems, { id: 'settings', label: 'Settings', icon: Settings, color: 'text-gray-600' }];

  const mainIds = new Set(['dashboard', 'vitals', 'alerts', 'charts']);
  const managementIds = new Set(['patients', 'rooms', 'reports']);
  const adminExtraIds = new Set(['staff']);
  const systemIds = new Set(['settings']);

  const groupedSections = [
    { title: 'Main', items: menuItems.filter((i) => mainIds.has(i.id)) },
    { title: 'Management', items: menuItems.filter((i) => managementIds.has(i.id)) },
    { title: 'Administration', items: menuItems.filter((i) => adminExtraIds.has(i.id)) },
    { title: 'System', items: menuItems.filter((i) => systemIds.has(i.id)) },
  ].filter((section) => section.items.length > 0);

  const getUserRoleBadge = () => {
    const role = user?.role || 'user';
    const roleColors = {
      doctor: 'bg-blue-100 text-blue-700 border-blue-200',
      nurse: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      admin: 'bg-purple-100 text-purple-700 border-purple-200',
      user: 'bg-gray-100 text-gray-700 border-gray-200'
    };
    return roleColors[role as keyof typeof roleColors] || roleColors.user;
  };

  return (
    <aside className="w-80 bg-gradient-to-b from-white to-gray-50/50 dark:from-gray-800 dark:to-gray-900 border-r border-gray-200/60 dark:border-gray-700/60 min-h-screen flex flex-col shadow-xl relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-blue-500/5 to-purple-500/5 pointer-events-none" />
      
      {/* Header */}
      <div className="relative z-10 p-8 border-b border-gray-200/60 dark:border-gray-700/60 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
        <div className="flex items-center gap-4 mb-6">
          <div className="relative">
            <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 via-teal-600 to-cyan-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/25">
              <Activity className="w-7 h-7 text-white" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-400 border-2 border-white dark:border-gray-800 rounded-full flex items-center justify-center">
              <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 dark:from-gray-100 dark:to-gray-300 bg-clip-text text-transparent whitespace-nowrap">
              HealthMonitor
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
              Smart Patient Monitoring
            </p>
          </div>
        </div>

        {/* User Info */}
        <div className="flex items-center gap-3 p-4 bg-white dark:bg-gray-700/50 rounded-2xl border border-gray-200/60 dark:border-gray-600/60 shadow-sm">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-xl flex items-center justify-center shadow-md">
            <User className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 min-w-0">
              <p className="font-semibold text-gray-800 dark:text-gray-100 truncate">
                {user?.username || 'User'}
              </p>
              <span className={`text-xs px-2 py-1 rounded-full border ${getUserRoleBadge()} font-medium whitespace-nowrap shrink-0`}>
                {user?.role?.toUpperCase() || 'USER'}
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate whitespace-nowrap">
              {user?.email || user?.username || ''}
            </p>
          </div>
        </div>
      </div>

      <nav className="relative z-10 flex-1 p-6 overflow-y-auto">
        <div className="space-y-8">
          {groupedSections.map((section) => (
            <div key={section.title} className="space-y-3">
              <div className="px-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {section.title}
              </div>
              <div className="space-y-2">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeView === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => onViewChange(item.id)}
                      className={`group w-full flex items-center gap-4 px-4 py-4 rounded-2xl transition-all duration-300 relative overflow-hidden ${
                        isActive
                          ? 'bg-gradient-to-r from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/25 text-white'
                          : 'text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700/50 hover:shadow-lg border border-transparent hover:border-gray-200/60 dark:hover:border-gray-600/60'
                      }`}
                    >
                      {isActive && (
                        <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent" />
                      )}
                      <div className={`relative z-10 w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 ${
                        isActive ? 'bg-white/20 backdrop-blur-sm' : 'bg-gray-100 dark:bg-gray-700 group-hover:bg-white dark:group-hover:bg-gray-600'
                      }`}>
                        <Icon className={`w-6 h-6 transition-all duration-300 ${isActive ? 'text-white' : item.color}`} />
                      </div>
                      <span className={`relative z-10 font-semibold transition-all duration-300 ${
                        isActive ? 'text-white' : 'text-gray-700 dark:text-gray-200'
                      }`}>
                        {item.label}
                      </span>
                      {isActive && (
                        <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
                          <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                        </div>
                      )}
                      {!isActive && (
                        <div className="absolute inset-0 bg-gradient-to-r from-gray-50 to-transparent dark:from-gray-700/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </nav>

      {/* Footer Status & Logout */}
      <div className="relative z-10 p-6 border-t border-gray-200/60 dark:border-gray-700/60 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm space-y-4">
        {/* System Status */}
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-gray-700 dark:to-gray-800 rounded-2xl p-4 border border-emerald-200/60 dark:border-emerald-700/30 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="relative">
              <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse" />
              <div className="absolute inset-0 bg-emerald-500 rounded-full animate-ping" />
            </div>
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">System Status</span>
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
            All systems operational • Real-time monitoring active
          </p>
        </div>

        {/* Logout Button */}
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-4 py-3 text-gray-600 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 rounded-2xl transition-all duration-300 group"
        >
          <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center group-hover:bg-red-100 dark:group-hover:bg-red-900/30 transition-colors duration-300">
            <LogOut className="w-5 h-5" />
          </div>
          <span className="font-semibold">Sign Out</span>
        </button>

        
      </div>

      {/* Decorative Elements */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500" />
      <div className="absolute bottom-20 left-6 w-2 h-2 bg-blue-400 rounded-full opacity-20 animate-pulse" />
      <div className="absolute top-40 right-8 w-1 h-1 bg-emerald-400 rounded-full opacity-30 animate-ping" />
    </aside>
  );
}