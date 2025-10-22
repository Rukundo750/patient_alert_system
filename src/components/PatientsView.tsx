import { useState, useEffect } from 'react';
import { UserPlus, Phone, MapPin, X, Pencil, Trash2, Eye, Activity, AlertTriangle, Users, Shield, Calendar, Wifi } from 'lucide-react';
import { apiService, Patient, StaffMember } from '../services/api';

export default function PatientsView() {
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<Patient | null>(null);
  const [viewVitals, setViewVitals] = useState<any[]>([]);
  const [viewAlerts, setViewAlerts] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [formData, setFormData] = useState({
    id: '',
    name: '',
    contact: '',
    room: '',
    condition: 'stable',
    device_id: '',
  });
  const [availableRooms, setAvailableRooms] = useState<{ id: string; floor?: number; type?: string }[]>([]);
  const [nurses, setNurses] = useState<StaffMember[]>([]);
  const [availableBeds, setAvailableBeds] = useState<string[]>([]);

  const selectedRoom = availableRooms.find(r => r.id === formData.room);
  const isWardSelected = !!selectedRoom && selectedRoom.type === 'ward';

  useEffect(() => {
    const fetchPatients = async () => {
      try {
        const data = await apiService.getPatients();
        setPatients(data);
        // fetch available rooms
        try {
          const rooms = await apiService.getAvailableRooms();
          setAvailableRooms(rooms as any);
        } catch (e) {
          // ignore
        }
        // fetch nurses for assignment (admin only route; backend enforces role)
        try {
          const ns = await apiService.getStaff('nurse');
          setNurses(ns);
        } catch (e) {
          // ignore
        }
      } catch (error) {
        console.error('Error fetching patients:', error);
        // Fallback to static data if API fails
        setPatients([
          { id: 'P001', name: 'John Doe', contact: '+1234567890', room: '101', latest_hr: 72, latest_spo2: 98 },
          { id: 'P002', name: 'Jane Smith', contact: '+1234567891', room: '102', latest_hr: 85, latest_spo2: 96 },
        ]);
      } finally {
        setLoading(false);
      }
    };

    fetchPatients();
  }, []);

  useEffect(() => {
    const loadBedsIfWard = async () => {
      try {
        const roomId = formData.room;
        if (!roomId) { setAvailableBeds([]); return; }
        const r = availableRooms.find(r => r.id === roomId);
        if (r && r.type === 'ward') {
          const beds = await apiService.getAvailableBeds();
          setAvailableBeds(beds);
        } else {
          setAvailableBeds([]);
        }
      } catch (_) {
        setAvailableBeds([]);
      }
    };
    loadBedsIfWard();
  }, [formData.room, availableRooms]);

  useEffect(() => {
    let mounted = true;
    const loadDetails = async () => {
      if (!viewing) return;
      try {
        const [vitals, alerts] = await Promise.all([
          apiService.getVitalsByPatient(viewing.id),
          apiService.getAlerts(),
        ]);
        if (!mounted) return;
        setViewVitals(vitals || []);
        setViewAlerts((alerts || []).filter((a: any) => a.patient_id === viewing.id));
      } catch (_) {
        if (!mounted) return;
        setViewVitals([]);
        setViewAlerts([]);
      }
    };
    loadDetails();
    return () => { mounted = false; };
  }, [viewing]);

  const filteredPatients = patients.filter(patient => {
    const matchesSearch = patient.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         patient.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         patient.contact.includes(searchTerm);
    
    if (statusFilter === 'all') return matchesSearch;
    if (statusFilter === 'stable') return matchesSearch && (patient.latest_hr || 0) <= 100 && (patient.latest_spo2 || 0) >= 95;
    if (statusFilter === 'warning') return matchesSearch && ((patient.latest_hr || 0) > 100 || (patient.latest_spo2 || 0) < 95);
    
    return matchesSearch;
  });

  const getPatientStatus = (patient: Patient) => {
    const hr = patient.latest_hr || 0;
    const spo2 = patient.latest_spo2 || 0;
    
    if (hr > 100 || spo2 < 90) return { status: 'critical', color: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50' };
    if (hr > 90 || spo2 < 95) return { status: 'warning', color: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50' };
    return { status: 'stable', color: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50' };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // If registering a new patient into a ward room, enforce bed selection
      if (!editingId && isWardSelected) {
        const bedId = (formData as any).bed_id;
        if (!availableBeds || availableBeds.length === 0) {
          alert('No beds are currently available in this ward.');
          return;
        }
        if (!bedId || bedId === '') {
          alert('Please select a bed for ward rooms.');
          return;
        }
      }
      if (editingId) {
        await apiService.updatePatient(editingId, {
          name: formData.name,
          contact: formData.contact,
          room: formData.room || undefined,
          condition: formData.condition,
          device_id: formData.device_id || undefined,
          assigned_nurse_id: (formData as any)?.assigned_nurse_id ?? undefined,
          bed_id: (formData as any)?.bed_id ?? undefined,
        });
        const refreshed = await apiService.getPatients();
        setPatients(refreshed);
        setEditingId(null);
      } else {
        await apiService.addPatient({ ...(formData as any), bed_id: (formData as any)?.bed_id ?? undefined } as any);
        const refreshed = await apiService.getPatients();
        setPatients(refreshed);
      }
      setFormData({ id: '', name: '', contact: '', room: '', condition: 'stable', device_id: '' });
      setShowModal(false);
    } catch (error) {
      console.error('Error adding patient:', error);
      setFormData({ id: '', name: '', contact: '', room: '', condition: 'stable', device_id: '' });
      setShowModal(false);
    }
  };

  const startEdit = (p: Patient) => {
    setEditingId(p.id);
    setFormData({ 
      id: p.id, 
      name: p.name, 
      contact: p.contact, 
      room: p.room || '', 
      condition: 'stable', 
      device_id: (p as any).device_id || '', 
      ...(p as any).assigned_nurse_id != null ? { assigned_nurse_id: (p as any).assigned_nurse_id } as any : {} 
    } as any);
    setShowModal(true);
  };

  const openView = (p: Patient) => {
    setViewing(p);
  };

  const deletePatient = async (id: string) => {
    const ok = confirm('Are you sure you want to delete this patient? This will also remove their vitals and alerts.');
    if (!ok) return;
    try {
      await apiService.deletePatient(id);
      setPatients(patients.filter(p => p.id !== id));
    } catch (e) {
      console.error('Error deleting patient:', e);
      setPatients(patients.filter(p => p.id !== id));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50/30 dark:from-gray-900 dark:via-gray-900 dark:to-blue-900/10 p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-4"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-8"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl p-6 h-80 shadow-sm"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50/30 dark:from-gray-900 dark:via-gray-900 dark:to-blue-900/10 p-6">
      {/* Header Section */}
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold text-gray-800 dark:text-gray-100 mb-3 bg-gradient-to-r from-gray-800 to-purple-600 dark:from-gray-100 dark:to-purple-400 bg-clip-text text-transparent">
                Patient Management
              </h2>
              <p className="text-gray-600 dark:text-gray-300 text-lg font-light">
                View and manage all registered patients
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 px-4 py-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                <div className="w-3 h-3 bg-emerald-400 rounded-full animate-pulse"></div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {patients.length} Patients
                </span>
              </div>
              <button
                onClick={() => setShowModal(true)}
                className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl hover:shadow-xl transition-all duration-300 shadow-lg hover:scale-105 group"
              >
                <UserPlus className="w-5 h-5 transition-transform group-hover:scale-110" />
                <span className="font-semibold">Add Patient</span>
              </button>
            </div>
          </div>
        </div>

        {/* Filters and Search */}
        <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative">
            <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
              <Users className="w-5 h-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search patients by name, ID, or contact..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200 shadow-sm"
            />
          </div>
          <div className="flex items-center space-x-4">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200 shadow-sm"
            >
              <option value="all">All Patients</option>
              <option value="stable">Stable</option>
              <option value="warning">Needs Attention</option>
            </select>
          </div>
        </div>

        {/* Patient Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPatients.map((patient) => {
            const status = getPatientStatus(patient);
            
            return (
              <div
                key={patient.id}
                className="group relative bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-lg hover:shadow-2xl transition-all duration-300 hover:scale-105"
              >
                {/* Status Indicator */}
                <div className="absolute top-4 right-4 flex items-center space-x-2">
                  <div className={`w-3 h-3 rounded-full ${status.color} animate-pulse`}></div>
                  <span className={`text-xs font-medium ${status.text} px-2 py-1 rounded-full ${status.bg}`}>
                    {status.status.toUpperCase()}
                  </span>
                </div>

                {/* Patient Header */}
                <div className="flex items-center space-x-4 mb-4">
                  <div className="relative">
                    <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg">
                      <span className="text-white font-bold text-lg">
                        {patient.name.split(' ').map(n => n[0]).join('')}
                      </span>
                    </div>
                    <div className="w-8 h-8 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                      <Phone className="w-4 h-4 text-gray-500" />
                    </div>
                    <span className="font-medium">{patient.contact}</span>
                  </div>
                  <div className="flex items-center space-x-3 text-sm text-gray-600 dark:text-gray-300">
                    <div className="w-8 h-8 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                      <MapPin className="w-4 h-4 text-gray-500" />
                    </div>
                    <span className="font-medium">Room {patient.room || 'Unassigned'}</span>
                    {(patient as any).bed_id && (
                      <span className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-2 py-1 rounded-full">
                        Bed: {(patient as any).bed_id}
                      </span>
                    )}
                    {(patient as any).assigned_nurse_username && (
                      <span className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-2 py-1 rounded-full">
                        Nurse: {(patient as any).assigned_nurse_username}
                      </span>
                    )}
                  </div>
                </div>

                {/* Vitals Overview */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 rounded-xl p-3 border border-red-200 dark:border-red-800">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-red-600 dark:text-red-400">Heart Rate</span>
                      <Activity className="w-4 h-4 text-red-500" />
                    </div>
                    <div className="text-2xl font-bold text-gray-800 dark:text-gray-100">
                      {patient.latest_hr || '--'}
                      <span className="text-sm font-normal text-gray-500 ml-1">bpm</span>
                    </div>
                  </div>
                  <div className="bg-gradient-to-br from-teal-50 to-teal-100 dark:from-teal-900/20 dark:to-teal-800/20 rounded-xl p-3 border border-teal-200 dark:border-teal-800">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-teal-600 dark:text-teal-400">SpO2</span>
                      <Activity className="w-4 h-4 text-teal-500" />
                    </div>
                    <div className="text-2xl font-bold text-gray-800 dark:text-gray-100">
                      {patient.latest_spo2 || '--'}
                      <span className="text-sm font-normal text-gray-500 ml-1">%</span>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center space-x-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <button 
                    onClick={() => openView(patient)}
                    className="flex-1 flex items-center justify-center space-x-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors duration-200 group"
                  >
                    <Eye className="w-4 h-4 transition-transform group-hover:scale-110" />
                    <span className="text-sm font-medium">View</span>
                  </button>
                  <button 
                    onClick={() => startEdit(patient)}
                    className="flex-1 flex items-center justify-center space-x-2 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-200 group"
                  >
                    <Pencil className="w-4 h-4 transition-transform group-hover:scale-110" />
                    <span className="text-sm font-medium">Edit</span>
                  </button>
                  <button 
                    onClick={() => deletePatient(patient.id)}
                    className="flex-1 flex items-center justify-center space-x-2 px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors duration-200 group"
                  >
                    <Trash2 className="w-4 h-4 transition-transform group-hover:scale-110" />
                    <span className="text-sm font-medium">Delete</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Empty State */}
        {filteredPatients.length === 0 && !loading && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-12 border border-gray-200 dark:border-gray-700 text-center shadow-lg hover:shadow-xl transition-all duration-300 max-w-2xl mx-auto">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/20 dark:to-purple-900/20 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg">
              <Users className="w-10 h-10 text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-3">No Patients Found</h3>
            <p className="text-gray-600 dark:text-gray-300 text-lg mb-6">
              {searchTerm || statusFilter !== 'all' 
                ? 'Try adjusting your search criteria' 
                : 'Get started by registering your first patient'
              }
            </p>
            {!searchTerm && statusFilter === 'all' && (
              <button
                onClick={() => setShowModal(true)}
                className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl hover:shadow-xl transition-all duration-300 shadow-lg hover:scale-105"
              >
                Register First Patient
              </button>
            )}
          </div>
        )}

        {/* Add/Edit Patient Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-md w-full mx-4 border border-gray-200 dark:border-gray-700 shadow-2xl animate-pop-in">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
                    {editingId ? 'Update Patient' : 'Register Patient'}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-300 text-sm mt-1">
                    {editingId ? 'Update patient information' : 'Add a new patient to the system'}
                  </p>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
                >
                  <X className="w-6 h-6 text-gray-500 dark:text-gray-400" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {!editingId && (
                  <div className="relative">
                    <Shield className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={formData.id}
                      onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                      placeholder="Patient ID"
                      className="w-full pl-11 pr-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
                      required
                    />
                  </div>
                )}

                <div className="relative">
                  <Users className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Full Name"
                    className="w-full pl-11 pr-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
                    required
                  />
                </div>

                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={formData.contact}
                    onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                    placeholder="Contact Number"
                    className="w-full pl-11 pr-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
                    required
                  />
                </div>

                <div className="relative">
                  <Wifi className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="ESP32 Device ID (MAC)"
                    value={formData.device_id}
                    onChange={(e) => setFormData({ ...formData, device_id: e.target.value })}
                    className="w-full pl-11 pr-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                      Assign Nurse
                    </label>
                    <select
                      value={((formData as any).assigned_nurse_id ?? '') as any}
                      onChange={(e) => setFormData({ ...(formData as any), assigned_nurse_id: e.target.value ? Number(e.target.value) : null } as any)}
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
                    >
                      <option value="">Unassigned</option>
                      {nurses.map(n => (
                        <option key={n.id} value={n.id}>{n.username} ({n.employe_id})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                      Room
                    </label>
                    <select
                      value={formData.room}
                      onChange={(e) => setFormData({ ...formData, room: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
                    >
                      <option value="">Auto Assign</option>
                      {availableRooms.map(r => (
                        <option key={r.id} value={r.id}>{`${r.id} — ${r.type || ''} (floor ${r.floor || ''})`}</option>
                      ))}
                    </select>
                    {isWardSelected && (
                      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{availableBeds.length > 0 ? `Available: ${availableBeds.join(', ')}` : 'No beds available'}</p>
                    )}
                  </div>
                  {isWardSelected && !editingId && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                        Bed (Ward)
                      </label>
                      {availableBeds.length > 0 ? (
                        <select
                          value={((formData as any).bed_id ?? '') as any}
                          onChange={(e) => setFormData({ ...(formData as any), bed_id: e.target.value || '' } as any)}
                          required
                          className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
                        >
                          <option value="" disabled>Select a bed</option>
                          {availableBeds.map(b => (
                            <option key={b} value={b}>{b}</option>
                          ))}
                        </select>
                      ) : (
                        <select
                          value=""
                          disabled
                          className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 rounded-xl text-gray-400 dark:text-gray-500"
                        >
                          <option>No beds available</option>
                        </select>
                      )}
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold rounded-xl hover:shadow-xl transition-all duration-300 shadow-lg hover:scale-105"
                >
                  {editingId ? 'Update Patient' : 'Register Patient'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* View Patient Modal */}
        {viewing && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-6xl mx-4 overflow-hidden border border-gray-200 dark:border-gray-700 shadow-2xl max-h-[90vh] overflow-y-auto">
              {/* Header with Gradient */}
              <div className="relative">
                <div className="h-32 bg-gradient-to-r from-emerald-500 via-teal-600 to-cyan-600" />
                <button
                  onClick={() => setViewing(null)}
                  className="absolute top-4 right-4 inline-flex items-center justify-center w-10 h-10 rounded-xl bg-white/90 dark:bg-gray-800/90 border border-gray-200 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-800 transition-colors shadow-lg"
                  aria-label="Close"
                >
                  <X className="w-5 h-5 text-gray-700 dark:text-gray-200" />
                </button>
                <div className="px-8 -mt-16">
                  <div className="flex items-end gap-6">
                    <div className="w-24 h-24 rounded-2xl bg-white dark:bg-gray-800 border-4 border-white dark:border-gray-800 shadow-2xl flex items-center justify-center">
                      <span className="text-3xl font-bold text-emerald-700 dark:text-emerald-300">
                        {viewing.name.charAt(0)}
                      </span>
                    </div>
                    <div className="flex-1 pb-6">
                      <h3 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">{viewing.name}</h3>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-sm bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 px-3 py-1.5 rounded-full font-medium">
                          ID: {viewing.id}
                        </span>
                        {viewing.room && (
                          <span className="text-sm bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 px-3 py-1.5 rounded-full font-medium">
                            Room {viewing.room}
                          </span>
                        )}
                        {((viewing as any).room_floor || (viewing as any).room_type || (viewing as any).bed_id) && (
                          <span className="text-sm bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 px-3 py-1.5 rounded-full font-medium">
                            {`Floor ${((viewing as any).room_floor ?? '-')}`}
                            {((viewing as any).room_type) ? ` · ${String((viewing as any).room_type).toUpperCase()}` : ''}
                            {((viewing as any).bed_id) ? ` · Bed ${(viewing as any).bed_id}` : ''}
                          </span>
                        )}
                        {(viewing as any).device_id && (
                          <span className="text-sm bg-gray-100 text-gray-700 dark:bg-gray-800/60 dark:text-gray-300 px-3 py-1.5 rounded-full font-medium flex items-center gap-1">
                            <Wifi className="w-4 h-4" />
                            Device {(viewing as any).device_id}
                          </span>
                        )}
                        {(viewing as any).assigned_nurse_username && (
                          <span className="text-sm bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 px-3 py-1.5 rounded-full font-medium">
                            Nurse: {(viewing as any).assigned_nurse_username}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Content Grid */}
              <div className="p-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                  {/* Quick Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
                      <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">Contact</div>
                      <div className="flex items-center gap-2 text-gray-900 dark:text-gray-100 font-medium">
                        <Phone className="w-4 h-4 text-blue-500" />
                        {viewing.contact || '-'}
                      </div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
                      <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">Latest HR</div>
                      <div className="flex items-center gap-2 text-gray-900 dark:text-gray-100 font-medium">
                        <Activity className="w-4 h-4 text-red-500" />
                        {viewing.latest_hr ?? '--'} bpm
                      </div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
                      <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">Latest SpO2</div>
                      <div className="flex items-center gap-2 text-gray-900 dark:text-gray-100 font-medium">
                        <Activity className="w-4 h-4 text-teal-500" />
                        {viewing.latest_spo2 ?? '--'} %
                      </div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
                      <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">Recent Alerts</div>
                      <div className="flex items-center gap-2 text-gray-900 dark:text-gray-100 font-medium">
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                        {viewAlerts.length}
                      </div>
                    </div>
                  </div>

                  {/* Recent Vitals Table */}
                  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
                    <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                      <div className="text-lg font-semibold text-gray-800 dark:text-gray-100">Recent Vitals</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        Last {Math.min(viewVitals.length, 10)} records
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/50">
                            <th className="py-4 px-6 font-semibold">Timestamp</th>
                            <th className="py-4 px-6 font-semibold">Heart Rate</th>
                            <th className="py-4 px-6 font-semibold">SpO2</th>
                          </tr>
                        </thead>
                        <tbody>
                          {viewVitals.slice(0, 10).map((v, i) => (
                            <tr key={i} className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                              <td className="py-4 px-6 text-gray-700 dark:text-gray-300">
                                {new Date(v.timestamp).toLocaleString()}
                              </td>
                              <td className="py-4 px-6 font-medium text-gray-900 dark:text-gray-100">
                                {v.heart_rate ?? '-'}
                              </td>
                              <td className="py-4 px-6 font-medium text-gray-900 dark:text-gray-100">
                                {v.spo2 ?? '-'}
                              </td>
                            </tr>
                          ))}
                          {viewVitals.length === 0 && (
                            <tr>
                              <td className="py-8 px-6 text-center text-gray-400 dark:text-gray-500" colSpan={3}>
                                No vitals data available
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Sidebar */}
                <div className="space-y-6">
                  {/* Alerts Panel */}
                  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
                    <div className="p-6 border-b border-gray-100 dark:border-gray-700">
                      <div className="text-lg font-semibold text-gray-800 dark:text-gray-100">Recent Alerts</div>
                    </div>
                    <div className="p-6 space-y-4 max-h-80 overflow-auto">
                      {viewAlerts.length === 0 ? (
                        <div className="text-center py-8 text-gray-400 dark:text-gray-500">
                          <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                          <p>No recent alerts</p>
                        </div>
                      ) : (
                        viewAlerts.slice(0, 10).map((a, i) => (
                          <div key={i} className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-shadow">
                            <div className="flex items-center justify-between mb-2">
                              <div className="text-sm font-medium text-gray-800 dark:text-gray-100">{a.type}</div>
                              <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                                a.severity === 'critical' 
                                  ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                                  : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                              }`}>
                                {a.severity}
                              </span>
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                              {new Date(a.timestamp).toLocaleString()}
                            </div>
                            <div className="text-sm text-gray-700 dark:text-gray-200">{a.message}</div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Nurse Assignment */}
                  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
                    <div className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">Assigned Nurse</div>
                    <div className="text-sm text-gray-700 dark:text-gray-200">{(viewing as any).assigned_nurse_username || 'Unassigned'}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}