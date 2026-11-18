import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api, { fetchCsrfToken } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [activeSubjectId, setActiveSubjectId] = useState('');
  const [loading, setLoading] = useState(true);
  const [welcomeMessage, setWelcomeMessage] = useState('');

  const clearWelcomeMessage = useCallback(() => setWelcomeMessage(''), []);

  const refreshSubjects = useCallback(
    async (preferredSubjectId = null) => {
      try {
        const { data } = await api.get('/subjects');
        const list = data.subjects || [];
        setSubjects(list);

        setActiveSubjectId((prev) => {
          const candidate = preferredSubjectId || prev || user?.currentSubjectId;
          if (candidate && list.some((s) => s._id === candidate)) {
            return candidate;
          }
          return list[0]?._id || '';
        });
        return list;
      } catch {
        setSubjects([]);
        return [];
      }
    },
    [user?.currentSubjectId]
  );

  const loadSession = useCallback(async () => {
    const token = localStorage.getItem('gapfinder_token');
    if (!token) {
      setUser(null);
      setSubjects([]);
      setActiveSubjectId('');
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get('/auth/me');
      setUser(data.user);
      const { data: subjData } = await api.get('/subjects');
      const list = subjData.subjects || [];
      setSubjects(list);
      const saved = data.user.currentSubjectId;
      if (saved && list.some((s) => s._id === saved)) {
        setActiveSubjectId(saved);
      } else {
        setActiveSubjectId(list[0]?._id || '');
      }
    } catch {
      localStorage.removeItem('gapfinder_token');
      setUser(null);
      setSubjects([]);
      setActiveSubjectId('');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSession();
    const onUnauthorized = () => {
      setUser(null);
      setSubjects([]);
      setActiveSubjectId('');
    };
    window.addEventListener('gapfinder:unauthorized', onUnauthorized);
    return () => window.removeEventListener('gapfinder:unauthorized', onUnauthorized);
  }, [loadSession]);

  const handleAuthSuccess = async (token, userObj) => {
    localStorage.setItem('gapfinder_token', token);
    setUser(userObj);
    const { data: subjData } = await api.get('/subjects');
    const list = subjData.subjects || [];
    setSubjects(list);
    const pref = userObj.currentSubjectId;
    setActiveSubjectId(pref && list.some((s) => s._id === pref) ? pref : list[0]?._id || '');
  };

  const login = async (email, password) => {
    const csrfToken = await fetchCsrfToken();
    const { data } = await api.post(
      '/auth/login',
      { email, password },
      { headers: { 'X-CSRF-Token': csrfToken } }
    );
    await handleAuthSuccess(data.token, data.user);
    setWelcomeMessage(data.message || 'Thank you for logging into GapFinder AI. Successfully logged in!');
    return data;
  };

  const register = async (name, email, password) => {
    const csrfToken = await fetchCsrfToken();
    const { data } = await api.post(
      '/auth/register',
      { name, email, password },
      { headers: { 'X-CSRF-Token': csrfToken } }
    );
    if (!data?.requiresOtp) {
      throw new Error('OTP verification is required. Please restart the backend server so the latest auth changes take effect.');
    }
    return data;
  };

  const verifyRegisterOtp = async (email, otp) => {
    const csrfToken = await fetchCsrfToken();
    const { data } = await api.post(
      '/auth/verify-register-otp',
      { email, otp },
      { headers: { 'X-CSRF-Token': csrfToken } }
    );
    await handleAuthSuccess(data.token, data.user);
    setWelcomeMessage(data.message || 'Thank you for logging into GapFinder AI. Successfully logged in!');
    return data;
  };

  const resendOtp = async (email, purpose = 'register') => {
    const csrfToken = await fetchCsrfToken();
    const { data } = await api.post(
      '/auth/resend-otp',
      { email, purpose },
      { headers: { 'X-CSRF-Token': csrfToken } }
    );
    return data;
  };

  const demoLogin = async () => {
    const { data } = await api.post('/auth/demo-login');
    await handleAuthSuccess(data.token, data.user);
    return data.user;
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Ignore network errors on logout
    }
    localStorage.removeItem('gapfinder_token');
    setUser(null);
    setSubjects([]);
    setActiveSubjectId('');
  };

  const selectSubject = async (subjectId) => {
    setActiveSubjectId(subjectId);
    try {
      const { data } = await api.patch('/auth/preferences', { currentSubjectId: subjectId });
      setUser(data.user);
    } catch {
      // Non-blocking preference sync
    }
  };

  const updateThresholds = async (thresholds) => {
    const { data } = await api.patch('/auth/preferences', { thresholds });
    setUser(data.user);
    return data.user;
  };

  const activeSubject = subjects.find((s) => s._id === activeSubjectId) || null;

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        subjects,
        activeSubjectId,
        activeSubject,
        welcomeMessage,
        clearWelcomeMessage,
        login,
        register,
        verifyRegisterOtp,
        resendOtp,
        demoLogin,
        logout,
        selectSubject,
        refreshSubjects,
        updateThresholds,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
