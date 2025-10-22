import { useState, useEffect } from 'react';
import { Heart, Wind, Clock, MapPin, Activity, Battery } from 'lucide-react';
import { apiService, Vital } from '../services/api';

export default function VitalsView() {
  const [vitals, setVitals] = useState<Vital[]>([]);
  const [loading, setLoading] = useState(true);
  const DEFAULT_PATIENT_ID = ((import.meta as any).env?.VITE_DEFAULT_PATIENT_ID as string) || '1200080174397089';
  const [realtime, setRealtime] = useState<{ hr?: number; spo2?: number; ts?: number }>({});
  const [liveFeed, setLiveFeed] = useState<{ ts: number; type: 'hr' | 'spo2'; value: number }[]>([]);
  const [recentDb, setRecentDb] = useState<Vital[]>([]);
  const [history, setHistory] = useState<Vital[]>([]);

  useEffect(() => {
    const fetchVitals = async () => {
      try {
        const data = await apiService.getVitals();
        // Group by patient and get latest vitals
        const latestVitals = data.reduce((acc: { [key: string]: Vital }, vital) => {
          if (!acc[vital.patient_id] || new Date(vital.timestamp) > new Date(acc[vital.patient_id].timestamp)) {
            acc[vital.patient_id] = vital;
          }
          return acc;
        }, {});

        setVitals(Object.values(latestVitals));
      } catch (error) {
        console.error('Error fetching vitals:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchVitals();
    const interval = setInterval(fetchVitals, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Fetch full history list for configured patient
    const fetchHistory = async () => {
      try {
        const data = await apiService.getVitalsByPatient(DEFAULT_PATIENT_ID);
        setHistory(data);
      } catch (e) {
        console.warn('[LiveVitals] failed to fetch patient history', e);
      }
    };
    fetchHistory();
    const iv = setInterval(fetchHistory, 20000);
    return () => clearInterval(iv);
  }, [DEFAULT_PATIENT_ID]);

  useEffect(() => {
    let cleanup: (() => void) | null = null;
    const base = (import.meta as any).env?.VITE_API_BASE || '';
    const url = base || window.location.origin;

    (async () => {
      try {
        const mod = await import('socket.io-client');
        const io = (mod as any).io || (mod as any).default;
        const socket = io(url, { transports: ['websocket', 'polling'] });
        console.log('[IO][VitalsView] connecting to', url);
        socket.on('connect', () => console.log('[IO][VitalsView] connected', socket.id));
        socket.on('disconnect', (reason: string) => console.warn('[IO][VitalsView] disconnected', reason));
        socket.onAny((event: string, ...args: any[]) => {
          try { console.log('[IO][VitalsView] event', event, ...args); } catch {}
        });
        socket.on('vitals', (data: any) => {
          const next: { hr?: number; spo2?: number; ts?: number } = { ...realtime, ts: Date.now() };
          if (typeof data?.heart_rate !== 'undefined') next.hr = Number(data.heart_rate);
          if (typeof data?.spo2 !== 'undefined') next.spo2 = Number(data.spo2);
          setRealtime(next);

          setVitals((prev) => {
            // find existing entry for DEFAULT_PATIENT_ID or create
            const idx = prev.findIndex(v => v.patient_id === DEFAULT_PATIENT_ID);
            const nowIso = new Date().toISOString();
            const current = idx >= 0 ? prev[idx] : ({
              id: 0,
              patient_id: DEFAULT_PATIENT_ID,
              heart_rate: typeof next.hr === 'number' ? next.hr : 0,
              spo2: typeof next.spo2 === 'number' ? next.spo2 : 0,
              timestamp: nowIso,
              name: `Device ${DEFAULT_PATIENT_ID}`,
              room: 'Unknown',
            } as unknown as Vital);

            const updated: Vital = {
              ...current,
              heart_rate: typeof next.hr === 'number' ? next.hr : current.heart_rate,
              spo2: typeof next.spo2 === 'number' ? next.spo2 : current.spo2,
              timestamp: nowIso,
            } as Vital;

            if (idx >= 0) {
              const copy = prev.slice();
              copy[idx] = updated;
              return copy;
            }
            return [updated, ...prev];
          });

          // Append to live feed list (limit 50)
          if (typeof data?.heart_rate !== 'undefined') {
            const entry = { ts: Date.now(), type: 'hr' as const, value: Number(data.heart_rate) };
            setLiveFeed((f) => [entry, ...f].slice(0, 50));
          }
          if (typeof data?.spo2 !== 'undefined') {
            const entry = { ts: Date.now(), type: 'spo2' as const, value: Number(data.spo2) };
            setLiveFeed((f) => [entry, ...f].slice(0, 50));
          }

          // Optimistically append to patient history view
          setHistory((prev) => {
            const nowIso = new Date().toISOString();
            const top: Vital | undefined = prev[0];
            const hrVal = typeof next.hr === 'number' ? next.hr : (top?.heart_rate ?? null);
            const spoVal = typeof next.spo2 === 'number' ? next.spo2 : (top?.spo2 ?? null);
            const row: Vital = {
              id: 0,
              patient_id: DEFAULT_PATIENT_ID,
              heart_rate: hrVal as any,
              spo2: spoVal as any,
              timestamp: nowIso,
              name: `Device ${DEFAULT_PATIENT_ID}`,
              room: top?.room || 'Unknown',
            };
            return [row, ...prev].slice(0, 100);
          });
        });
        cleanup = () => { try { socket.close(); } catch {} };
      } catch (e) {
        console.warn('[LiveVitals] socket.io-client not available', e);
      }
    })();

    return () => { if (cleanup) cleanup(); };
  }, []);

  useEffect(() => {
    // Poll debug recent vitals endpoint to verify DB writes are visible in UI
    const base = (import.meta as any).env?.VITE_API_BASE || 'http://localhost:3001';
    const fetchRecent = async () => {
      try {
        const resp = await fetch(`${base}/api/debug/vitals-recent`);
        if (resp.ok) {
          const rows = await resp.json();
          setRecentDb(rows);
        }
      } catch (e) {
        console.warn('[LiveVitals] failed to fetch recent DB vitals', e);
      }
    };
    fetchRecent();
    const iv = setInterval(fetchRecent, 15000);
    return () => clearInterval(iv);
  }, []);

  const patients = vitals.map(vital => ({
    id: vital.patient_id,
    name: vital.name || 'Unknown',
    room: vital.room || 'Unknown',
    hr: vital.heart_rate,
    spo2: vital.spo2,
    status: vital.heart_rate > 100 || vital.spo2 < 90 ? 'warning' : 'normal',
    lastUpdate: new Date(vital.timestamp),
  }));

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'critical':
        return 'border-l-4 border-l-red-500 bg-gradient-to-r from-red-50 to-white dark:from-red-900/10 dark:to-gray-800 shadow-lg shadow-red-500/10';
      case 'warning':
        return 'border-l-4 border-l-amber-500 bg-gradient-to-r from-amber-50 to-white dark:from-amber-900/10 dark:to-gray-800 shadow-lg shadow-amber-500/10';
      default:
        return 'border-l-4 border-l-emerald-500 bg-gradient-to-r from-emerald-50 to-white dark:from-emerald-900/10 dark:to-gray-800 shadow-lg shadow-emerald-500/10';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'critical':
        return 'bg-red-500 text-white shadow-lg shadow-red-500/30';
      case 'warning':
        return 'bg-amber-500 text-white shadow-lg shadow-amber-500/30';
      default:
        return 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30';
    }
  };

  const getVitalStatus = (type: 'hr' | 'spo2', value: number) => {
    if (type === 'hr') {
      if (value > 100) return { color: 'text-red-600', bg: 'bg-red-500', label: 'High' };
      if (value > 80) return { color: 'text-amber-600', bg: 'bg-amber-500', label: 'Normal' };
      return { color: 'text-emerald-600', bg: 'bg-emerald-500', label: 'Optimal' };
    } else {
      if (value < 90) return { color: 'text-red-600', bg: 'bg-red-500', label: 'Low' };
      if (value < 95) return { color: 'text-amber-600', bg: 'bg-amber-500', label: 'Normal' };
      return { color: 'text-emerald-600', bg: 'bg-emerald-500', label: 'Optimal' };
    }
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'Just now';
    if (minutes === 1) return '1 min ago';
    if (minutes < 60) return `${minutes} mins ago`;
    
    const hours = Math.floor(minutes / 60);
    if (hours === 1) return '1 hour ago';
    if (hours < 24) return `${hours} hours ago`;
    
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50/30 dark:from-gray-900 dark:via-gray-900 dark:to-blue-900/10 p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-4"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-8"></div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl p-6 h-64 shadow-sm"></div>
            ))}
          </div>

      {/* Patient History (API) */}
      <div className="mt-8 bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
        <h3 className="text-lg font-semibold mb-3">Patient History (API) — {DEFAULT_PATIENT_ID}</h3>
        <div className="max-h-72 overflow-auto">
          {history.length === 0 ? (
            <div className="text-gray-500 dark:text-gray-400">No history yet for this patient.</div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-gray-500 dark:text-gray-400">
                  <th className="py-1">Time</th>
                  <th className="py-1">HR</th>
                  <th className="py-1">SpO2</th>
                </tr>
              </thead>
              <tbody>
                {history.map((r, i) => (
                  <tr key={i} className="border-t border-gray-100 dark:border-gray-700/50">
                    <td className="py-1 font-mono">{new Date(r.timestamp).toLocaleString()}</td>
                    <td className="py-1">{r.heart_rate ?? '-'}</td>
                    <td className="py-1">{r.spo2 ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Live Feed and Recent DB Panel */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
          <h3 className="text-lg font-semibold mb-3">Live Feed (Socket.IO)</h3>
          <div className="max-h-64 overflow-auto text-sm space-y-1">
            {liveFeed.length === 0 && (
              <div className="text-gray-500 dark:text-gray-400">No live data yet...</div>
            )}
            {liveFeed.map((e, idx) => (
              <div key={idx} className="flex items-center justify-between">
                <span className="font-mono text-gray-700 dark:text-gray-200">
                  {new Date(e.ts).toLocaleTimeString()} — {e.type.toUpperCase()} {e.value}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
          <h3 className="text-lg font-semibold mb-3">Recent Saved Vitals (DB)</h3>
          <div className="max-h-64 overflow-auto text-sm">
            {recentDb.length === 0 && (
              <div className="text-gray-500 dark:text-gray-400">No recent DB rows...</div>
            )}
            <table className="w-full text-left">
              <thead>
                <tr className="text-xs text-gray-500 dark:text-gray-400">
                  <th className="py-1">Time</th>
                  <th className="py-1">Patient</th>
                  <th className="py-1">HR</th>
                  <th className="py-1">SpO2</th>
                </tr>
              </thead>
              <tbody>
                {recentDb.map((r, i) => (
                  <tr key={i} className="border-t border-gray-100 dark:border-gray-700/50">
                    <td className="py-1 font-mono">{new Date(r.timestamp).toLocaleTimeString()}</td>
                    <td className="py-1">{r.patient_id}</td>
                    <td className="py-1">{r.heart_rate ?? '-'}</td>
                    <td className="py-1">{r.spo2 ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50/30 dark:from-gray-900 dark:via-gray-900 dark:to-blue-900/10 p-6">
      {/* Header Section */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-gray-800 dark:text-gray-100 mb-3 bg-gradient-to-r from-gray-800 to-gray-600 dark:from-gray-100 dark:to-gray-300 bg-clip-text text-transparent">
              Live Vitals Monitoring
            </h2>
            <p className="text-gray-600 dark:text-gray-300 text-lg font-light">
              Real-time patient vital signs from ESP32 devices
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 px-4 py-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
              <div className="w-3 h-3 bg-emerald-400 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {patients.length} Patients Monitoring
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Patient Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-1 xl:grid-cols-2 gap-8">
        {patients.map((patient) => {
          const hrStatus = getVitalStatus('hr', patient.hr);
          const spo2Status = getVitalStatus('spo2', patient.spo2);
          
          return (
            <div
              key={patient.id}
              className={`group relative rounded-2xl p-8 transition-all duration-300 hover:scale-105 hover:shadow-2xl ${getStatusColor(patient.status)}`}
            >
              {/* Patient Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-5">
                  <div className="relative">
                    <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg">
                      <span className="text-white font-semibold text-lg">
                        {patient.name.split(' ').map(n => n[0]).join('')}
                      </span>
                    </div>
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-white dark:bg-gray-800 rounded-full border-2 border-white dark:border-gray-800 flex items-center justify-center">
                      <div className={`w-2.5 h-2.5 rounded-full ${hrStatus.bg} animate-pulse`}></div>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-100">{patient.name}</h3>
                    <div className="flex items-center space-x-4 text-sm text-gray-500 dark:text-gray-400 mt-1">
                      <div className="flex items-center space-x-1">
                        <MapPin className="w-4 h-4" />
                        <span>Room {patient.room}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Battery className="w-4 h-4" />
                        <span>Device Online</span>
                      </div>
                    </div>
                  </div>
                </div>
                <span className={`text-sm px-4 py-2 rounded-full font-semibold ${getStatusBadge(patient.status)}`}>
                  {patient.status.toUpperCase()}
                </span>
              </div>

              {/* Vitals Grid */}
              <div className="grid grid-cols-2 gap-6 mb-8">
                {/* Heart Rate Card */}
                <div className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-all duration-200">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-2">
                      <div className="w-12 h-12 bg-gradient-to-br from-red-100 to-pink-100 rounded-xl flex items-center justify-center shadow-sm">
                        <Heart className="w-6 h-6 text-red-600" />
                      </div>
                      <span className="text-sm font-semibold text-gray-600 dark:text-gray-300">Heart Rate</span>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${hrStatus.color} bg-opacity-10`}>
                      {hrStatus.label}
                    </span>
                  </div>
                  <div className="flex items-baseline space-x-2 mb-4">
                    <span className="text-4xl font-bold text-gray-800 dark:text-gray-100">{patient.hr}</span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">bpm</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                    <div
                      className={`h-3 rounded-full transition-all duration-1000 ${hrStatus.bg} shadow-sm`}
                      style={{ width: `${Math.min((patient.hr / 120) * 100, 100)}%` }}
                    ></div>
                  </div>
                </div>

                {/* SpO2 Card */}
                <div className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-all duration-200">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-2">
                      <div className="w-12 h-12 bg-gradient-to-br from-emerald-100 to-teal-100 rounded-xl flex items-center justify-center shadow-sm">
                        <Wind className="w-6 h-6 text-emerald-600" />
                      </div>
                      <span className="text-sm font-semibold text-gray-600 dark:text-gray-300">SpO2</span>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${spo2Status.color} bg-opacity-10`}>
                      {spo2Status.label}
                    </span>
                  </div>
                  <div className="flex items-baseline space-x-2 mb-4">
                    <span className="text-4xl font-bold text-gray-800 dark:text-gray-100">{patient.spo2}</span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">%</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                    <div
                      className={`h-3 rounded-full transition-all duration-1000 ${spo2Status.bg} shadow-sm`}
                      style={{ width: `${patient.spo2}%` }}
                    ></div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between pt-6 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
                  <Clock className="w-5 h-5" />
                  <span>Updated {formatTime(patient.lastUpdate)}</span>
                </div>
                <div className="flex items-center space-x-1">
                  <Activity className="w-5 h-5 text-emerald-500 animate-pulse" />
                  <span className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">LIVE</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {patients.length === 0 && !loading && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-12 border border-gray-200 dark:border-gray-700 text-center shadow-lg hover:shadow-xl transition-all duration-300 max-w-2xl mx-auto">
          <div className="w-20 h-20 bg-gradient-to-br from-emerald-100 to-teal-100 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg">
            <Heart className="w-10 h-10 text-emerald-600" />
          </div>
          <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-3">No Vitals Available</h3>
          <p className="text-gray-600 dark:text-gray-300 text-lg mb-6">
            Waiting for device data from ESP32 sensors...
          </p>
          <div className="flex items-center justify-center space-x-4 text-sm text-gray-500 dark:text-gray-400">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse"></div>
              <span>Ensure devices are powered on</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
              <span>Check network connectivity</span>
            </div>
          </div>
        </div>
      )}

      {/* System Status Footer */}
      <div className="mt-8 flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
            <span>Real-time monitoring active</span>
          </div>
          <span>•</span>
          <span>Auto-refresh every 30 seconds</span>
        </div>
        <div className="text-right">
          <span className="font-medium">ESP32 Health Monitoring System</span>
        </div>
      </div>
    </div>
  );
}