import { useEffect, useState } from 'react';
import { apiService } from '../services/api';
import { User, Mail, Lock, Save, RotateCcw, Shield, Key } from 'lucide-react';

export default function SettingsView() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [initial, setInitial] = useState<{ username: string; email: string } | null>(null);
  const [form, setForm] = useState<{ username: string; email: string; password: string; confirm: string }>({ username: '', email: '', password: '', confirm: '' });

  useEffect(() => {
    const load = async () => {
      try {
        const me = await apiService.getMe();
        setInitial({ username: me.username, email: me.email });
        setForm((f) => ({ ...f, username: me.username, email: me.email }));
      } catch (e: any) {
        setError('Failed to load profile');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const reset = () => {
    if (initial) {
      setForm({ username: initial.username, email: initial.email, password: '', confirm: '' });
      setError(null);
      setSuccess(null);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (form.password && form.password !== form.confirm) {
      setError('Passwords do not match');
      return;
    }
    setSaving(true);
    try {
      const body: any = { username: form.username, email: form.email };
      if (form.password) body.password = form.password;
      const res = await apiService.updateMe(body);
      setInitial({ username: res.user.username, email: res.user.email });
      setForm((f) => ({ ...f, username: res.user.username, email: res.user.email, password: '', confirm: '' }));
      // Also update local storage user so header/sidebar reflect new username
      try {
        const raw = localStorage.getItem('user');
        if (raw) {
          const u = JSON.parse(raw);
          localStorage.setItem('user', JSON.stringify({ ...u, username: res.user.username }));
        }
      } catch {}
      setSuccess('Profile updated successfully');
    } catch (e: any) {
      setError(e?.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50/30 dark:from-gray-900 dark:via-gray-900 dark:to-blue-900/10 p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-4"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-8"></div>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-xl h-96 shadow-sm"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50/30 dark:from-gray-900 dark:via-gray-900 dark:to-blue-900/10 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold text-gray-800 dark:text-gray-100 mb-3 bg-gradient-to-r from-gray-800 to-purple-600 dark:from-gray-100 dark:to-purple-400 bg-clip-text text-transparent">
                Account Settings
              </h2>
              <p className="text-gray-600 dark:text-gray-300 text-lg font-light">
                Manage your profile and security preferences
              </p>
            </div>
            <div className="flex items-center space-x-2 px-4 py-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
              <Shield className="w-4 h-4 text-emerald-500" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Secure Profile
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Settings Card */}
          <div className="lg:col-span-2">
            <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl p-8 border border-gray-200/60 dark:border-gray-700/60 shadow-lg hover:shadow-xl transition-all duration-300">
              <div className="flex items-center space-x-3 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/20 dark:to-purple-900/20 flex items-center justify-center shadow-lg">
                  <User className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">Profile Information</h3>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">Update your personal details</p>
                </div>
              </div>

              <form onSubmit={onSubmit} className="space-y-6">
                {error && (
                  <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl text-red-700 dark:text-red-300 text-sm flex items-center space-x-2">
                    <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                    <span>{error}</span>
                  </div>
                )}

                {success && (
                  <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-2xl text-emerald-700 dark:text-emerald-300 text-sm flex items-center space-x-2">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                    <span>{success}</span>
                  </div>
                )}

                <div className="space-y-4">
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
                      <User className="w-5 h-5 text-gray-400" />
                    </div>
                    <input
                      value={form.username}
                      onChange={(e) => setForm({ ...form, username: e.target.value })}
                      placeholder="Enter your username"
                      className="w-full pl-11 pr-4 py-4 rounded-2xl border border-gray-300/80 dark:border-gray-600/80 bg-white/50 dark:bg-gray-900/50 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none backdrop-blur-sm transition-all duration-300"
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
                      placeholder="Enter your email address"
                      className="w-full pl-11 pr-4 py-4 rounded-2xl border border-gray-300/80 dark:border-gray-600/80 bg-white/50 dark:bg-gray-900/50 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none backdrop-blur-sm transition-all duration-300"
                    />
                  </div>
                </div>

                {/* Password Section */}
                <div className="pt-6 border-t border-gray-200/60 dark:border-gray-700/60">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900/20 dark:to-orange-900/20 flex items-center justify-center">
                      <Lock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Change Password</h4>
                      <p className="text-gray-500 dark:text-gray-400 text-sm">Update your security credentials</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
                        <Key className="w-5 h-5 text-gray-400" />
                      </div>
                      <input
                        type="password"
                        value={form.password}
                        onChange={(e) => setForm({ ...form, password: e.target.value })}
                        placeholder="New password"
                        className="w-full pl-11 pr-4 py-4 rounded-2xl border border-gray-300/80 dark:border-gray-600/80 bg-white/50 dark:bg-gray-900/50 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none backdrop-blur-sm transition-all duration-300"
                      />
                    </div>
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
                        <Key className="w-5 h-5 text-gray-400" />
                      </div>
                      <input
                        type="password"
                        value={form.confirm}
                        onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                        placeholder="Confirm new password"
                        className="w-full pl-11 pr-4 py-4 rounded-2xl border border-gray-300/80 dark:border-gray-600/80 bg-white/50 dark:bg-gray-900/50 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none backdrop-blur-sm transition-all duration-300"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    Leave password fields blank to keep your current password
                  </p>
                </div>

                <div className="flex items-center space-x-4 pt-4">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex items-center space-x-2 px-6 py-4 rounded-2xl bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 disabled:opacity-60 disabled:hover:scale-100 disabled:hover:shadow-lg transition-all duration-300"
                  >
                    {saving ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Save className="w-5 h-5" />
                    )}
                    <span>{saving ? 'Saving Changes...' : 'Save Changes'}</span>
                  </button>
                  
                  <button
                    type="button"
                    onClick={reset}
                    disabled={saving}
                    className="flex items-center space-x-2 px-6 py-4 rounded-2xl border border-gray-300/80 dark:border-gray-600/80 bg-white/50 dark:bg-gray-900/50 text-gray-700 dark:text-gray-300 hover:bg-gray-50/80 dark:hover:bg-gray-800/80 transition-all duration-300"
                  >
                    <RotateCcw className="w-5 h-5" />
                    <span>Reset</span>
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Security Info Sidebar */}
          <div className="space-y-6">
            <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl p-6 border border-gray-200/60 dark:border-gray-700/60 shadow-lg">
              <div className="flex items-center space-x-3 mb-4">
                <Shield className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Security Tips</h3>
              </div>
              <div className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
                <div className="flex items-start space-x-2">
                  <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full mt-1.5 flex-shrink-0"></div>
                  <span>Use a strong, unique password</span>
                </div>
                <div className="flex items-start space-x-2">
                  <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full mt-1.5 flex-shrink-0"></div>
                  <span>Keep your email address updated</span>
                </div>
                <div className="flex items-start space-x-2">
                  <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full mt-1.5 flex-shrink-0"></div>
                  <span>Never share your login credentials</span>
                </div>
                <div className="flex items-start space-x-2">
                  <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full mt-1.5 flex-shrink-0"></div>
                  <span>Log out from shared devices</span>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-900/20 dark:to-blue-800/10 rounded-2xl p-6 border border-blue-200/50 dark:border-blue-700/30 shadow-lg">
              <div className="text-center">
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <User className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">Profile Status</h3>
                <div className="flex items-center justify-center space-x-2 text-sm text-emerald-600 dark:text-emerald-400 mb-3">
                  <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
                  <span>Active & Secure</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Last updated: {new Date().toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Status */}
        <div className="mt-8 flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
              <span>Secure connection established</span>
            </div>
            <span>•</span>
            <span>All changes are encrypted</span>
          </div>
          <div className="text-right">
            <span className="font-medium">Account Management</span>
          </div>
        </div>
      </div>
    </div>
  );
}