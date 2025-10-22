import { useEffect, useState } from 'react';
import { apiService, Room } from '../services/api';

export default function RoomsView() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [form, setForm] = useState<{ id: string; floor: number; type: string }>({ id: '', floor: 1, type: 'ward' });
  const [hr, setHr] = useState<number | null>(null);
  const [spo2, setSpo2] = useState<number | null>(null);
  const [lastEmergency, setLastEmergency] = useState<string | null>(null);

  useEffect(() => {
    fetchRooms();

    let cleanup: (() => void) | null = null;
    const base = (import.meta as any).env?.VITE_API_BASE || '';
    const url = base || window.location.origin;

    (async () => {
      try {
        const mod = await import('socket.io-client');
        const io = mod.io || (mod as any).default;
        const socket = io(url, { transports: ['websocket', 'polling'] });
        console.log('[IO] connecting to', url);
        socket.on('connect', () => console.log('[IO] connected', socket.id));
        socket.on('disconnect', (reason: string) => console.warn('[IO] disconnected', reason));
        socket.onAny((event: string, ...args: any[]) => {
          try { console.log('[IO] event', event, ...args); } catch {}
        });
        socket.on('vitals', (data: any) => {
          console.log('[IO] vitals', data);
          if (typeof data?.heart_rate !== 'undefined') setHr(Number(data.heart_rate));
          if (typeof data?.spo2 !== 'undefined') setSpo2(Number(data.spo2));
        });
        socket.on('emergency', (data: any) => {
          console.log('[IO] emergency', data);
          if (data && data.message) setLastEmergency(String(data.message));
        });
        socket.on('alerts:new', (data: any) => {
          console.log('[IO] alerts:new', data);
        });
        cleanup = () => { try { socket.close(); } catch {} };
      } catch (e) {
        console.warn('[IO] failed to load socket.io-client, falling back to SSE', e);
        const es = new EventSource(`${base}/api/stream`);
        es.onopen = () => { console.log('[SSE] connected to /api/stream'); };
        es.onmessage = (evt: MessageEvent) => { console.log('[SSE] message', evt.data); };
        es.addEventListener('hello', (evt: MessageEvent) => { console.log('[SSE] hello', evt.data); });
        es.addEventListener('ping', (evt: MessageEvent) => { console.log('[SSE] ping', evt.data); });
        es.addEventListener('vitals', (evt: MessageEvent) => {
          try {
            const data = JSON.parse(evt.data || '{}');
            console.log('[SSE] vitals event', data);
            if (typeof data.heart_rate !== 'undefined') setHr(Number(data.heart_rate));
            if (typeof data.spo2 !== 'undefined') setSpo2(Number(data.spo2));
          } catch {}
        });
        es.addEventListener('emergency', (evt: MessageEvent) => {
          try {
            const data = JSON.parse(evt.data || '{}');
            console.log('[SSE] emergency event', data);
            if (data && data.message) setLastEmergency(String(data.message));
          } catch {}
        });
        es.addEventListener('error', (err) => { console.warn('[SSE] error', err); });
        cleanup = () => { try { es.close(); } catch {} };
      }
    })();

    return () => { if (cleanup) cleanup(); };
  }, []);

  const fetchRooms = async () => {
    try {
      const data = await apiService.getRooms();
      setRooms(data);
    } catch (e) {
      console.error('Failed to fetch rooms', e);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiService.createOrUpdateRoom({ id: form.id, floor: Number(form.floor), type: form.type });
      setForm({ id: '', floor: 1, type: 'ward' });
      fetchRooms();
    } catch (e) {
      console.error('Failed to save room', e);
    }
  };

  const toggleOccupied = async (room: Room) => {
    try {
      await apiService.updateRoom(room.id, { occupied: !room.occupied });
      fetchRooms();
    } catch (e) {
      console.error('Failed to update room', e);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/20 to-indigo-50/30 dark:from-gray-900 dark:via-blue-950/10 dark:to-indigo-950/5 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header Section */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 dark:from-gray-100 dark:to-gray-300 bg-clip-text text-transparent mb-2">
              Room Management
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">
              Manage room availability and patient assignments
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="px-4 py-2 rounded-xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200/60 dark:border-gray-700/60 shadow-sm">
              <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 font-semibold">HR</div>
              <div className="text-xl font-bold text-gray-800 dark:text-gray-100">{hr !== null ? `${Math.round(hr)} bpm` : '--'}</div>
            </div>
            <div className="px-4 py-2 rounded-xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200/60 dark:border-gray-700/60 shadow-sm">
              <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 font-semibold">SpO2</div>
              <div className="text-xl font-bold text-gray-800 dark:text-gray-100">{spo2 !== null ? `${Math.round(spo2)} %` : '--'}</div>
            </div>
            <button
              type="button"
              onClick={fetchRooms}
              className="px-5 py-2.5 rounded-xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200/60 dark:border-gray-700/60 text-gray-700 dark:text-gray-300 shadow-sm hover:shadow-md transition-all duration-200 hover:scale-105 font-medium"
            >
              ↻ Refresh
            </button>
          </div>
        </div>

        {lastEmergency && (
          <div className="mb-6 p-4 rounded-xl border border-red-300/60 dark:border-red-800/60 bg-red-50/70 dark:bg-red-900/20 text-red-700 dark:text-red-300 shadow-sm">
            <div className="text-sm font-semibold">Emergency</div>
            <div className="text-sm">{lastEmergency}</div>
          </div>
        )}

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm p-5 rounded-2xl border border-gray-200/50 dark:border-gray-700/50 shadow-sm">
            <div className="text-2xl font-bold text-gray-800 dark:text-gray-100">{rooms.length}</div>
            <div className="text-sm text-gray-600 dark:text-gray-400 font-medium">Total Rooms</div>
          </div>
          <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm p-5 rounded-2xl border border-gray-200/50 dark:border-gray-700/50 shadow-sm">
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {rooms.filter(r => !r.occupied).length}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400 font-medium">Available</div>
          </div>
          <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm p-5 rounded-2xl border border-gray-200/50 dark:border-gray-700/50 shadow-sm">
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">
              {rooms.filter(r => r.occupied).length}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400 font-medium">Occupied</div>
          </div>
        </div>

        {/* Rooms Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 mb-8">
          {rooms.map((r) => (
            <div 
              key={r.id} 
              className="group bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm p-5 rounded-2xl border border-gray-200/60 dark:border-gray-700/60 shadow-sm hover:shadow-md transition-all duration-300 hover:scale-105"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <div className={`w-3 h-3 rounded-full ${r.occupied ? 'bg-red-500' : 'bg-emerald-500'} shadow-sm`} />
                  <div className="text-lg font-bold text-gray-800 dark:text-gray-100">Room {r.id}</div>
                </div>
                <div className="text-xs font-medium px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 capitalize">
                  {r.type}
                </div>
              </div>
              
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-4 font-medium">
                Floor {r.floor}
              </div>

              {r.patient_id && (
                <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200/50 dark:border-blue-800/50">
                  <div className="text-xs text-blue-600 dark:text-blue-400 font-semibold">Patient</div>
                  <div className="text-sm text-gray-800 dark:text-gray-200 font-medium">{r.patient_id}</div>
                </div>
              )}

              <button
                type="button"
                onClick={() => toggleOccupied(r)}
                className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 backdrop-blur-sm ${
                  r.occupied
                    ? 'bg-red-500/10 hover:bg-red-500/20 text-red-700 dark:text-red-300 border border-red-200/50 dark:border-red-800/50'
                    : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-800/50'
                }`}
              >
                {r.occupied ? 'Mark Available' : 'Mark Occupied'}
              </button>
            </div>
          ))}
        </div>

        {/* Add/Update Room Form */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm p-7 rounded-2xl border border-gray-200/60 dark:border-gray-700/60 shadow-sm">
          <div className="flex items-center space-x-3 mb-6">
            <div className="w-1.5 h-7 bg-gradient-to-b from-emerald-500 to-blue-500 rounded-full" />
            <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">Add / Update Room</h3>
          </div>
          
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">Room ID</label>
              <input
                required
                value={form.id}
                onChange={(e) => setForm({ ...form, id: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300/70 dark:border-gray-600/70 rounded-xl bg-white/50 dark:bg-gray-900/50 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all duration-200 backdrop-blur-sm"
                placeholder="Enter room ID"
              />
            </div>
            
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">Floor</label>
              <input
                type="number"
                required
                value={form.floor}
                onChange={(e) => setForm({ ...form, floor: Number(e.target.value) })}
                className="w-full px-4 py-3 border border-gray-300/70 dark:border-gray-600/70 rounded-xl bg-white/50 dark:bg-gray-900/50 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all duration-200 backdrop-blur-sm"
                min="1"
              />
            </div>
            
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">Room Type</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300/70 dark:border-gray-600/70 rounded-xl bg-white/50 dark:bg-gray-900/50 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all duration-200 backdrop-blur-sm"
              >
                <option value="ward">Ward</option>
                <option value="icu">ICU</option>
                <option value="isolation">Isolation</option>
              </select>
            </div>
            
            <div className="md:col-span-3 flex justify-end">
              <button 
                type="submit" 
                className="px-8 py-3.5 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105"
              >
                Save Room
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}