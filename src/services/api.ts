const envAny = (typeof import.meta !== 'undefined' && (import.meta as any).env) ? (import.meta as any).env : ({} as any);

// Normalize API base URL
let __rawBase = envAny.VITE_API_BASE_URL || envAny.VITE_API_BASE || '/api';
if (typeof __rawBase === 'string') {
  // Trim trailing slashes
  __rawBase = __rawBase.replace(/\/+$/, '');
  // If absolute URL and missing '/api', append it
  if (/^https?:\/\//i.test(__rawBase)) {
    if (!/\/api$/i.test(__rawBase)) {
      __rawBase = `${__rawBase}/api`;
    }
  } else if (!__rawBase) {
    __rawBase = '/api';
  }
}
const API_BASE_URL: string = __rawBase;
export { API_BASE_URL };

let authToken: string | null = localStorage.getItem('token');

export function setAuthToken(token: string | null) {
  authToken = token;
  if (token) localStorage.setItem('token', token);
  else localStorage.removeItem('token');
}

export interface Patient {
  id: string;
  name: string;
  contact: string;
  room: string;
  device_id?: string;
  bed_id?: string | null;
  date_of_birth?: string;
  gender?: string;
  latest_hr?: number;
  latest_spo2?: number;
  assigned_nurse_id?: number | null;
  assigned_nurse_username?: string | null;
}

export interface Vital {
  id: number;
  patient_id: string;
  heart_rate: number;
  spo2: number;
  timestamp: string;
  name?: string;
  room?: string;
}

export interface Alert {
  id: number;
  patient_id: string;
  type: string;
  severity: string;
  message: string;
  heart_rate: number;
  spo2: number;
  timestamp: string;
  acknowledged: boolean;
  name?: string;
  room?: string;
  floor?: number;
}

export interface DashboardStats {
  totalPatients: number;
  activeMonitors: number;
  criticalAlerts: number;
  totalNurses: number;
  avgResponseTime: string;
}

export interface Room {
  id: string;
  floor: number;
  type: string;
  occupied: number;
  patient_id?: string | null;
}

export interface Bed {
  id: string;
  occupied: number;
  patient_id?: string | null;
}

export interface StaffMember {
  id: number;
  employe_id: string;
  username: string;
  email: string;
  role: 'doctor' | 'nurse';
  is_admin: number | boolean;
  phone?: string | null;
  gender?: string | null;
}

class ApiService {
  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...options?.headers,
      },
      ...options,
    });

    if (!response.ok) {
      let message = `API request failed: ${response.statusText}`;
      try {
        const data = await response.json();
        if (data && typeof data.error === 'string' && data.error.trim()) {
          message = data.error.trim();
        }
      } catch (_) {
        // ignore JSON parse errors
      }
      if (response.status === 401 && endpoint.includes('/auth/login')) {
        message = 'Incorrect username or password';
      }
      throw new Error(message);
    }
    return response.json();
  }

  async getPatients(): Promise<Patient[]> {
    return this.request<Patient[]>('/patients');
  }

  async addPatient(
    patient: Omit<Patient, 'latest_hr' | 'latest_spo2'> & {
      condition?: string;
      bed_id?: string | null;
      assigned_nurse_id?: number | null;
    }
  ): Promise<{ id: number }> {
    return this.request<{ id: number }>('/patients', {
      method: 'POST',
      body: JSON.stringify(patient),
    });
  }

  async updatePatient(
    id: string,
    body: Partial<Omit<Patient, 'id' | 'latest_hr' | 'latest_spo2'>> & {
      condition?: string;
      bed_id?: string | null;
      assigned_nurse_id?: number | null;
    }
  ): Promise<{ message: string; patient?: Patient }> {
    return this.request<{ message: string }>(`/patients/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  async deletePatient(id: string): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/patients/${id}`, {
      method: 'DELETE',
    });
  }

  async getVitals(): Promise<Vital[]> {
    return this.request<Vital[]>('/vitals');
  }

  async getVitalsByPatient(patientId: string): Promise<Vital[]> {
    return this.request<Vital[]>(`/vitals/${patientId}`);
  }

  async getAlerts(): Promise<Alert[]> {
    return this.request<Alert[]>('/alerts');
  }

  async getVitalsHistory(since?: string, start_date?: string, end_date?: string): Promise<Vital[]> {
    const params = new URLSearchParams();
    if (start_date) params.append('start_date', start_date);
    if (end_date) params.append('end_date', end_date);
    if (!start_date && !end_date && since) params.append('since', since);
    const q = params.toString() ? `?${params.toString()}` : '';
    return this.request<Vital[]>(`/vitals/history${q}`);
  }

  async getAlertsHistory(since?: string, start_date?: string, end_date?: string): Promise<Alert[]> {
    const params = new URLSearchParams();
    if (start_date) params.append('start_date', start_date);
    if (end_date) params.append('end_date', end_date);
    if (!start_date && !end_date && since) params.append('since', since);
    const q = params.toString() ? `?${params.toString()}` : '';
    return this.request<Alert[]>(`/alerts/history${q}`);
  }

  async acknowledgeAlert(alertId: number): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/alerts/${alertId}/acknowledge`, {
      method: 'PUT',
    });
  }

  async getDashboardStats(): Promise<DashboardStats> {
    return this.request<DashboardStats>('/dashboard/stats');
  }

  async notifyDoctor(body: { alert_id?: number; patient_id?: string; type?: string; message?: string }): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/alerts/notify-doctor`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  // Me
  async getMe(): Promise<{ id: number; employe_id: string; username: string; email: string; role: 'doctor' | 'nurse'; is_admin: boolean | number }> {
    return this.request('/me');
  }

  async updateMe(body: Partial<{ username: string; email: string; password: string }>): Promise<{ message: string; user: { id: number; employe_id: string; username: string; email: string; role: 'doctor' | 'nurse'; is_admin: boolean | number } }> {
    return this.request('/me', {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  async getRooms(): Promise<Room[]> {
    return this.request<Room[]>('/rooms');
  }

  async getAvailableRooms(type?: string, floor?: number): Promise<Room[]> {
    const params = new URLSearchParams();
    if (type) params.append('type', type);
    if (floor) params.append('floor', String(floor));
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request<Room[]>(`/rooms/available${query}`);
  }

  async createOrUpdateRoom(room: { id: string; floor: number; type: string }) {
    return this.request<{ id: string }>('/rooms', {
      method: 'POST',
      body: JSON.stringify(room),
    });
  }

  async updateRoom(id: string, body: { occupied?: boolean; patient_id?: string | null }) {
    return this.request<{ message: string }>(`/rooms/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  // Beds
  async getBeds(): Promise<Bed[]> {
    return this.request<Bed[]>('/beds');
  }

  async getAvailableBeds(): Promise<string[]> {
    return this.request<string[]>('/beds/available');
  }

  // Staff
  async getStaff(role?: 'doctor' | 'nurse'): Promise<StaffMember[]> {
    const q = role ? `?role=${role}` : '';
    return this.request<StaffMember[]>(`/staff${q}`);
  }

  async createStaff(body: { employe_id?: string; username: string; email: string; password: string; role?: 'doctor' | 'nurse'; is_admin?: number; phone?: string | null; gender?: string | null }): Promise<StaffMember> {
    return this.request<StaffMember>(`/staff`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async updateStaff(id: number, body: Partial<{ employe_id: string; username: string; email: string; password: string; role: 'doctor' | 'nurse'; is_admin: number; phone: string | null; gender: string | null }>): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/staff/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  async deleteStaff(id: number): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/staff/${id}`, {
      method: 'DELETE',
    });
  }

  // Auth
  async register(body: { employe_id: string; username: string; email: string; password: string; role?: 'doctor' | 'nurse'; is_admin?: number; phone?: string | null; gender?: string | null }) {
    return this.request<{ token: string; user: any }>(`/auth/register`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async login(body: { usernameOrEmail: string; password: string }) {
    return this.request<{ token: string; user: any }>(`/auth/login`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async forgotPassword(body: { emailOrUsername: string }) {
    return this.request<{ message: string }>(`/auth/forgot-password`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async verifyResetCode(body: { emailOrUsername: string; code: string }) {
    return this.request<{ resetToken: string }>(`/auth/verify-reset-code`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async resetPassword(body: { resetToken: string; newPassword: string }) {
    return this.request<{ message: string }>(`/auth/reset-password`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async resetPasswordWithCode(body: { emailOrUsername: string; code: string; newPassword: string }) {
    return this.request<{ message: string }>(`/auth/reset-password-with-code`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async registerNurse(body: { employe_id: string; username: string; email: string; password: string; phone?: string | null; gender?: string | null }) {
    return this.request<{ token: string; user: any }>(`/auth/register-nurse`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }
}

export const apiService = new ApiService();
