import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Target, ArrowRight, ArrowLeft, Mail, ShieldCheck, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../api/client';

export default function RegisterPage() {
  const { register, verifyRegisterOtp, resendOtp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const redirectNotice = location.state?.notice || '';
  const prefillEmail = location.state?.prefillEmail || '';

  const [step, setStep] = useState('details'); // 'details' | 'otp'
  const [name, setName] = useState('');
  const [email, setEmail] = useState(prefillEmail);
  const [password, setPassword] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (prefillEmail) {
      setEmail(prefillEmail);
    }
  }, [prefillEmail]);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleDetailsSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setInfoMessage('');
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await register(name, email, password);
      setPendingEmail(res.email || email.trim().toLowerCase());
      setOtp('');
      setStep('otp');
      setCooldown(30);
      setInfoMessage(res.message || 'Verification OTP sent to your email.');
    } catch (err) {
      setError(getErrorMessage(err, 'Registration failed.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleOtpSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (otp.trim().length !== 6) {
      setError('Please enter the 6-digit OTP sent to your email.');
      return;
    }
    setSubmitting(true);
    try {
      await verifyRegisterOtp(pendingEmail, otp.trim());
      navigate('/');
    } catch (err) {
      setError(getErrorMessage(err, 'Invalid or expired OTP.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || resending) return;
    setError('');
    setInfoMessage('');
    setResending(true);
    try {
      const res = await resendOtp(pendingEmail, 'register');
      setCooldown(30);
      setInfoMessage(res.message || 'A fresh OTP has been sent to your email.');
    } catch (err) {
      setError(getErrorMessage(err, 'Could not resend OTP.'));
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] px-4 py-12">
      <div className="w-full max-w-[440px]">
        <div className="mb-7 flex items-center justify-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-[0_2px_12px_rgba(79,70,229,0.3)]">
            <Target className="h-5 w-5" />
          </div>
          <span className="text-xl font-bold tracking-tight text-slate-900">GapFinder AI</span>
        </div>

        <div className="saas-card p-8 sm:p-9">
          {step === 'details' ? (
            <>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Create your account</h1>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
                Track your syllabus, uncover missed concepts, and keep all your study progress saved securely.
              </p>

              {redirectNotice && !error && (
                <div className="mt-5 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-xs font-medium text-indigo-700">
                  {redirectNotice}
                </div>
              )}

              {error && (
                <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
                  {error}
                </div>
              )}

              <form onSubmit={handleDetailsSubmit} className="mt-6 space-y-5">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">Full Name</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your full name"
                    className="saas-input"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">Email address</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="student@university.edu"
                    className="saas-input"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">Password</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="saas-input"
                  />
                </div>

                <button type="submit" disabled={submitting} className="saas-btn-primary w-full py-3">
                  <span>{submitting ? 'Please wait...' : 'Continue'}</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </form>

              <p className="mt-7 text-center text-sm text-slate-600">
                Already registered?{' '}
                <Link to="/login" className="font-semibold text-indigo-600 hover:text-indigo-700">
                  Sign in
                </Link>
              </p>
            </>
          ) : (
            <>
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                <Mail className="h-5 w-5" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Verify your email</h1>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
                We sent a 6-digit OTP from <span className="font-semibold text-slate-700">GapFinder AI</span> to{' '}
                <span className="font-semibold text-slate-800">{pendingEmail}</span>.
              </p>

              {infoMessage && (
                <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-700">
                  {infoMessage}
                </div>
              )}

              {error && (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
                  {error}
                </div>
              )}

              <form onSubmit={handleOtpSubmit} className="mt-6 space-y-5">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    6-Digit Verification Code
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    required
                    autoFocus
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="saas-input text-center font-mono text-2xl font-bold tracking-[0.5em]"
                  />
                </div>

                <button type="submit" disabled={submitting} className="saas-btn-primary w-full py-3">
                  <ShieldCheck className="h-4 w-4" />
                  <span>{submitting ? 'Verifying...' : 'Verify & Continue'}</span>
                </button>
              </form>

              <div className="mt-5 flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setStep('details');
                    setError('');
                    setInfoMessage('');
                    setOtp('');
                  }}
                  className="inline-flex items-center gap-1.5 font-semibold text-slate-500 transition hover:text-slate-800"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Edit details
                </button>

                <button
                  type="button"
                  onClick={handleResend}
                  disabled={cooldown > 0 || resending}
                  className="inline-flex items-center gap-1.5 font-semibold text-indigo-600 transition hover:text-indigo-700 disabled:text-slate-400"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${resending ? 'animate-spin' : ''}`} />
                  {cooldown > 0 ? `Resend in ${cooldown}s` : resending ? 'Sending...' : 'Resend OTP'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
