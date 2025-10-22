import { useEffect, useMemo, useState } from 'react';
import { Activity, TrendingUp, AlertTriangle, Heart, Wind, Clock, BarChart3 } from 'lucide-react';
import { apiService, Vital, Alert } from '../services/api';

type Point = { x: number; y: number };

function Sparkline({ values, width = 280, height = 120, stroke = '#10b981', title = '' }: { values: number[]; width?: number; height?: number; stroke?: string; title?: string }) {
  const points: Point[] = useMemo(() => {
    if (!values || values.length === 0) return [];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    return values.map((v, i) => ({
      x: (i / Math.max(1, values.length - 1)) * (width - 8) + 4,
      y: height - 4 - ((v - min) / range) * (height - 8),
    }));
  }, [values, width, height]);

  const d = useMemo(() => {
    if (points.length === 0) return '';
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  }, [points]);

  const last = values.length ? values[values.length - 1] : undefined;
  const trend = values.length > 1 ? values[values.length - 1] - values[values.length - 2] : 0;

  return (
    <div className="relative">
      <svg width={width} height={height} className="w-full">
        {/* Background with gradient */}
        <defs>
          <linearGradient id={`gradient-${title}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.1" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        
        <rect x="0" y="0" width={width} height={height} rx="12" className="fill-gray-50/80 dark:fill-gray-700/80" />
        <rect x="0" y="0" width={width} height={height} rx="12" fill={`url(#gradient-${title})`} />
        
        {/* Grid lines */}
        {[25, 50, 75].map(percent => (
          <line
            key={percent}
            x1="0"
            y1={(height * percent) / 100}
            x2={width}
            y2={(height * percent) / 100}
            stroke="currentColor"
            strokeOpacity="0.1"
            strokeWidth="1"
          />
        ))}
        
        {d && (
          <>
            {/* Area fill */}
            <path d={`${d} L ${width - 4} ${height - 4} L 4 ${height - 4} Z`} fill={`url(#gradient-${title})`} />
            {/* Line */}
            <path d={d} fill="none" stroke={stroke} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
        
        {points.length > 0 && (
          <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={4} fill={stroke} stroke="#fff" strokeWidth={2} />
        )}
      </svg>
      
      {/* Current value and trend */}
      {typeof last !== 'undefined' && (
        <div className="absolute top-3 right-3 text-right">
          <div className="text-lg font-bold text-gray-800 dark:text-gray-100">{last}</div>
          <div className={`text-xs font-medium flex items-center justify-end space-x-1 ${
            trend > 0 ? 'text-red-500' : trend < 0 ? 'text-emerald-500' : 'text-gray-500'
          }`}>
            <TrendingUp className={`w-3 h-3 ${trend < 0 ? 'transform rotate-180' : ''}`} />
            <span>{Math.abs(trend).toFixed(1)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function PieChart({ values, colors, labels, size = 160 }: { values: number[]; colors: string[]; labels: string[]; size?: number }) {
  const total = Math.max(0, values.reduce((a, b) => a + b, 0));
  const r = size / 2;
  const cx = r;
  const cy = r;
  let angle = -Math.PI / 2;
  const paths: JSX.Element[] = [];
  
  values.forEach((v, i) => {
    if (v <= 0 || total === 0) return;
    const slice = (v / total) * Math.PI * 2;
    const x1 = cx + r * Math.cos(angle);
    const y1 = cy + r * Math.sin(angle);
    const x2 = cx + r * Math.cos(angle + slice);
    const y2 = cy + r * Math.sin(angle + slice);
    const largeArc = slice > Math.PI ? 1 : 0;
    const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    paths.push(<path key={i} d={d} fill={colors[i] || '#ccc'} />);
    angle += slice;
  });

  return (
    <div className="flex items-center justify-center space-x-6">
      <svg width={size} height={size} className="flex-shrink-0">
        <circle cx={cx} cy={cy} r={r} className="fill-gray-100/80 dark:fill-gray-700/80" />
        {paths}
        <circle cx={cx} cy={cy} r={r * 0.6} className="fill-white dark:fill-gray-800" />
      </svg>
      
      <div className="space-y-3 min-w-0 flex-1">
        {values.map((value, i) => (
          value > 0 && (
            <div key={i} className="flex items-center justify-between space-x-4">
              <div className="flex items-center space-x-3 min-w-0 flex-1">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: colors[i] }}></div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">{labels[i]}</span>
              </div>
              <div className="flex items-center space-x-2 flex-shrink-0">
                <span className="text-sm font-bold text-gray-800 dark:text-gray-100">{value}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  ({total > 0 ? ((value / total) * 100).toFixed(1) : 0}%)
                </span>
              </div>
            </div>
          )
        ))}
      </div>
    </div>
  );
}

export default function ChartsView({ embedded = false }: { embedded?: boolean }) {
  const [vitals, setVitals] = useState<Vital[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'1h' | '6h' | '12h' | '24h'>('12h');

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [v, a] = await Promise.all([
          apiService.getVitals(),
          apiService.getAlerts(),
        ]);
        if (!mounted) return;
        setVitals(v);
        setAlerts(a);
      } catch (e) {
        console.error('Error loading charts data', e);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    // Realtime via Socket.IO
    let cleanup: (() => void) | null = null;
    const base = (import.meta as any).env?.VITE_API_BASE || '';
    const url = base || window.location.origin;
    (async () => {
      try {
        const mod = await import('socket.io-client');
        const io = (mod as any).io || (mod as any).default;
        const socket = io(url, { transports: ['websocket', 'polling'] });
        const onVitals = (data: any) => {
          try {
            if (typeof data?.heart_rate === 'number' || typeof data?.spo2 === 'number') {
              const nowIso = new Date().toISOString();
              const v: Vital = {
                id: Date.now(),
                patient_id: data.patient_id || 'stream',
                heart_rate: typeof data.heart_rate === 'number' ? data.heart_rate : 0,
                spo2: typeof data.spo2 === 'number' ? data.spo2 : 0,
                timestamp: data.timestamp || nowIso,
                name: undefined,
                room: undefined,
              } as unknown as Vital;
              setVitals(prev => [v, ...prev].slice(0, 500));
            }
          } catch {}
        };
        const onAlert = (incoming: any) => {
          try {
            const data = incoming || {};
            if (data && (data.type || data.severity || typeof data.heart_rate === 'number' || typeof data.spo2 === 'number')) {
              const nowIso = data.timestamp || new Date().toISOString();
              const a: Alert = {
                id: (data.id as number) ?? Date.now(),
                patient_id: data.patient_id || 'stream',
                type: data.type || 'Alert',
                severity: data.severity || 'high',
                message: data.message || 'New alert',
                heart_rate: typeof data.heart_rate === 'number' ? data.heart_rate : 0,
                spo2: typeof data.spo2 === 'number' ? data.spo2 : 0,
                timestamp: nowIso,
                acknowledged: Boolean(data.acknowledged) || false,
                name: data.name as any,
                room: data.room as any,
                floor: data.floor as any,
              } as unknown as Alert;
              setAlerts(prev => [a, ...prev].slice(0, 500));
            }
          } catch {}
        };
        socket.on('vitals', onVitals);
        socket.on('alerts:new', onAlert);
        cleanup = () => { try { socket.close(); } catch {} };
      } catch (e) {
        console.warn('[ChartsView] socket.io-client not available', e);
      }
    })();
    return () => { mounted = false; if (cleanup) cleanup(); };
  }, []);

  const filteredVitals = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 
      (timeRange === '1h' ? 60 * 60 * 1000 :
       timeRange === '6h' ? 6 * 60 * 60 * 1000 :
       timeRange === '12h' ? 12 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000));
    
    return vitals.filter(v => new Date(v.timestamp) >= cutoff);
  }, [vitals, timeRange]);

  const seriesHR = useMemo(() => {
    const sorted = [...filteredVitals].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return sorted.map(v => v.heart_rate || 0).slice(-100);
  }, [filteredVitals]);

  const seriesSpO2 = useMemo(() => {
    const sorted = [...filteredVitals].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return sorted.map(v => v.spo2 || 0).slice(-100);
  }, [filteredVitals]);

  const alertBuckets = useMemo(() => {
    const now = new Date();
    const hours = timeRange === '1h' ? 1 : timeRange === '6h' ? 6 : timeRange === '12h' ? 12 : 24;
    const labels: string[] = [];
    const counts: number[] = [];
    
    for (let i = hours - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 60 * 60 * 1000);
      labels.push(`${d.getHours().toString().padStart(2, '0')}:00`);
      counts.push(0);
    }
    
    alerts.forEach(a => {
      const t = new Date(a.timestamp);
      const diffH = Math.floor((now.getTime() - t.getTime()) / (60 * 60 * 1000));
      const idx = hours - 1 - diffH;
      if (idx >= 0 && idx < counts.length) counts[idx]++;
    });
    
    return { labels, counts };
  }, [alerts, timeRange]);

  const pieSegments = useMemo(() => {
    const counts = alertBuckets.counts;
    let low = 0, medium = 0, high = 0, critical = 0;
    counts.forEach(c => {
      if (c < 3) low += 1;
      else if (c >= 3 && c < 7) medium += 1;
      else if (c >= 7 && c < 12) high += 1;
      else critical += 1;
    });
    return { values: [low, medium, high, critical], total: counts.length };
  }, [alertBuckets]);

  const stats = useMemo(() => {
    const hrValues = seriesHR.filter(v => v > 0);
    const spo2Values = seriesSpO2.filter(v => v > 0);
    
    return {
      avgHR: hrValues.length ? (hrValues.reduce((a, b) => a + b, 0) / hrValues.length).toFixed(1) : '--',
      avgSpO2: spo2Values.length ? (spo2Values.reduce((a, b) => a + b, 0) / spo2Values.length).toFixed(1) : '--',
      totalAlerts: alerts.length,
      activePatients: new Set(vitals.map(v => v.patient_id)).size,
    };
  }, [seriesHR, seriesSpO2, alerts, vitals]);

  if (loading) {
    return (
      <div className={`${embedded ? '' : 'min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50/30 dark:from-gray-900 dark:via-gray-900 dark:to-blue-900/10'} p-6`}>
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-4"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-8"></div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl p-6 h-48 shadow-sm"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${embedded ? '' : 'min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50/30 dark:from-gray-900 dark:via-gray-900 dark:to-blue-900/10'} p-6`}>
      <div className="max-w-7xl mx-auto">
        {/* Header Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold text-gray-800 dark:text-gray-100 mb-3 bg-gradient-to-r from-gray-800 to-purple-600 dark:from-gray-100 dark:to-purple-400 bg-clip-text text-transparent">
                Charts Analysis
              </h2>
              <p className="text-gray-600 dark:text-gray-300 text-lg font-light">
                Vital sign monitoring and patient alert trends
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 px-4 py-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                <div className="w-3 h-3 bg-emerald-400 rounded-full animate-pulse"></div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Live Data Streaming
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Time Range Filter */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
              <Clock className="w-4 h-4" />
              <span>Time Range:</span>
            </div>
            <div className="flex items-center space-x-1 bg-white dark:bg-gray-800 rounded-xl p-1 border border-gray-200 dark:border-gray-700 shadow-sm">
              {(['1h', '6h', '12h', '24h'] as const).map(range => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    timeRange === range
                      ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25'
                      : 'text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100'
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>
          
          {/* Stats Overview */}
          <div className="flex items-center space-x-6 text-sm">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-800 dark:text-gray-100">{stats.activePatients}</div>
              <div className="text-gray-500 dark:text-gray-400">Patients</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-800 dark:text-gray-100">{stats.totalAlerts}</div>
              <div className="text-gray-500 dark:text-gray-400">Alerts</div>
            </div>
          </div>
        </div>

        {/* Main Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Heart Rate Chart */}
          <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl p-6 border border-gray-200/60 dark:border-gray-700/60 shadow-lg hover:shadow-xl transition-all duration-300 group">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-100 to-pink-100 dark:from-red-900/20 dark:to-pink-900/20 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                  <Heart className="w-6 h-6 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">Heart Rate</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Real-time monitoring</p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-gray-800 dark:text-gray-100">{stats.avgHR}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Avg bpm</div>
              </div>
            </div>
            {seriesHR.length === 0 ? (
              <div className="h-32 flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No data available</p>
                </div>
              </div>
            ) : (
              <Sparkline values={seriesHR} stroke="#ef4444" title="heart-rate" />
            )}
          </div>

          {/* SpO2 Chart */}
          <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl p-6 border border-gray-200/60 dark:border-gray-700/60 shadow-lg hover:shadow-xl transition-all duration-300 group">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/20 dark:to-teal-900/20 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                  <Wind className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">SpO2 Levels</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Oxygen saturation</p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-gray-800 dark:text-gray-100">{stats.avgSpO2}%</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Avg saturation</div>
              </div>
            </div>
            {seriesSpO2.length === 0 ? (
              <div className="h-32 flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No data available</p>
                </div>
              </div>
            ) : (
              <Sparkline values={seriesSpO2} stroke="#10b981" title="spo2" />
            )}
          </div>

          {/* Alerts Distribution */}
          <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl p-6 border border-gray-200/60 dark:border-gray-700/60 shadow-lg hover:shadow-xl transition-all duration-300 group">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900/20 dark:to-orange-900/20 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                  <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">Alert Distribution</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Last {timeRange}</p>
                </div>
              </div>
            </div>
            {alertBuckets.counts.every(c => c === 0) ? (
              <div className="h-40 flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No alerts recorded</p>
                </div>
              </div>
            ) : (
              <PieChart 
                values={pieSegments.values} 
                colors={["#22c55e", "#eab308", "#f97316", "#ef4444"]}
                labels={["Low Activity", "Medium Activity", "High Activity", "Critical Activity"]}
                size={140}
              />
            )}
          </div>
        </div>

        {/* Detailed Analysis Section */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl p-8 border border-gray-200/60 dark:border-gray-700/60 shadow-lg hover:shadow-xl transition-all duration-300">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">Detailed Analysis</h3>
              <p className="text-gray-500 dark:text-gray-400">Comprehensive vital sign trends and patterns</p>
            </div>
            <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
              <TrendingUp className="w-4 h-4" />
              <span>Last {seriesHR.length} samples</span>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-100 flex items-center space-x-2">
                  <Heart className="w-5 h-5 text-red-500" />
                  <span>Heart Rate Trend</span>
                </h4>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {seriesHR.length} data points
                </div>
              </div>
              {seriesHR.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-gray-400 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-2xl">
                  <div className="text-center">
                    <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No heart rate data available</p>
                  </div>
                </div>
              ) : (
                <div className="bg-gradient-to-br from-red-50/50 to-pink-50/30 dark:from-red-900/10 dark:to-pink-900/5 rounded-2xl p-4 border border-red-100/50 dark:border-red-800/30">
                  <Sparkline values={seriesHR} width={600} height={200} stroke="#ef4444" title="detailed-hr" />
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-100 flex items-center space-x-2">
                  <Wind className="w-5 h-5 text-emerald-500" />
                  <span>SpO2 Trend</span>
                </h4>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {seriesSpO2.length} data points
                </div>
              </div>
              {seriesSpO2.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-gray-400 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-2xl">
                  <div className="text-center">
                    <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No SpO2 data available</p>
                  </div>
                </div>
              ) : (
                <div className="bg-gradient-to-br from-emerald-50/50 to-teal-50/30 dark:from-emerald-900/10 dark:to-teal-900/5 rounded-2xl p-4 border border-emerald-100/50 dark:border-emerald-800/30">
                  <Sparkline values={seriesSpO2} width={600} height={200} stroke="#10b981" title="detailed-spo2" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Status */}
        <div className="mt-8 flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
              <span>Real-time data streaming active</span>
            </div>
            <span>•</span>
            <span>Auto-refresh every 10 seconds</span>
          </div>
          <div className="text-right">
            <span className="font-medium">Analytics Dashboard v2.1</span>
          </div>
        </div>
      </div>
    </div>
  );
}