import { useEffect, useMemo, useState } from 'react';
import { Activity, Users, AlertTriangle, BedDouble, Download, Search } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { apiService, Patient, Vital, Alert, Room, StaffMember } from '../services/api';

type Range = '24h' | '7d' | '30d' | 'all' | 'custom';


export default function ReportsView() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [vitals, setVitals] = useState<Vital[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>('24h');
  const [query, setQuery] = useState('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const now = Date.now();
        let since: string | undefined = undefined;
        let startISO: string | undefined = undefined;
        let endISO: string | undefined = undefined;
        if (range === 'custom') {
          if (startDate && endDate) {
            startISO = new Date(`${startDate}T00:00:00.000Z`).toISOString();
            endISO = new Date(`${endDate}T23:59:59.999Z`).toISOString();
          }
        } else if (range !== 'all') {
          since = new Date(
            range === '24h' ? now - 24 * 60 * 60 * 1000 :
            range === '7d' ? now - 7 * 24 * 60 * 60 * 1000 :
            now - 30 * 24 * 60 * 60 * 1000
          ).toISOString();
        }

        const [pats, vit, alr, rms] = await Promise.all([
          apiService.getPatients(),
          apiService.getVitalsHistory(since, startISO, endISO),
          apiService.getAlertsHistory(since, startISO, endISO),
          apiService.getRooms(),
        ]);
        let st: StaffMember[] = [];
        try {
          st = await apiService.getStaff();
        } catch (_) {
          st = [];
        }
        if (!mounted) return;
        setPatients(pats);
        setVitals(vit);
        setAlerts(alr);
        setRooms(rms);
        setStaff(st || []);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [range, startDate, endDate]);

  const now = new Date();
  const minTime = useMemo(() => {
    if (range === 'custom') {
      if (startDate) return new Date(`${startDate}T00:00:00.000Z`).getTime();
      return 0;
    }
    if (range === 'all') return 0;
    if (range === '24h') return now.getTime() - 24 * 60 * 60 * 1000;
    if (range === '7d') return now.getTime() - 7 * 24 * 60 * 60 * 1000;
    return now.getTime() - 30 * 24 * 60 * 60 * 1000;
  }, [range, startDate]);

  const maxTime = useMemo(() => {
    if (range === 'custom') {
      if (endDate) return new Date(`${endDate}T23:59:59.999Z`).getTime();
      return Number.POSITIVE_INFINITY;
    }
    return Number.POSITIVE_INFINITY;
  }, [range, endDate]);

  const filteredAlerts = useMemo(() => {
    return alerts.filter(a => {
      const t = new Date(a.timestamp).getTime();
      return t >= minTime && t <= maxTime;
    });
  }, [alerts, minTime, maxTime]);

  const filteredVitals = useMemo(() => {
    return vitals.filter(v => {
      const t = new Date(v.timestamp).getTime();
      return t >= minTime && t <= maxTime;
    });
  }, [vitals, minTime, maxTime]);

  const q = query.trim().toLowerCase();
  const patientsByQuery = useMemo(() => {
    if (!q) return patients;
    return patients.filter(p =>
      p.id.toLowerCase().includes(q) ||
      (p.name || '').toLowerCase().includes(q) ||
      (p.room || '').toLowerCase().includes(q)
    );
  }, [patients, q]);

  const kpis = useMemo(() => {
    const totalPatients = patients.length;
    const activeMonitors = new Set(filteredVitals.map(v => v.patient_id)).size;
    const criticalAlerts = filteredAlerts.filter(a => a.severity === 'critical').length;
    const totalRooms = rooms.length;
    const occupiedRooms = rooms.filter(r => r.occupied).length;
    const nurses = staff.filter(s => s.role === 'nurse').length;
    return { totalPatients, activeMonitors, criticalAlerts, totalRooms, occupiedRooms, nurses };
  }, [patients, filteredVitals, filteredAlerts, rooms, staff]);

  const tableRows = useMemo(() => {
    // summarize per patient
    const lastVitalsByPatient = new Map<string, Vital>();
    filteredVitals.forEach(v => {
      const existing = lastVitalsByPatient.get(v.patient_id);
      if (!existing) {
        lastVitalsByPatient.set(v.patient_id, v);
        return;
      }
      const tNew = new Date(v.timestamp).getTime();
      const tOld = new Date(existing.timestamp).getTime();
      if (tNew > tOld) {
        lastVitalsByPatient.set(v.patient_id, v);
      }
    });
    return patientsByQuery.map(p => {
      const lv = lastVitalsByPatient.get(p.id);
      const alertCount = filteredAlerts.filter(a => a.patient_id === p.id).length;
      return {
        patient_id: p.id,
        name: p.name,
        room: p.room || '',
        latest_hr: lv?.heart_rate ?? p.latest_hr ?? '',
        latest_spo2: lv?.spo2 ?? p.latest_spo2 ?? '',
        alerts_last_range: alertCount,
      };
    });
  }, [patientsByQuery, filteredVitals, filteredAlerts]);


  const downloadPDF = () => {
    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();

      const rangeLabel = range === '24h' ? 'Last 24 hours' : range === '7d' ? 'Last 7 days' : range === '30d' ? 'Last 30 days' : range === 'custom' ? `${startDate || '?'} to ${endDate || '?'}` : 'All time';
      const nowStr = new Date().toLocaleString();

      // Simple header (first page)
      doc.setFillColor(16, 24, 39);
      doc.rect(0, 0, pageWidth, 64, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.text('Admin Reports', 40, 28);
      doc.setFontSize(11);
      doc.text(`Range: ${rangeLabel}`, 40, 48);
      doc.text(nowStr, pageWidth - 40, 48, { align: 'right' });

      autoTable(doc, {
        head: [[
          'Patient ID', 'Name', 'Room', 'Latest HR', 'Latest SpO2', 'Alerts (range)'
        ]],
        body: tableRows.map(r => [
          r.patient_id, r.name, r.room, String(r.latest_hr ?? ''), String(r.latest_spo2 ?? ''), String(r.alerts_last_range ?? 0)
        ]),
        startY: 90,
        margin: { top: 90, bottom: 40, left: 40, right: 40 },
        styles: { fontSize: 10, cellPadding: 6 },
        headStyles: { fillColor: [34, 197, 94], textColor: 255, halign: 'left' },
      });

      let y = ((doc as any).lastAutoTable && (doc as any).lastAutoTable.finalY) ? (doc as any).lastAutoTable.finalY + 24 : 120;
      doc.setTextColor(16, 24, 39);
      doc.setFontSize(13);
      doc.text('Detailed Vitals (range)', 40, y);
      y += 8;
      autoTable(doc, {
        head: [['Time', 'Patient', 'Room', 'Heart Rate', 'SpO2']],
        body: filteredVitals.map(v => [
          new Date(v.timestamp).toLocaleString(),
          v.name || v.patient_id,
          v.room || '',
          v.heart_rate ?? '',
          v.spo2 ?? '',
        ]),
        startY: y + 8,
        margin: { left: 40, right: 40 },
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: [59, 130, 246], textColor: 255, halign: 'left' },
      });

      y = ((doc as any).lastAutoTable && (doc as any).lastAutoTable.finalY) ? (doc as any).lastAutoTable.finalY + 24 : y + 120;
      doc.setTextColor(16, 24, 39);
      doc.setFontSize(13);
      doc.text('Detailed Alerts (range)', 40, y);
      y += 8;
      autoTable(doc, {
        head: [['Time', 'Patient', 'Type', 'Severity', 'Message', 'Heart Rate', 'SpO2', 'Acknowledged']],
        body: filteredAlerts.map(a => [
          new Date(a.timestamp).toLocaleString(),
          a.name || a.patient_id,
          a.type,
          a.severity,
          a.message,
          a.heart_rate ?? '',
          a.spo2 ?? '',
          a.acknowledged ? 'Yes' : 'No',
        ]),
        startY: y + 8,
        margin: { left: 40, right: 40 },
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: [251, 146, 60], textColor: 255, halign: 'left' },
      });

      const fileName = `admin_report_${range === 'custom' ? `${startDate || 'start'}_to_${endDate || 'end'}` : range}_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.pdf`;
      doc.save(fileName);
    } catch (e) {
      console.error(e);
      try {
        const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
        doc.setFontSize(14);
        doc.text('Admin Reports (Fallback)', 40, 40);
        doc.setFontSize(10);
        doc.text(`Generated: ${new Date().toLocaleString()}`, 40, 60);
        let y = 90;
        doc.setFont('helvetica', 'bold');
        doc.text('Patient ID', 40, y);
        doc.text('Name', 140, y);
        doc.text('Room', 260, y);
        doc.text('Latest HR', 360, y);
        doc.text('Latest SpO2', 440, y);
        doc.text('Alerts', 540, y);
        doc.setFont('helvetica', 'normal');
        y += 16;
        tableRows.slice(0, 25).forEach(r => {
          doc.text(String(r.patient_id || ''), 40, y);
          doc.text(String(r.name || ''), 140, y);
          doc.text(String(r.room || ''), 260, y);
          doc.text(String(r.latest_hr ?? ''), 360, y);
          doc.text(String(r.latest_spo2 ?? ''), 440, y);
          doc.text(String(r.alerts_last_range ?? 0), 540, y);
          y += 14;
        });
        doc.save(`admin_report_fallback_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.pdf`);
      } catch (e2) {
        alert('Failed to generate PDF. Please try again.');
        console.error('Fallback PDF failed:', e2);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Toolbar card */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 md:p-5 pr-40 md:pr-52">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Admin Reports</h2>
            <p className="text-gray-600 dark:text-gray-300">Exportable reports with filters and KPIs</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search patients by ID, name or room"
                className="h-10 w-72 pl-9 pr-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>
            <select
              value={range}
              onChange={(e) => setRange(e.target.value as Range)}
              className="h-10 w-40 px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            >
              <option value="24h">Last 24h</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="all">All time</option>
              <option value="custom">Custom</option>
            </select>
            {range === 'custom' && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-10 px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
                <span className="text-gray-500">to</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-10 px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>
            )}
            <button onClick={downloadPDF} className="h-10 inline-flex items-center gap-2 px-4 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-sm">
              <Download className="w-4 h-4" /> Export PDF
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="h-40 flex items-center justify-center text-gray-400">Loading…</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500 dark:text-gray-400">Total Patients</span>
                <Users className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">{kpis.totalPatients}</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500 dark:text-gray-400">Active Monitors</span>
                <Activity className="w-4 h-4 text-teal-600" />
              </div>
              <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">{kpis.activeMonitors}</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500 dark:text-gray-400">Critical Alerts</span>
                <AlertTriangle className="w-4 h-4 text-amber-600" />
              </div>
              <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">{kpis.criticalAlerts}</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500 dark:text-gray-400">Rooms (Occupied)</span>
                <BedDouble className="w-4 h-4 text-sky-600" />
              </div>
              <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">{kpis.occupiedRooms}/{kpis.totalRooms}</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500 dark:text-gray-400">Nurses</span>
                <Users className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">{kpis.nurses}</div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="px-5 py-4 text-sm font-medium text-gray-700 dark:text-gray-200">Patients Summary</div>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                  <tr className="text-left text-gray-600 dark:text-gray-300">
                    <th className="py-3 pl-5 pr-4">Patient ID</th>
                    <th className="py-3 pr-4">Name</th>
                    <th className="py-3 pr-4">Room</th>
                    <th className="py-3 pr-4">Latest HR</th>
                    <th className="py-3 pr-4">Latest SpO2</th>
                    <th className="py-3 pr-4">Alerts (range)</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-gray-400">No data</td>
                    </tr>
                  ) : (
                    tableRows.map((r, idx) => (
                      <tr key={`${r.patient_id}-${idx}`} className={`${idx % 2 === 1 ? 'bg-gray-50/40 dark:bg-gray-900/40' : ''} border-t border-gray-100 dark:border-gray-800`}>
                        <td className="py-3 pl-5 pr-4 text-gray-900 dark:text-gray-100">{r.patient_id}</td>
                        <td className="py-3 pr-4">{r.name}</td>
                        <td className="py-3 pr-4">{r.room}</td>
                        <td className="py-3 pr-4">{r.latest_hr}</td>
                        <td className="py-3 pr-4">{r.latest_spo2}</td>
                        <td className="py-3 pr-4">{r.alerts_last_range}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
