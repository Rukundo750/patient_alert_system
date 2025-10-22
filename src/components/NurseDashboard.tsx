import { useEffect, useMemo, useState } from 'react';
import AlertsView from './AlertsView';
import { Activity, Shield, Users, Clock } from 'lucide-react';
import { apiService, Vital, Patient, Room, Alert } from '../services/api';
import ChartsView from './ChartsView';

export default function NurseDashboard() {
  const [vitals, setVitals] = useState<Vital[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    let mounted = true;
    const fetchAll = async () => {
      try {
        const [vs, ps, rs, als] = await Promise.all([
          apiService.getVitals(),
          apiService.getPatients(),
          apiService.getRooms(),
          apiService.getAlerts(),
        ]);
        if (!mounted) return;
        setVitals(vs);
        setPatients(ps);
        setRooms(rs);
        setAlerts(als);
      } catch (e) {}
    };
    fetchAll();
    const id = setInterval(fetchAll, 3000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  // Realtime: subscribe to server-sent events for new alerts and live vitals
  useEffect(() => {
    const es = new EventSource('http://localhost:3001/api/stream');
    const onAlert = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data || '{}');
        if (data && data.timestamp) {
          // Optimistically add to alerts list
          setAlerts(prev => [{
            id: Date.now(),
            patient_id: data.patient_id || 'unknown',
            type: data.type || 'Alert',
            severity: data.severity || 'high',
            message: data.message || 'New alert',
            heart_rate: data.heart_rate ?? null,
            spo2: data.spo2 ?? null,
            timestamp: data.timestamp,
            acknowledged: false,
            name: undefined,
            room: undefined,
            floor: undefined,
          } as unknown as Alert, ...prev]);
        }
      } catch {}
    };
    es.addEventListener('alerts:new', onAlert as any);
    const onVitals = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data || '{}');
        if (data && (typeof data.heart_rate === 'number' || typeof data.spo2 === 'number')) {
          const pid = (patients && patients[0] && patients[0].id) ? patients[0].id : 'unknown';
          const v: Vital = {
            id: Date.now(),
            patient_id: pid,
            heart_rate: typeof data.heart_rate === 'number' ? data.heart_rate : null as any,
            spo2: typeof data.spo2 === 'number' ? data.spo2 : null as any,
            timestamp: new Date().toISOString(),
            name: undefined,
            room: undefined,
          } as unknown as Vital;
          setVitals(prev => [v, ...prev].slice(0, 100));
        }
      } catch {}
    };
    es.addEventListener('vitals', onVitals as any);
    // Fallback heartbeat/noise ignored
    return () => {
      try { es.close(); } catch {}
    };
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
      .sort((a, b) => b.time.getTime() - a.time.getTime());
  }, [vitals, alerts, patients, rooms]);

  const [page, setPage] = useState(1);
  const pageSize = 10;
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  useEffect(() => { setPage(1); }, [total]);
  const start = (page - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50/30 dark:from-gray-900 dark:via-gray-900 dark:to-blue-900/10 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold text-gray-800 dark:text-gray-100 mb-3 bg-gradient-to-r from-gray-800 to-blue-600 dark:from-gray-100 dark:to-blue-400 bg-clip-text text-transparent">
                Nurse Dashboard
              </h2>
              <p className="text-gray-600 dark:text-gray-300 text-lg font-light">
                Your current alerts and patient notifications
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 px-4 py-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                <div className="w-3 h-3 bg-emerald-400 rounded-full animate-pulse"></div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Active Monitoring
                </span>
              </div>
            </div>
          </div>
        </div>
        {/* Welcome Banner */}
        <div className="bg-gradient-to-r from-blue-500 via-blue-600 to-purple-600 rounded-2xl p-6 mb-8 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="text-white">
              <h3 className="text-xl font-bold mb-2">Welcome to Your Nursing Station</h3>
              <p className="text-blue-100 text-sm">
                Monitor patient vitals, respond to alerts, and provide timely care
              </p>
            </div>
            <div className="flex items-center space-x-2 text-blue-100">
              <Clock className="w-5 h-5" />
              <span className="text-sm font-medium">
                {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        </div>

        {/* Status Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl p-6 border border-gray-200/60 dark:border-gray-700/60 shadow-lg hover:shadow-xl transition-all duration-300 group">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900/20 dark:to-blue-800/20 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                <Activity className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">Active Monitoring</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Real-time patient vitals</p>
              </div>
            </div>
          </div>

          <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl p-6 border border-gray-200/60 dark:border-gray-700/60 shadow-lg hover:shadow-xl transition-all duration-300 group">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-100 to-emerald-200 dark:from-emerald-900/20 dark:to-emerald-800/20 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                <Users className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">Patient Care</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Assigned patients</p>
              </div>
            </div>
          </div>

          <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl p-6 border border-gray-200/60 dark:border-gray-700/60 shadow-lg hover:shadow-xl transition-all duration-300 group">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-100 to-amber-200 dark:from-amber-900/20 dark:to-amber-800/20 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                <Shield className="w-6 h-6 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">Quick Response</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Emergency alerts</p>
              </div>
            </div>
          </div>
        </div>

        {/* Activity and Alerts side-by-side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl border border-gray-200/60 dark:border-gray-700/60 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200/60 dark:border-gray-700/60 bg-gradient-to-r from-gray-50 to-gray-100/50 dark:from-gray-700/50 dark:to-gray-800/50">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/20 dark:to-indigo-900/20 flex items-center justify-center">
                  <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Recent Activity</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Latest patient vitals in real time</p>
                </div>
              </div>
            </div>
            <div className="p-6 overflow-x-auto">
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
                      <td className="py-3 text-gray-700 dark:text-gray-200 capitalize">{r.severity || '—'}</td>
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
            <div className="px-6 pb-6 flex items-center justify-between">
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

          <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl border border-gray-200/60 dark:border-gray-700/60 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200/60 dark:border-gray-700/60 bg-gradient-to-r from-gray-50 to-gray-100/50 dark:from-gray-700/50 dark:to-gray-800/50">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-red-100 to-pink-100 dark:from-red-900/20 dark:to-pink-900/20 flex items-center justify-center">
                  <Activity className="w-4 h-4 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Active Alerts</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Require immediate attention</p>
                </div>
              </div>
            </div>
            <div className="p-6">
              <AlertsView />
            </div>
          </div>
        </div>

        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl border border-gray-200/60 dark:border-gray-700/60 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden mb-8">
          <div className="p-6">
            <ChartsView embedded={true} />
          </div>
        </div>

        {/* Footer Status */}
        <div className="mt-8 flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
              <span>Nurse station operational</span>
            </div>
            <span>•</span>
            <span>Real-time monitoring active</span>
          </div>
          <div className="text-right">
            <span className="font-medium">Nurse Dashboard • Secure Access</span>
          </div>
        </div>
      </div>
    </div>
  );
}