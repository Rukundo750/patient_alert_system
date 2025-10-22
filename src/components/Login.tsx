import React, { useState } from 'react';
import { useAuth } from './AuthContext';
import { apiService } from '../services/api';
import { Eye, EyeOff, Mail, Lock, User, Shield, ArrowRight, Smartphone, Heart } from 'lucide-react';

export default function Login() {
  const { login } = useAuth();
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [resetIdentifier, setResetIdentifier] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetStatus, setResetStatus] = useState<string | null>(null);
  const [resetStep, setResetStep] = useState<1 | 2 | 3>(1);
  const [resetCode, setResetCode] = useState('');
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [newPassword2, setNewPassword2] = useState('');
  const [role, setRole] = useState<'nurse' | 'admin'>('nurse');

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(usernameOrEmail, password);
    } catch (e: any) {
      setError(e?.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const onForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetStatus(null);
    setResetLoading(true);
    try {
      try {
        await apiService.forgotPassword({ emailOrUsername: resetIdentifier.trim() });
      } catch (_) {}
      setResetStatus('If an account exists, a 6-digit code was sent to the registered email.');
      setResetStep(2);
    } finally {
      setResetLoading(false);
    }
  };

  const onVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetStatus(null);
    setResetLoading(true);
    try {
      const res = await apiService.verifyResetCode({ emailOrUsername: resetIdentifier.trim(), code: resetCode.trim() });
      setResetToken(res.resetToken);
      setResetStatus('Code verified. You can now set a new password.');
      setResetStep(3);
    } catch (err: any) {
      setResetStatus(err?.message || 'Invalid or expired code.');
    } finally {
      setResetLoading(false);
    }
  };

  const onResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetToken && (!resetIdentifier || !resetCode)) {
      setResetStatus('Missing email or code.');
      return;
    }
    if (newPassword.length < 6) {
      setResetStatus('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== newPassword2) {
      setResetStatus('Passwords do not match.');
      return;
    }
    setResetStatus(null);
    setResetLoading(true);
    try {
      if (resetToken) {
        await apiService.resetPassword({ resetToken, newPassword });
      } else {
        await apiService.resetPasswordWithCode({ emailOrUsername: resetIdentifier.trim(), code: resetCode.trim(), newPassword });
      }
      setResetStatus('Password updated successfully. Signing you in...');
      // Prefill login fields and try to auto-login with new password
      setUsernameOrEmail(resetIdentifier);
      setPassword(newPassword);
      try {
        await login(resetIdentifier, newPassword);
      } catch (_) {
        // If auto-login fails, just close reset and let user sign in manually
      }
      setShowForgot(false);
      setResetStep(1);
      setResetIdentifier('');
      setResetCode('');
      setNewPassword('');
      setNewPassword2('');
      setResetToken(null);
    } catch (err: any) {
      setResetStatus(err?.message || 'Failed to update password.');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-emerald-50/20 dark:from-gray-900 dark:via-blue-900/10 dark:to-emerald-900/10 flex items-center justify-center p-4">
      {/* Background Decorative Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-200/20 dark:bg-blue-600/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-emerald-200/20 dark:bg-emerald-600/10 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-purple-200/10 dark:bg-purple-600/5 rounded-full blur-3xl"></div>
      </div>

      <div className="relative w-full max-w-md">
        {/* Header Logo */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center space-x-3 mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center shadow-lg">
              <Heart className="w-7 h-7 text-white" />
            </div>
            <div className="text-left">
              <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-800 to-emerald-600 dark:from-gray-100 dark:to-emerald-400 bg-clip-text text-transparent">
                HealthMonitor
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">Medical Monitoring System</p>
            </div>
          </div>
        </div>

        {/* Login Card */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl p-8 border border-white/20 dark:border-gray-700/50 shadow-2xl shadow-blue-500/10 dark:shadow-black/20 animate-pop-in">
          {/* Role Selection */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Welcome Back</h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Sign in to continue monitoring</p>
            </div>
          </div>

          <div className="mb-6">
            <div className="inline-flex w-full rounded-2xl p-1.5 bg-gray-100/80 dark:bg-gray-700/80 backdrop-blur-sm border border-gray-200/50 dark:border-gray-600/50">
              <button
                type="button"
                onClick={() => setRole('nurse')}
                className={`flex items-center justify-center space-x-2 px-6 py-3 rounded-xl transition-all duration-300 flex-1 ${
                  role === 'nurse'
                    ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-lg shadow-gray-200/50 dark:shadow-black/20'
                    : 'text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100'
                }`}
              >
                <User className="w-4 h-4" />
                <span className="font-medium">Nurse</span>
              </button>
              <button
                type="button"
                onClick={() => setRole('admin')}
                className={`flex items-center justify-center space-x-2 px-6 py-3 rounded-xl transition-all duration-300 flex-1 ${
                  role === 'admin'
                    ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-lg shadow-gray-200/50 dark:shadow-black/20'
                    : 'text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100'
                }`}
              >
                <Shield className="w-4 h-4" />
                <span className="font-medium">Admin</span>
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl text-red-700 dark:text-red-300 text-sm flex items-center space-x-2">
              <div className="w-2 h-2 bg-red-500 rounded-full"></div>
              <span>{error}</span>
            </div>
          )}

          {/* Login Form */}
          {!showForgot ? (
            <form onSubmit={onSubmit} className="space-y-5">
              <div className="space-y-4">
                <div className="relative">
                  <div className="absolute left-4 top-1/2 transform -translate-y-1/2">
                    <Mail className="w-5 h-5 text-gray-400" />
                  </div>
                  <input
                    autoComplete="username"
                    value={usernameOrEmail}
                    onChange={(e) => setUsernameOrEmail(e.target.value)}
                    placeholder={role === 'admin' ? 'admin@hospital.com' : 'nurse@hospital.com or username'}
                    className="w-full pl-12 pr-4 py-4 rounded-2xl border border-gray-300/80 dark:border-gray-600/80 bg-white/50 dark:bg-gray-900/50 focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none backdrop-blur-sm transition-all duration-300 placeholder-gray-400 dark:placeholder-gray-500"
                  />
                </div>

                <div className="relative">
                  <div className="absolute left-4 top-1/2 transform -translate-y-1/2">
                    <Lock className="w-5 h-5 text-gray-400" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full pl-12 pr-12 py-4 rounded-2xl border border-gray-300/80 dark:border-gray-600/80 bg-white/50 dark:bg-gray-900/50 focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none backdrop-blur-sm transition-all duration-300 placeholder-gray-400 dark:placeholder-gray-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <button
                disabled={loading}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 disabled:opacity-60 disabled:hover:scale-100 disabled:hover:shadow-lg transition-all duration-300 flex items-center justify-center space-x-2 group"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Sign in as {role === 'admin' ? 'Administrator' : 'Nurse'}</span>
                    <ArrowRight className="w-5 h-5 transform group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>
          ) : (
            /* Password Reset Flow */
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900/30 dark:to-blue-800/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Smartphone className="w-7 h-7 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">Reset Password</h3>
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                  {resetStep === 1 && 'Enter your email to receive a verification code'}
                  {resetStep === 2 && 'Enter the 6-digit code sent to your email'}
                  {resetStep === 3 && 'Create your new password'}
                </p>
              </div>

              {resetStatus && (
                <div className={`p-4 rounded-2xl text-sm flex items-center space-x-2 ${
                  resetStatus.includes('success') || resetStatus.includes('verified') 
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                    : 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                }`}>
                  <div className={`w-2 h-2 rounded-full ${
                    resetStatus.includes('success') || resetStatus.includes('verified') ? 'bg-emerald-500' : 'bg-blue-500'
                  }`}></div>
                  <span>{resetStatus}</span>
                </div>
              )}

              {resetStep === 1 && (
                <form onSubmit={onForgotSubmit} className="space-y-4">
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      value={resetIdentifier}
                      onChange={(e) => setResetIdentifier(e.target.value)}
                      placeholder="Enter your email or username"
                      className="w-full pl-12 pr-4 py-4 rounded-2xl border border-gray-300/80 dark:border-gray-600/80 bg-white/50 dark:bg-gray-900/50 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none backdrop-blur-sm transition-all duration-300"
                    />
                  </div>
                  <div className="flex space-x-3">
                    <button
                      type="button"
                      onClick={() => setShowForgot(false)}
                      className="flex-1 py-4 rounded-2xl border border-gray-300/80 dark:border-gray-600/80 bg-white/50 dark:bg-gray-900/50 text-gray-700 dark:text-gray-300 hover:bg-gray-50/80 dark:hover:bg-gray-800/80 transition-colors"
                    >
                      Back
                    </button>
                    <button
                      disabled={resetLoading || !resetIdentifier}
                      className="flex-1 py-4 rounded-2xl bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold disabled:opacity-60 transition-all duration-300"
                    >
                      {resetLoading ? 'Sending...' : 'Send Code'}
                    </button>
                  </div>
                </form>
              )}

              {resetStep === 2 && (
                <form onSubmit={onVerifyCode} className="space-y-4">
                  <div>
                    <input
                      value={resetCode}
                      onChange={(e) => setResetCode(e.target.value)}
                      placeholder="Enter 6-digit code"
                      autoComplete="one-time-code"
                      className="w-full px-4 py-4 rounded-2xl border border-gray-300/80 dark:border-gray-600/80 bg-white/50 dark:bg-gray-900/50 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none text-center text-lg font-semibold tracking-widest backdrop-blur-sm"
                      maxLength={6}
                    />
                  </div>
                  <div className="flex space-x-3">
                    <button
                      type="button"
                      onClick={() => setResetStep(1)}
                      className="flex-1 py-4 rounded-2xl border border-gray-300/80 dark:border-gray-600/80 bg-white/50 dark:bg-gray-900/50 text-gray-700 dark:text-gray-300 hover:bg-gray-50/80 dark:hover:bg-gray-800/80 transition-colors"
                    >
                      Back
                    </button>
                    <button
                      disabled={resetLoading || !resetCode}
                      className="flex-1 py-4 rounded-2xl bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold disabled:opacity-60 transition-all duration-300"
                    >
                      {resetLoading ? 'Verifying...' : 'Verify Code'}
                    </button>
                  </div>
                </form>
              )}

              {resetStep === 3 && (
                <form onSubmit={onResetPassword} className="space-y-4">
                  <div className="space-y-3">
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="New password"
                        className="w-full pl-12 pr-4 py-4 rounded-2xl border border-gray-300/80 dark:border-gray-600/80 bg-white/50 dark:bg-gray-900/50 focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none backdrop-blur-sm"
                      />
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={newPassword2}
                        onChange={(e) => setNewPassword2(e.target.value)}
                        placeholder="Confirm new password"
                        className="w-full pl-12 pr-4 py-4 rounded-2xl border border-gray-300/80 dark:border-gray-600/80 bg-white/50 dark:bg-gray-900/50 focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none backdrop-blur-sm"
                      />
                    </div>
                  </div>
                  <div className="flex space-x-3">
                    <button
                      type="button"
                      onClick={() => setResetStep(2)}
                      className="flex-1 py-4 rounded-2xl border border-gray-300/80 dark:border-gray-600/80 bg-white/50 dark:bg-gray-900/50 text-gray-700 dark:text-gray-300 hover:bg-gray-50/80 dark:hover:bg-gray-800/80 transition-colors"
                    >
                      Back
                    </button>
                    <button
                      disabled={resetLoading || !newPassword || newPassword !== newPassword2 || newPassword.length < 6}
                      className="flex-1 py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-semibold disabled:opacity-60 transition-all duration-300"
                    >
                      {resetLoading ? 'Updating...' : 'Update Password'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Forgot Password Toggle */}
          {!showForgot && (
            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={() => setShowForgot(true)}
                className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors font-medium"
              >
                Forgot your password?
              </button>
            </div>
          )}

          {/* Security Footer */}
          <div className="mt-8 pt-6 border-t border-gray-200/50 dark:border-gray-700/50">
            <div className="flex items-center justify-center space-x-2 text-xs text-gray-400 dark:text-gray-500">
              <Shield className="w-3 h-3" />
              <span>Secure • HIPAA Compliant • Encrypted</span>
            </div>
          </div>
        </div>

        {/* System Status */}
        <div className="mt-6 text-center">
          <div className="inline-flex items-center space-x-2 px-4 py-2 bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl border border-white/20 dark:border-gray-700/50 shadow-lg">
            <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
            <span className="text-sm text-gray-600 dark:text-gray-400 font-medium">All Systems Operational</span>
          </div>
        </div>
      </div>
    </div>
  );
}