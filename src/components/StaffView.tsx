import { useEffect, useState } from 'react';
import { UserPlus, Shield, Users, Pencil, Trash2, Check, X, Mail, Key, Search } from 'lucide-react';
import { apiService, StaffMember } from '../services/api';
import { useAuth } from './AuthContext';

export default function StaffView() {
  const { user } = useAuth();
  const [nurses, setNurses] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<{ employe_id: string; username: string; email: string; password?: string }>({ employe_id: '', username: '', email: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const isAdmin = user?.role === 'doctor' && (user as any)?.is_admin;
  const [resetOpen, setResetOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<StaffMember | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  const filteredNurses = nurses.filter(nurse =>
    nurse.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    nurse.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    nurse.employe_id.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const total = filteredNurses.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  const pageData = filteredNurses.slice(start, start + pageSize);

  useEffect(() => { setPage(1); }, [searchTerm, nurses.length]);

  const startEdit = (n: StaffMember) => {
    setEditingId(n.id);
    setEditDraft({ employe_id: n.employe_id, username: n.username, email: n.email });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft({ employe_id: '', username: '', email: '' });
  };

  const saveEdit = async (id: number) => {
    setIsSubmitting(true);
    try {
      await apiService.updateStaff(id, { ...editDraft });
      setNurses(nurses.map(n => n.id === id ? { ...n, employe_id: editDraft.employe_id, username: editDraft.username, email: editDraft.email } : n));
      cancelEdit();
    } catch (e) {
      console.error('Failed to update nurse', e);
      setNurses(nurses.map(n => n.id === id ? { ...n, employe_id: editDraft.employe_id, username: editDraft.username, email: editDraft.email } : n));
      cancelEdit();
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetPassword = (n: StaffMember) => {
    if (!isAdmin) return;
    setResetTarget(n);
    setResetPasswordValue('');
    setResetOpen(true);
  };

  const submitReset = async () => {
    if (!isAdmin || !resetTarget || !resetPasswordValue) return;
    setResetLoading(true);
    try {
      await apiService.updateStaff(resetTarget.id, { password: resetPasswordValue });
      setResetOpen(false);
      setResetTarget(null);
      setResetPasswordValue('');
    } catch (e) {
      console.error('Failed to reset password', e);
    } finally {
      setResetLoading(false);
    }
  };

  const remove = async (id: number) => {
    const ok = confirm('Are you sure you want to delete this nurse? This action cannot be undone.');
    if (!ok) return;
    try {
      await apiService.deleteStaff(id);
      setNurses(nurses.filter(n => n.id !== id));
    } catch (e) {
      console.error('Failed to delete nurse', e);
      setNurses(nurses.filter(n => n.id !== id));
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        const ns = await apiService.getStaff('nurse');
        setNurses(ns);
      } catch (e) {
        console.error('Failed to load nurses', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    setIsSubmitting(true);
    try {
      const created = await apiService.createStaff({ username: form.username, email: form.email, password: form.password, role: 'nurse' });
      setNurses([created, ...nurses]);
      setForm({ username: '', email: '', password: '' });
    } catch (e) {
      console.error('Failed to create nurse', e);
      // optimistic fallback
      const optimistic: StaffMember = { id: Date.now(), employe_id: 'EMP-' + Math.random().toString(36).slice(2,8).toUpperCase(), username: form.username, email: form.email, role: 'nurse', is_admin: 0 } as any;
      setNurses([optimistic, ...nurses]);
      setForm({ username: '', email: '', password: '' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50/30 dark:from-gray-900 dark:via-gray-900 dark:to-blue-900/10 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-gray-800 dark:text-gray-100 mb-3 bg-gradient-to-r from-gray-800 to-red-600 dark:from-gray-100 dark:to-red-400 bg-clip-text text-transparent">
              Staff Management
            </h2>
            <p className="text-gray-600 dark:text-gray-300 text-lg">Access restricted to authorized administrators only.</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 border border-gray-200 dark:border-gray-700 text-center shadow-lg">
            <div className="w-20 h-20 bg-gradient-to-br from-red-100 to-pink-100 dark:from-red-900/20 dark:to-pink-900/20 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <Shield className="w-10 h-10 text-red-600 dark:text-red-400" />
            </div>
            <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-3">Access Denied</h3>
            <p className="text-gray-600 dark:text-gray-300 text-lg mb-6">
              Only doctor administrators can manage staff accounts.
            </p>
            <div className="flex items-center justify-center space-x-4 text-sm text-gray-500 dark:text-gray-400">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-red-400 rounded-full"></div>
                <span>Administrative privileges required</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50/30 dark:from-gray-900 dark:via-gray-900 dark:to-blue-900/10 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold text-gray-800 dark:text-gray-100 mb-3 bg-gradient-to-r from-gray-800 to-purple-600 dark:from-gray-100 dark:to-purple-400 bg-clip-text text-transparent">
                Staff Management
              </h2>
              <p className="text-gray-600 dark:text-gray-300 text-lg font-light">
                Register and manage nursing staff accounts
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 px-4 py-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                <div className="w-3 h-3 bg-emerald-400 rounded-full animate-pulse"></div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {nurses.length} Staff Members
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          {/* Registration Card */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-lg hover:shadow-xl transition-all duration-300">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg">
                <UserPlus className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">Register New Nurse</h3>
                <p className="text-gray-500 dark:text-gray-400 text-sm">Create new nursing staff account</p>
              </div>
            </div>
            
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-3">
                {/* Employee ID auto-generated on server; no manual input required */}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
                      <Users className="w-5 h-5 text-gray-400" />
                    </div>
                    <input 
                      value={form.username} 
                      onChange={(e) => setForm({ ...form, username: e.target.value })} 
                      placeholder="Username"
                      className="w-full pl-11 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
                      required 
                    />
                  </div>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
                      <Mail className="w-5 h-5 text-gray-400" />
                    </div>
                    <input 
                      type="email" 
                      value={form.email} 
                      onChange={(e) => setForm({ ...form, email: e.target.value })} 
                      placeholder="Email address"
                      className="w-full pl-11 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
                      required 
                    />
                  </div>
                </div>

                <div className="relative">
                  <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
                    <Key className="w-5 h-5 text-gray-400" />
                  </div>
                  <input 
                    type="password" 
                    value={form.password} 
                    onChange={(e) => setForm({ ...form, password: e.target.value })} 
                    placeholder="Password"
                    className="w-full pl-11 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
                    required 
                  />
                </div>
              </div>

              <button 
                type="submit" 
                disabled={isSubmitting}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                {isSubmitting ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <UserPlus className="w-5 h-5" />
                )}
                <span>{isSubmitting ? 'Creating Account...' : 'Create Nurse Account'}</span>
              </button>
            </form>
          </div>

          {/* Staff List Card */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-lg hover:shadow-xl transition-all duration-300">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg">
                <Users className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">Registered Nurses</h3>
                <p className="text-gray-500 dark:text-gray-400 text-sm">Manage existing staff accounts</p>
              </div>
            </div>

            {/* Search Bar */}
            <div className="relative mb-6">
              <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
                <Search className="w-5 h-5 text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Search nurses by name, email, or ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-11 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-900 focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all duration-200"
              />
            </div>

            {loading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-10 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto max-h-96 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-xl">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 font-sans">
                  <thead className="bg-gray-50 dark:bg-gray-900/40">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 dark:text-gray-200">#</th>
                      <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 dark:text-gray-200">Employee ID</th>
                      <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 dark:text-gray-200">Username</th>
                      <th className="px-4 py-3 text-left text-sm font-bold text-gray-700 dark:text-gray-200">Email</th>
                      <th className="px-4 py-3 text-right text-sm font-bold text-gray-700 dark:text-gray-200">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {pageData.map((n, idx) => (
                      <tr key={n.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
                        <td className="px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300">{start + idx + 1}</td>
                        <td className="px-4 py-3 text-sm font-mono font-medium text-gray-900 dark:text-gray-100">
                          {editingId === n.id ? (
                            <input
                              value={editDraft.employe_id}
                              onChange={(e) => setEditDraft({ ...editDraft, employe_id: e.target.value })}
                              className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900"
                              placeholder="Employee ID"
                            />
                          ) : (
                            n.employe_id
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                          {editingId === n.id ? (
                            <input
                              value={editDraft.username}
                              onChange={(e) => setEditDraft({ ...editDraft, username: e.target.value })}
                              className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900"
                              placeholder="Username"
                            />
                          ) : (
                            n.username
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-800 dark:text-gray-100">
                          {editingId === n.id ? (
                            <input
                              value={editDraft.email}
                              onChange={(e) => setEditDraft({ ...editDraft, email: e.target.value })}
                              className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900"
                              placeholder="Email"
                            />
                          ) : (
                            n.email
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-right">
                          {editingId === n.id ? (
                            <div className="inline-flex items-center gap-2">
                              <button
                                onClick={() => saveEdit(n.id)}
                                disabled={isSubmitting}
                                className="inline-flex items-center gap-1 px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50"
                              >
                                <Check className="w-4 h-4" /> {isSubmitting ? 'Saving...' : 'Save'}
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="inline-flex items-center gap-1 px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100 text-xs font-semibold"
                              >
                                <X className="w-4 h-4" /> Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-2">
                              <button
                                onClick={() => startEdit(n)}
                                className="p-2 rounded border border-gray-300 dark:border-gray-600 hover:border-emerald-300 dark:hover:border-emerald-600 text-gray-600 dark:text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => remove(n.id)}
                                className="p-2 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => resetPassword(n)}
                                className="p-2 rounded bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                              >
                                Reset
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {filteredNurses.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                          No nurses found {searchTerm ? '(adjust your search)' : ''}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {/* Pagination Controls */}
                <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-900/40 border-t border-gray-200 dark:border-gray-700">
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
            )}
          </div>
        </div>

        {/* Security Footer */}
        <div className="mt-8 flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Shield className="w-4 h-4" />
              <span>Only doctor administrators can manage staff</span>
            </div>
            <span>•</span>
            <span>All actions are logged for security</span>
          </div>
          <div className="text-right">
            <span className="font-medium">Staff Management System</span>
          </div>
        </div>

        {/* Reset Nurse Password Modal */}
        {resetOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm">
            <div className="flex min-h-screen items-center justify-center p-6">
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-md w-full mx-auto border border-gray-200 dark:border-gray-700 shadow-2xl animate-pop-in">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Reset Password</h3>
                    <p className="text-gray-600 dark:text-gray-300 text-sm mt-1">{`For: ${resetTarget?.username} (${resetTarget?.email})`}</p>
                  </div>
                  <button onClick={() => setResetOpen(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
                    <X className="w-6 h-6 text-gray-500 dark:text-gray-400" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
                      <Key className="w-5 h-5 text-gray-400" />
                    </div>
                    <input
                      type="password"
                      value={resetPasswordValue}
                      onChange={(e) => setResetPasswordValue(e.target.value)}
                      placeholder="Enter new password"
                      autoComplete="new-password"
                      className="w-full pl-11 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
                    />
                  </div>
                </div>

                <div className="mt-6 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setResetOpen(false)}
                    className="flex-1 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={resetLoading || !resetPasswordValue}
                    onClick={submitReset}
                    className="flex-1 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-semibold disabled:opacity-60 transition-all"
                  >
                    {resetLoading ? 'Updating...' : 'Update Password'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}