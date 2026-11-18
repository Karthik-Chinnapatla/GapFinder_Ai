import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import { PageLoader } from './components/UI';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import MaterialsPage from './pages/MaterialsPage';
import SyllabusPage from './pages/SyllabusPage';
import AssessmentsPage from './pages/AssessmentsPage';
import DiagnosisPage from './pages/DiagnosisPage';
import RevisionPage from './pages/RevisionPage';
import ProgressPage from './pages/ProgressPage';
import AssistantPage from './pages/AssistantPage';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader message="Verifying session..." />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function PublicOnlyRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader message="Loading GapFinder AI..." />;
  if (user) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={
              <PublicOnlyRoute>
                <LoginPage />
              </PublicOnlyRoute>
            }
          />
          <Route
            path="/register"
            element={
              <PublicOnlyRoute>
                <RegisterPage />
              </PublicOnlyRoute>
            }
          />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="materials" element={<MaterialsPage />} />
            <Route path="syllabus" element={<SyllabusPage />} />
            <Route path="assessments" element={<AssessmentsPage />} />
            <Route path="diagnosis" element={<DiagnosisPage />} />
            <Route path="revision" element={<RevisionPage />} />
            <Route path="progress" element={<ProgressPage />} />
            <Route path="assistant" element={<AssistantPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
