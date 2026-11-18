import { defineStore } from 'pinia';
import { apiClient, REFRESH_TOKEN_KEY, TOKEN_KEY } from '../services/api/client';
import type { UserRole } from '../types';

interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
}

interface AuthResponse {
  accessToken: string;
  refreshToken?: string;
  user: AuthUser;
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    accessToken: localStorage.getItem(TOKEN_KEY) || '',
    refreshToken: localStorage.getItem(REFRESH_TOKEN_KEY) || '',
    user: null as AuthUser | null,
    loading: false,
    initialized: false,
    error: '' as string
  }),
  getters: {
    isAuthenticated(state): boolean {
      return Boolean(state.accessToken);
    }
  },
  actions: {
    setTokens(accessToken: string, refreshToken?: string) {
      this.accessToken = accessToken;
      if (accessToken) {
        localStorage.setItem(TOKEN_KEY, accessToken);
      } else {
        localStorage.removeItem(TOKEN_KEY);
      }

      if (refreshToken !== undefined) {
        this.refreshToken = refreshToken;
        if (refreshToken) {
          localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
        } else {
          localStorage.removeItem(REFRESH_TOKEN_KEY);
        }
      }
    },

    setToken(token: string) {
      this.setTokens(token);
    },

    async bootstrap() {
      if (!this.accessToken) {
        this.initialized = true;
        return;
      }

      try {
        const response = await apiClient.get<AuthUser>('/auth/me');
        this.user = response.data;
      } catch (error) {
        this.logout();
      } finally {
        this.initialized = true;
      }
    },

    async login(email: string, password: string) {
      this.loading = true;
      this.error = '';
      try {
        const response = await apiClient.post<AuthResponse>('/auth/login', { email, password });
        this.setTokens(response.data.accessToken, response.data.refreshToken);
        this.user = response.data.user;
      } catch (error) {
        this.error = 'Invalid credentials.';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async register(fullName: string, email: string, password: string) {
      this.loading = true;
      this.error = '';
      try {
        const response = await apiClient.post<AuthResponse>('/auth/register', {
          fullName,
          email,
          password
        });
        this.setTokens(response.data.accessToken, response.data.refreshToken);
        this.user = response.data.user;
      } catch (error) {
        this.error = 'Unable to register with this email.';
        throw error;
      } finally {
        this.loading = false;
      }
    },

    logout() {
      this.setTokens('', '');
      this.user = null;
      this.error = '';
    }
  }
});
