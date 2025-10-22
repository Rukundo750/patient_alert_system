import { useState, useEffect } from 'react';
import { AlertTriangle, X, MapPin, Clock, User, Phone, Building, Activity, Heart, Wind, Check } from 'lucide-react';
import { apiService, Alert, Vital, Patient, Room } from '../services/api';

export default function AlertsView() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPatientModal, setShowPatientModal] = useState<{ id: string; name: string } | null>(null);
  const [patientVitals, setPatientVitals] = useState<Vital[]>([]);
  const [patientPlacement, setPatientPlacement] = useState<{ room?: string; floor?: number; type?: string }>({});
  const [patientContact, setPatientContact] = useState<string | undefined>(undefined);
  const [modalLoading, setModalLoading] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 5;

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const data = await apiService.getAlerts();
        setAlerts((prev) => {
          const byId = new Map<number, Alert>();
          // add latest from server
          data.forEach((a) => byId.set(a.id, a));
          // keep acknowledged ones from previous state even if missing from server response
          prev.forEach((a) => {
            if (a.acknowledged) byId.set(a.id, a);
          });
          return Array.from(byId.values());
        });
      } catch (error) {
        console.error('Error fetching alerts:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAlerts();
    const id = setInterval(fetchAlerts, 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    // Reset to first page if data changes or page goes out of range
    const totalPages = Math.max(1, Math.ceil(alerts.length / pageSize));
    if (page > totalPages) setPage(1);
  }, [alerts.length]);

  useEffect(() => {
    let cleanup: (() => void) | null = null;
    const base = (import.meta as any).env?.VITE_API_BASE || '';
    const url = base || window.location.origin;

    (async () => {
      try {
        const mod = await import('socket.io-client');
        const io = (mod as any).io || (mod as any).default;
        const socket = io(url, { transports: ['websocket', 'polling'] });
        socket.on('alerts:new', (data: any) => {
          try {
            const incoming: Partial<Alert> = data || {};
            setAlerts((prev) => {
              const copy = prev.slice();
              const existsIdx = copy.findIndex(a => a.id === (incoming.id as number));
              if (existsIdx >= 0) {
                const merged = { ...copy[existsIdx], ...incoming } as Alert;
                copy[existsIdx] = merged;
                return copy;
              }
              const sev = (incoming.severity as string) ?? ((incoming.type as string) === 'emergency' ? 'critical' : 'warning');
              const normalized: Alert = {
                id: (incoming.id as number) ?? Date.now(),
                patient_id: (incoming.patient_id as string) ?? 'unknown',
                type: (incoming.type as string) ?? 'alert',
                severity: sev,
                message: (incoming.message as string) ?? 'New alert',
                heart_rate: (incoming.heart_rate as number) ?? (copy[0]?.heart_rate ?? 0),
                spo2: (incoming.spo2 as number) ?? (copy[0]?.spo2 ?? 0),
                timestamp: (incoming.timestamp as string) ?? new Date().toISOString(),
                acknowledged: Boolean(incoming.acknowledged) || false,
                name: incoming.name as any,
                room: incoming.room as any,
                floor: incoming.floor as any,
              };
              return [normalized, ...copy];
            });
          } catch {}
        });
        socket.on('alerts:update', (data: any) => {
          try {
            const incoming: Partial<Alert> = data || {};
            if (typeof incoming.id !== 'number') return;
            setAlerts(prev => prev.map(a => a.id === incoming.id ? { ...a, ...incoming } as Alert : a));
          } catch {}
        });
        cleanup = () => { try { socket.close(); } catch {} };
      } catch (e) {
        console.warn('[AlertsView] socket.io-client not available', e);
      }
    })();

    return () => { if (cleanup) cleanup(); };
  }, []);

  const handleAcknowledge = async (alertId: number) => {
    try {
      await apiService.acknowledgeAlert(alertId);
      setAlerts(prev => prev.map(alert => alert.id === alertId ? { ...alert, acknowledged: true } : alert));
    } catch (error) {
      console.error('Error acknowledging alert:', error);
      // Fallback: mark locally if API fails
      setAlerts(prev => prev.map(alert => alert.id === alertId ? { ...alert, acknowledged: true } : alert));
    }
  };

  const openPatient = async (patientId: string, name: string) => {
    setShowPatientModal({ id: patientId, name });
    setModalLoading(true);
    try {
      const [vitals, patients, rooms] = await Promise.all([
        apiService.getVitalsByPatient(patientId),
        apiService.getPatients(),
        apiService.getRooms(),
      ]);
      setPatientVitals(vitals);
      const p = patients.find((x: Patient) => x.id === patientId);
      if (p && p.room) {
        const r = (rooms as Room[]).find((rr) => rr.id === p.room);
        setPatientPlacement({ room: p.room, floor: r?.floor, type: r?.type });
        setPatientContact(p.contact);
      } else {
        setPatientPlacement({});
        setPatientContact(p?.contact);
      }
    } catch (e) {
      console.error('Error loading patient vitals:', e);
      setPatientVitals([]);
      setPatientPlacement({});
      setPatientContact(undefined);
    } finally {
      setModalLoading(false);
    }
  };

  const formatTime = (timestamp: string) => {
    const parseTs = (ts: string) => {
      let s = ts;
      if (s && !s.includes('T')) s = s.replace(' ', 'T');
      if (s && !/[zZ]|[+-]\d\d:?\d\d$/.test(s)) s = s + 'Z';
      const d = new Date(s);
      return isNaN(d.getTime()) ? new Date() : d;
    };

    const now = new Date();
    const alertTime = parseTs(timestamp);
    let diffSec = Math.floor((now.getTime() - alertTime.getTime()) / 1000);
    if (diffSec < 0) diffSec = 0;
    if (diffSec < 60) return 'Just now';
    const diffMins = Math.floor(diffSec / 60);
    if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
    const diffHours = Math.floor(diffMins / 60);
    return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'border-l-4 border-l-red-500 bg-gradient-to-r from-red-50 to-white dark:from-red-900/10 dark:to-gray-800 shadow-lg shadow-red-500/20';
      case 'warning':
        return 'border-l-4 border-l-amber-500 bg-gradient-to-r from-amber-50 to-white dark:from-amber-900/10 dark:to-gray-800 shadow-lg shadow-amber-500/20';
      default:
        return 'border-l-4 border-l-blue-500 bg-gradient-to-r from-blue-50 to-white dark:from-blue-900/10 dark:to-gray-800 shadow-lg shadow-blue-500/20';
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-500 text-white shadow-lg shadow-red-500/30';
      case 'warning':
        return 'bg-amber-500 text-white shadow-lg shadow-amber-500/30';
      default:
        return 'bg-blue-500 text-white shadow-lg shadow-blue-500/30';
    }
  };

  const getVitalStatus = (type: 'hr' | 'spo2', value: number) => {
    if (type === 'hr') {
      if (value > 100) return { color: 'text-red-600', bg: 'bg-red-500' };
      if (value > 80) return { color: 'text-amber-600', bg: 'bg-amber-500' };
      return { color: 'text-emerald-600', bg: 'bg-emerald-500' };
    } else {
      if (value < 90) return { color: 'text-red-600', bg: 'bg-red-500' };
      if (value < 95) return { color: 'text-amber-600', bg: 'bg-amber-500' };
      return { color: 'text-emerald-600', bg: 'bg-emerald-500' };
    }
  };

  if (loading) {
    return (
      <div className="h-screen overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-red-50/30 dark:from-gray-900 dark:via-gray-900 dark:to-red-900/10 p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-4"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-8"></div>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl p-6 h-48 shadow-sm"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-red-50/30 dark:from-gray-900 dark:via-gray-900 dark:to-red-900/10 p-6">
      <div className="max-w-7xl mx-auto">
      {/* Header Section */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-gray-800 dark:text-gray-100 mb-3 bg-gradient-to-r from-gray-800 to-red-600 dark:from-gray-100 dark:to-red-400 bg-clip-text text-transparent">
              Emergency Alerts
            </h2>
            <p className="text-gray-600 dark:text-gray-300 text-lg font-light">
              Critical notifications and patient alerts
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 px-4 py-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
              <div className="w-3 h-3 bg-red-400 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {alerts.filter(a => !a.acknowledged).length} Active Alerts
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Alerts List */}
      <div className="space-y-6">
        {alerts
          .slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize)
          .map((alert) => {
          const hrStatus = getVitalStatus('hr', alert.heart_rate);
          const spo2Status = getVitalStatus('spo2', alert.spo2);
          
          return (
            <div
              key={alert.id}
              className={`group relative rounded-2xl p-6 transition-all duration-300 hover:shadow-xl ${
                alert.acknowledged
                  ? 'border-l-4 border-l-emerald-500 bg-gradient-to-r from-emerald-50 to-white dark:from-emerald-900/10 dark:to-gray-800 shadow-lg shadow-emerald-500/20'
                  : getSeverityColor(alert.severity)
              }`}
            >
              {/* Alert Header */}
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-start space-x-4 flex-1">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg ${
                    alert.acknowledged
                      ? 'bg-emerald-500'
                      : alert.severity === 'critical' 
                        ? 'bg-red-500 animate-pulse' 
                        : 'bg-amber-500'
                  }`}>
                    {alert.acknowledged ? (
                      <Check className="w-7 h-7 text-white" />
                    ) : (
                      <AlertTriangle className="w-7 h-7 text-white" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-3">
                      <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">
                        {alert.name || 'Unknown Patient'}
                      </h3>
                      {!alert.acknowledged && (
                        <span className={`text-xs px-3 py-2 rounded-full font-semibold ${getSeverityBadge(alert.severity)}`}>
                          {alert.severity.toUpperCase()}
                        </span>
                      )}
                      {alert.acknowledged && (
                        <span className="text-xs px-3 py-2 rounded-full font-semibold bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 flex items-center space-x-1">
                          <Check className="w-3 h-3" />
                          <span>ACCEPTED</span>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400 mb-2">
                      <div className="flex items-center space-x-1">
                        <User className="w-4 h-4" />
                        <span>{alert.patient_id}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <MapPin className="w-4 h-4" />
                        <span>Floor {alert.floor ?? '-'} • Room {alert.room ?? '-'}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Activity className="w-4 h-4" />
                        <span className="capitalize">{alert.type}</span>
                      </div>
                    </div>
                    <p className="text-gray-700 dark:text-gray-300 font-medium bg-white/50 dark:bg-gray-700/50 rounded-lg px-3 py-2">
                      {alert.message}
                    </p>
                  </div>
                </div>
                {!alert.acknowledged ? (
                  <button
                    onClick={() => handleAcknowledge(alert.id)}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                  >
                    <X className="w-5 h-5" />
                  </button>
                ) : (
                  <div className="p-2 text-emerald-600">
                    <Check className="w-5 h-5" />
                  </div>
                )}
              </div>

              {/* Vital Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
                <div className="bg-white dark:bg-gray-900 rounded-xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-gray-600 dark:text-gray-300">Heart Rate</span>
                    <div className={`w-2 h-2 rounded-full ${hrStatus.bg} animate-pulse`}></div>
                  </div>
                  <p className={`text-2xl font-bold ${hrStatus.color}`}>
                    {alert.heart_rate} <span className="text-sm font-normal text-gray-500">bpm</span>
                  </p>
                </div>

                <div className="bg-white dark:bg-gray-900 rounded-xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-gray-600 dark:text-gray-300">SpO2</span>
                    <div className={`w-2 h-2 rounded-full ${spo2Status.bg} animate-pulse`}></div>
                  </div>
                  <p className={`text-2xl font-bold ${spo2Status.color}`}>
                    {alert.spo2} <span className="text-sm font-normal text-gray-500">%</span>
                  </p>
                </div>

                <div className="bg-white dark:bg-gray-900 rounded-xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-gray-600 dark:text-gray-300">Time</span>
                    <Clock className="w-4 h-4 text-gray-400" />
                  </div>
                  <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">
                    {formatTime(alert.timestamp)}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col md:flex-row md:space-x-4 space-y-3 md:space-y-0">
                <button
                  type="button"
                  onClick={() => openPatient(alert.patient_id, alert.name || 'Unknown Patient')}
                  className="flex-1 px-6 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-200 shadow-sm hover:shadow-md flex items-center justify-center space-x-2"
                >
                  <User className="w-4 h-4" />
                  <span>View Patient</span>
                </button>
                {!alert.acknowledged ? (
                  <button
                    type="button"
                    onClick={() => handleAcknowledge(alert.id)}
                    className={`flex-1 px-6 py-3 font-semibold rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center space-x-2 bg-orange-600 hover:bg-orange-700 text-white`}
                  >
                    <Check className="w-4 h-4" />
                    <span>Accept</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="flex-1 px-6 py-3 font-semibold rounded-xl transition-all duration-200 shadow-lg flex items-center justify-center space-x-2 bg-emerald-600 text-white opacity-90 cursor-default"
                  >
                    <Check className="w-4 h-4" />
                    <span>Acknowledged</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination Controls */}
      {alerts.length > pageSize && (
        <div className="mt-6 flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 rounded-xl">
          <div className="text-sm text-gray-600 dark:text-gray-300">
            Page <span className="font-semibold">{page}</span> of{' '}
            <span className="font-semibold">{Math.max(1, Math.ceil(alerts.length / pageSize))}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-700 dark:text-gray-200 disabled:opacity-50"
            >
              Prev
            </button>
            <button
              disabled={page >= Math.ceil(alerts.length / pageSize)}
              onClick={() => setPage((p) => Math.min(Math.ceil(alerts.length / pageSize), p + 1))}
              className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-700 dark:text-gray-200 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Empty State */}
      {alerts.filter(a => !a.acknowledged).length === 0 && !loading && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-12 border border-gray-200 dark:border-gray-700 text-center shadow-lg hover:shadow-xl transition-all duration-300 max-w-2xl mx-auto">
          <div className="w-20 h-20 bg-gradient-to-br from-emerald-100 to-teal-100 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg">
            <AlertTriangle className="w-10 h-10 text-emerald-600" />
          </div>
          <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-3">No Active Alerts</h3>
          <p className="text-gray-600 dark:text-gray-300 text-lg mb-6">
            All patients are stable with normal vital signs
          </p>
          <div className="flex items-center justify-center space-x-4 text-sm text-gray-500 dark:text-gray-400">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
              <span>System monitoring active</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
              <span>Auto-refresh enabled</span>
            </div>
          </div>
        </div>
      )}

      {/* Patient Details Modal */}
      {showPatientModal && (
        <div className="fixed inset-0 z-[9999] flex items-stretch justify-end bg-black/60">
          <div className="h-full w-full max-w-xl bg-white dark:bg-gray-800 shadow-2xl p-6 overflow-y-auto rounded-l-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
                  Patient Details
                </h3>
                <p className="text-gray-600 dark:text-gray-300 mt-1">
                  {showPatientModal.name} • {showPatientModal.id}
                </p>
              </div>
              <button 
                onClick={() => setShowPatientModal(null)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
              >
                <X className="w-6 h-6 text-gray-500 dark:text-gray-400" />
              </button>
            </div>

            {modalLoading ? (
              <div className="h-40 flex items-center justify-center text-gray-500">
                <div className="animate-pulse text-center">
                  <Activity className="w-8 h-8 mx-auto mb-2 text-gray-400 animate-spin" />
                  <p>Loading patient details...</p>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Patient Information Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-xl p-4 text-center">
                    <MapPin className="w-6 h-6 text-blue-600 dark:text-blue-400 mx-auto mb-2" />
                    <div className="text-sm text-gray-500 dark:text-gray-400">Room</div>
                    <div className="font-bold text-gray-800 dark:text-gray-100 text-lg">{patientPlacement.room || '—'}</div>
                  </div>
                  <div className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/20 dark:to-amber-800/20 rounded-xl p-4 text-center">
                    <Building className="w-6 h-6 text-amber-600 dark:text-amber-400 mx-auto mb-2" />
                    <div className="text-sm text-gray-500 dark:text-gray-400">Floor</div>
                    <div className="font-bold text-gray-800 dark:text-gray-100 text-lg">
                      {typeof patientPlacement.floor === 'number' ? patientPlacement.floor : '—'}
                    </div>
                  </div>
                  <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 rounded-xl p-4 text-center">
                    <Activity className="w-6 h-6 text-purple-600 dark:text-purple-400 mx-auto mb-2" />
                    <div className="text-sm text-gray-500 dark:text-gray-400">Category</div>
                    <div className="font-bold text-gray-800 dark:text-gray-100 text-lg capitalize">
                      {patientPlacement.type || '—'}
                    </div>
                  </div>
                  <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-800/20 rounded-xl p-4 text-center">
                    <Phone className="w-6 h-6 text-emerald-600 dark:text-emerald-400 mx-auto mb-2" />
                    <div className="text-sm text-gray-500 dark:text-gray-400">Contact</div>
                    <div className="font-bold text-gray-800 dark:text-gray-100 text-lg">{patientContact || '—'}</div>
                  </div>
                </div>

                {/* Vitals History */}
                {patientVitals.length === 0 ? (
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-8 text-center">
                    <Activity className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-500 dark:text-gray-400">No recent vitals data available</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
                      <h4 className="font-bold text-gray-800 dark:text-gray-100 mb-4 flex items-center space-x-2">
                        <Heart className="w-5 h-5 text-red-500" />
                        <span>Recent Heart Rate</span>
                      </h4>
                      <div className="space-y-3 max-h-64 overflow-y-auto">
                        {patientVitals.slice(0, 10).map(v => (
                          <div key={v.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                              {new Date(v.timestamp).toLocaleString()}
                            </span>
                            <span className={`font-semibold ${getVitalStatus('hr', v.heart_rate).color}`}>
                              {v.heart_rate} bpm
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
                      <h4 className="font-bold text-gray-800 dark:text-gray-100 mb-4 flex items-center space-x-2">
                        <Wind className="w-5 h-5 text-emerald-500" />
                        <span>Recent SpO2</span>
                      </h4>
                      <div className="space-y-3 max-h-64 overflow-y-auto">
                        {patientVitals.slice(0, 10).map(v => (
                          <div key={v.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                              {new Date(v.timestamp).toLocaleString()}
                            </span>
                            <span className={`font-semibold ${getVitalStatus('spo2', v.spo2).color}`}>
                              {v.spo2}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* System Status Footer */}
      <div className="mt-8 flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-red-400 rounded-full animate-pulse"></div>
            <span>Real-time alert monitoring active</span>
          </div>
          <span>•</span>
          <span>Auto-refresh every 5 seconds</span>
        </div>
      </div>
      </div>
    </div>
  );
}