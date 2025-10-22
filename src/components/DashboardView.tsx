import { useEffect, useMemo, useState } from 'react';
import { Activity, Users, AlertTriangle, TrendingUp } from 'lucide-react';
import { apiService, DashboardStats, Vital, Alert, Patient, Room } from '../services/api';

export default function DashboardView() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [vitals, setVitals] = useState<Vital[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [ds, vs, ps, rs, als] = await Promise.all([
          apiService.getDashboardStats(),
          apiService.getVitals(),
          apiService.getPatients(),
          apiService.getRooms(),
          apiService.getAlerts(),
        ]);
        setStats(ds);
        setVitals(vs);
        setPatients(ps);
        setRooms(rs);
        setAlerts(als);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
    const id = setInterval(fetchAll, 5000);
    return () => clearInterval(id);
  }, []);

  // Socket.IO realtime updates for alerts and vitals (faster than SSE)
  useEffect(() => {
    let cleanup: (() => void) | null = null;
    const url = (import.meta as any).env?.VITE_API_BASE || window.location.origin;
    (async () => {
      try {
        const mod = await import('socket.io-client');
        const io = (mod as any).io || (mod as any).default;
        const socket = io(url, { transports: ['websocket', 'polling'] });
        socket.on('alerts:new', (incoming: any) => {
          try {
            const a: Partial<Alert> = incoming || {};
            const normalized: Alert = {
              id: (a.id as number) ?? Date.now(),
              patient_id: (a.patient_id as string) ?? 'unknown',
              type: (a.type as string) ?? 'alert',
              severity: (a.severity as string) ?? ((a.type as string) === 'emergency' ? 'critical' : 'warning'),
              message: (a.message as string) ?? 'New alert',
              heart_rate: (a.heart_rate as number) ?? null as any,
              spo2: (a.spo2 as number) ?? null as any,
              timestamp: (a.timestamp as string) ?? new Date().toISOString(),
              acknowledged: Boolean(a.acknowledged) || false,
              name: a.name as any,
              room: a.room as any,
              floor: a.floor as any,
            } as unknown as Alert;
            setAlerts(prev => [normalized, ...prev]);

            // Email the doctor when the physical alert button is pressed
            const looksLikeButton = (normalized.type && normalized.type.toLowerCase() === 'button')
              || (normalized.message && /button/i.test(normalized.message));
            if (looksLikeButton) {
              // Fire and forget; backend selects doctor email from staff table
              apiService
                .notifyDoctor({
                  alert_id: normalized.id,
                  patient_id: normalized.patient_id,
                  type: normalized.type,
                  message: normalized.message,
                })
                .catch((e) => console.warn('[notifyDoctor] failed', e));
            }
          } catch {}
        });
        socket.on('vitals', (data: any) => {
          try {
            if (data && (typeof data.heart_rate !== 'undefined' || typeof data.spo2 !== 'undefined')) {
              const pid = (patients && patients[0] && patients[0].id) ? patients[0].id : (data.patient_id || 'unknown');
              const v: Vital = {
                id: Date.now(),
                patient_id: pid,
                heart_rate: typeof data.heart_rate === 'number' ? data.heart_rate : null as any,
                spo2: typeof data.spo2 === 'number' ? data.spo2 : null as any,
                timestamp: data.timestamp || new Date().toISOString(),
                name: undefined,
                room: undefined,
              } as unknown as Vital;
              setVitals(prev => [v, ...prev].slice(0, 100));
            }
          } catch {}
        });
        cleanup = () => { try { socket.close(); } catch {} };
      } catch (e) {
        console.warn('[Dashboard] socket.io-client not available', e);
      }
    })();
    return () => { if (cleanup) cleanup(); };
  }, [patients]);

  const rows = useMemo(() => {
    const pMap = new Map(patients.map(p => [p.id, p] as const));
    const rMap = new Map(rooms.map(r => [r.id, r] as const));
    const vitalsRows = vitals.map(v => {
      const p = pMap.get(v.patient_id);
      const roomId = p?.room || v.room;
      const r = roomId ? rMap.get(roomId) : undefined;
      return {
        key: `v-${v.id}`,
        kind: 'vital' as const,
        time: new Date(v.timestamp),
        patient: p?.name || v.name || v.patient_id,
        room: roomId || '-',
        floor: typeof r?.floor === 'number' ? r?.floor : undefined,
        hr: v.heart_rate,
        spo2: v.spo2,
        severity: undefined as string | undefined,
      };
    });
    const alertRows = alerts.map(a => {
      const p = pMap.get(a.patient_id);
      const roomId = p?.room || a.room;
      const r = roomId ? rMap.get(roomId!) : undefined;
      return {
        key: `a-${a.id}`,
        kind: 'alert' as const,
        time: new Date(a.timestamp),
        patient: p?.name || a.name || a.patient_id,
        room: roomId || '-',
        floor: typeof r?.floor === 'number' ? r?.floor : undefined,
        hr: a.heart_rate as number | undefined,
        spo2: a.spo2 as number | undefined,
        severity: a.severity,
      };
    });
    return [...vitalsRows, ...alertRows]
      .sort((a, b) => b.time.getTime() - a.time.getTime())
      .slice(0, 20);
  }, [vitals, alerts, patients, rooms]);

  const [page, setPage] = useState(1);
  const pageSize = 10;
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  useEffect(() => { setPage(1); }, [total]);
  const start = (page - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);

  

  // Dynamic system status signals (computed from live data)
  const latestVitalAt = useMemo(() => (
    vitals.length ? Math.max(...vitals.map(v => new Date(v.timestamp).getTime())) : null
  ), [vitals]);

  const latestAlertAt = useMemo(() => (
    alerts.length ? Math.max(...alerts.map(a => new Date(a.timestamp).getTime())) : null
  ), [alerts]);

  const nowTs = Date.now();
  const vitalAgeMs = latestVitalAt ? nowTs - latestVitalAt : Infinity;
  const alertAgeMs = latestAlertAt ? nowTs - latestAlertAt : Infinity;

  const sensorStatus = useMemo(() => (
    vitalAgeMs <= 60_000 ? { label: 'Active', color: 'emerald' } : { label: 'Inactive', color: 'rose' }
  ), [vitalAgeMs]);

  const alertButtonStatus = useMemo(() => (
    alertAgeMs <= 10 * 60_000 ? { label: 'Operational', color: 'emerald' } : { label: 'Idle', color: 'slate' }
  ), [alertAgeMs]);

  const networkStatus = useMemo(() => {
    const age = Math.min(vitalAgeMs, alertAgeMs);
    if (age <= 30_000) return { label: 'Good', color: 'emerald' } as const;
    if (age <= 2 * 60_000) return { label: 'Fair', color: 'amber' } as const;
    if (age <= 5 * 60_000) return { label: 'Weak', color: 'amber' } as const;
    return { label: 'Down', color: 'rose' } as const;
  }, [vitalAgeMs, alertAgeMs]);

  const serverStatus = useMemo(() => (
    stats ? { label: 'Online', color: 'emerald' } : { label: 'Offline', color: 'rose' }
  ), [stats]);

  const databaseStatus = useMemo(() => (
    Array.isArray(patients) ? { label: 'Connected', color: 'emerald' } : { label: 'Disconnected', color: 'rose' }
  ), [patients]);

  const chipClass = (tone: string) => {
    switch (tone) {
      case 'emerald':
        return 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400';
      case 'amber':
        return 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400';
      case 'rose':
        return 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400';
      default:
        return 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300';
    }
  };

  const statCards = [
    { 
      label: 'Total Patients', 
      value: stats ? stats.totalPatients.toString() : '-', 
      change: '', 
      icon: Users,
      gradient: 'from-blue-500 to-cyan-500',
      bgGradient: 'from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20'
    },
    { 
      label: 'Active Monitors', 
      value: stats ? stats.activeMonitors.toString() : '-', 
      change: '', 
      icon: Activity,
      gradient: 'from-emerald-500 to-green-500',
      bgGradient: 'from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20'
    },
    { 
      label: 'Critical Alerts', 
      value: stats ? stats.criticalAlerts.toString() : '-', 
      change: '', 
      icon: AlertTriangle,
      gradient: 'from-rose-500 to-red-500',
      bgGradient: 'from-rose-50 to-red-50 dark:from-rose-900/20 dark:to-red-900/20'
    },
    { 
      label: 'Avg Response Time', 
      value: '10s', 
      change: '', 
      icon: TrendingUp,
      gradient: 'from-violet-500 to-purple-500',
      bgGradient: 'from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20'
    },
    { 
      label: 'Total Nurses', 
      value: stats ? stats.totalNurses.toString() : '-', 
      change: '', 
      icon: Users,
      gradient: 'from-amber-500 to-orange-500',
      bgGradient: 'from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20'
    },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-4"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-8"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl p-6 h-32 shadow-sm"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50/30 dark:from-gray-900 dark:via-gray-900 dark:to-blue-900/10 p-6 border border-gray-200 dark:border-gray-800 rounded-2xl">
      {/* Header Section */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-gray-800 dark:text-gray-100 mb-3 bg-gradient-to-r from-gray-800 to-gray-600 dark:from-gray-100 dark:to-gray-300 bg-clip-text text-transparent">
              Dashboard Overview
            </h2>
            <p className="text-gray-600 dark:text-gray-300 text-lg font-light">
              Monitor patient vitals and system health in real-time
            </p>
          </div>
          <div className="flex items-center space-x-2 px-4 py-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
            <div className="w-3 h-3 bg-emerald-400 rounded-full animate-pulse"></div>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              System Online
            </span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6 mb-8">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div
              key={index}
              className="group relative bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-2xl hover:scale-105 transition-all duration-300 overflow-hidden"
            >
              {/* Background Gradient Effect */}
              <div className={`absolute inset-0 bg-gradient-to-br ${stat.bgGradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300`}></div>
              
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-6">
                  <div className={`w-14 h-14 bg-gradient-to-br ${stat.gradient} rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                    <Icon className="w-7 h-7 text-white" />
                  </div>
                  <div className="text-right">
                    <div className="w-3 h-3 bg-emerald-400 rounded-full mb-1"></div>
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Live</span>
                  </div>
                </div>
                
                <h3 className="text-4xl font-bold text-gray-800 dark:text-gray-100 mb-2 relative">
                  {stat.value}
                  <div className="absolute -bottom-1 left-0 w-12 h-0.5 bg-gradient-to-r from-transparent via-current to-transparent opacity-50"></div>
                </h3>
                
                <p className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-1">
                  {stat.label}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                  {stat.change || 'Updated just now'}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts & Additional Info Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* System Health Card */}
        <div className="order-2 lg:order-2 bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-lg transition-all duration-300">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100">System Health</h3>
            <span className="px-3 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-xs font-medium rounded-full">
              Live
            </span>
          </div>
          <div className="p-0 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 dark:text-gray-400">
                  <th className="pb-3 font-semibold">Status</th>
                  <th className="pb-3 font-semibold">Component</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                <tr>
                  <td className="py-3">
                    <div className={`inline-flex items-center gap-2 px-2 py-1 rounded-md ${chipClass(sensorStatus.color)}`}>
                      <span>{sensorStatus.color === 'emerald' ? '✅' : '⛔'}</span>
                      <span className="text-xs font-semibold">{sensorStatus.label}</span>
                    </div>
                  </td>
                  <td className="py-3 text-gray-700 dark:text-gray-200">MAX30100 Sensor</td>
                </tr>
                <tr>
                  <td className="py-3">
                    <div className={`inline-flex items-center gap-2 px-2 py-1 rounded-md ${chipClass(alertButtonStatus.color)}`}>
                      <span>{alertButtonStatus.color === 'emerald' ? '✅' : '⏸️'}</span>
                      <span className="text-xs font-semibold">{alertButtonStatus.label}</span>
                    </div>
                  </td>
                  <td className="py-3 text-gray-700 dark:text-gray-200">Alert Button</td>
                </tr>
                <tr>
                  <td className="py-3">
                    <div className={`inline-flex items-center gap-2 px-2 py-1 rounded-md ${chipClass(networkStatus.color)}`}>
                      <span>{networkStatus.color === 'emerald' ? '✅' : networkStatus.color === 'amber' ? '⚠️' : '⛔'}</span>
                      <span className="text-xs font-semibold">{networkStatus.label}</span>
                    </div>
                  </td>
                  <td className="py-3 text-gray-700 dark:text-gray-200">Network</td>
                </tr>
                <tr>
                  <td className="py-3">
                    <div className={`inline-flex items-center gap-2 px-2 py-1 rounded-md ${chipClass(serverStatus.color)}`}>
                      <span>{serverStatus.color === 'emerald' ? '✅' : '⛔'}</span>
                      <span className="text-xs font-semibold">{serverStatus.label}</span>
                    </div>
                  </td>
                  <td className="py-3 text-gray-700 dark:text-gray-200">Server</td>
                </tr>
                <tr>
                  <td className="py-3">
                    <div className={`inline-flex items-center gap-2 px-2 py-1 rounded-md ${chipClass(databaseStatus.color)}`}>
                      <span>{databaseStatus.color === 'emerald' ? '✅' : '⛔'}</span>
                      <span className="text-xs font-semibold">{databaseStatus.label}</span>
                    </div>
                  </td>
                  <td className="py-3 text-gray-700 dark:text-gray-200">Database</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Activity Card */}
        <div className="order-1 lg:order-1 bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-lg transition-all duration-300">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Recent Activity</h3>
            <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs font-medium rounded-full">
              Live
            </span>
          </div>
          <div className="p-0 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 dark:text-gray-400">
                  <th className="pb-3 font-semibold">Time</th>
                  <th className="pb-3 font-semibold">Patient</th>
                  <th className="pb-3 font-semibold">Type</th>
                  <th className="pb-3 font-semibold">Room</th>
                  <th className="pb-3 font-semibold">Heart Rate</th>
                  <th className="pb-3 font-semibold">SpO2</th>
                  <th className="pb-3 font-semibold">Severity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {pageRows.map(r => (
                  <tr key={r.key} className="hover:bg-gray-50/60 dark:hover:bg-gray-700/40">
                    <td className="py-3 text-gray-700 dark:text-gray-200">{r.time.toLocaleString()}</td>
                    <td className="py-3 text-gray-800 dark:text-gray-100 font-medium">{r.patient}</td>
                    <td className="py-3">
                      <span className={`px-2 py-1 rounded-md font-semibold ${r.kind === 'alert' ? 'bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300' : 'bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300'}`}>
                        {r.kind === 'alert' ? 'Alert' : 'Vitals'}
                      </span>
                    </td>
                    <td className="py-3 text-gray-700 dark:text-gray-200">{r.floor !== undefined ? `Floor ${r.floor} • Room ${r.room}` : r.room}</td>
                    <td className="py-3"><span className="px-2 py-1 rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-semibold">{typeof r.hr === 'number' ? `${r.hr} bpm` : '—'}</span></td>
                    <td className="py-3"><span className="px-2 py-1 rounded-md bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-semibold">{typeof r.spo2 === 'number' ? `${r.spo2}%` : '—'}</span></td>
                    <td className="py-3">
                      {r.kind === 'alert' && r.severity ? (
                        <span className={`px-2 py-1 rounded-md font-semibold ${r.severity === 'critical' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'}`}>
                          {r.severity}
                        </span>
                      ) : (
                        <span className="text-gray-700 dark:text-gray-200">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-gray-500 dark:text-gray-400">No recent activity</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm text-gray-600 dark:text-gray-300">
              Page <span className="font-semibold">{page}</span> of <span className="font-semibold">{totalPages}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-700 dark:text-gray-200 disabled:opacity-50"
              >
                Prev
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-700 dark:text-gray-200 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Status Bar */}
      <div className="mt-8 flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-emerald-400 rounded-full"></div>
            <span>All systems operational</span>
          </div>
          <span>•</span>
          <span>Last updated: {new Date().toLocaleTimeString()}</span>
        </div>
        <div className="text-right">
          <span className="font-medium">Healthcare Monitoring System v2.1</span>
        </div>
      </div>
    </div>
  );
}