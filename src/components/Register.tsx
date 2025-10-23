import React, { useState } from 'react';
import { useAuth } from './AuthContext';
import { apiService } from '../services/api';

export default function Register() {
  const { register } = useAuth();
  const [employe_id, setEmployeId] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'doctor' | 'nurse'>('nurse');
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (role === 'nurse') {
        await apiService.registerNurse({ employe_id, username, email, password, phone: phone || null, gender: gender || null });
        // hydrate auth context manually
        await register({ employe_id, username, email, password, role: 'nurse', phone: phone || null, gender: gender || null });
      } else {
        // fallback to context register (requires doctor admin session; mainly for completeness)
        await register({ employe_id, username, email, password, role, phone: phone || null, gender: gender || null });
      }
    } catch (e: any) {
      setError(e?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-24 bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700">
      <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-100">Register</h2>
      {error && <div className="mb-3 text-sm text-red-600">{error}</div>}
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label className="block text-sm mb-1">Employee ID</label>
          <input autoComplete="off" value={employe_id} onChange={(e) => setEmployeId(e.target.value)} className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900" />
        </div>
        <div>
          <label className="block text-sm mb-1">Username</label>
          <input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900" />
        </div>
        <div>
          <label className="block text-sm mb-1">Email</label>
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900" />
        </div>
        <div>
          <label className="block text-sm mb-1">Phone Number</label>
          <input autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900" />
        </div>
        <div>
          <label className="block text-sm mb-1">Gender</label>
          <select value={gender} onChange={(e) => setGender(e.target.value)} className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900">
            <option value="">Select gender</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>
        <div>
          <label className="block text-sm mb-1">Password</label>
          <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900" />
        </div>
        <div>
          <label className="block text-sm mb-1">Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value as any)} className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900">
            <option value="nurse">Nurse</option>
            <option value="doctor">Doctor</option>
          </select>
        </div>
        <button disabled={loading} className="w-full py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60">{loading ? 'Registering...' : 'Register'}</button>
      </form>
    </div>
  );
}
