/**
 * Register Page - Multi-Step (PASSWORDLESS)
 * 
 * Step 1: Username + Email
 * Step 2: Verify Email Token
 * Step 3: Terms & Agreement (server integration)
 * Step 4: TOTP Setup (scan QR + verify)
 * Step 5: Deployment (listener deployment loading)
 * Step 6: Success
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Input, Alert, Logo, Terminal, LoadingSpinner } from '@/components/ui/shellvault';
import Image from 'next/image';

type Step = 1 | 2 | 3 | 4 | 5 | 6;

export default function RegisterPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    verificationToken: '',
    totpCode: '',
    agreedToTerms: false,
  });
  const [tempData, setTempData] = useState({
    userId: '',
    totpSecret: '',
    qrCode: '',
    backupCodes: [] as string[],
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // ============================================
  // STEP 1: Register (Username + Email)
  // ============================================
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: formData.username,
          email: formData.email,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Registration failed');
        setLoading(false);
        return;
      }

      // For development: auto-fill token if returned
      if (data.verification?.token) {
        setFormData({ ...formData, verificationToken: data.verification.token });
      }

      setCurrentStep(2);
      setLoading(false);
    } catch (err) {
      setError('An error occurred. Please try again.');
      setLoading(false);
    }
  };

  // ============================================
  // STEP 2: Verify Email
  // ============================================
  const handleVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: formData.verificationToken,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Invalid verification token');
        setLoading(false);
        return;
      }

      // Store TOTP data
      setTempData({
        userId: data.user.id,
        totpSecret: data.totp.secret,
        qrCode: data.totp.qrCode,
        backupCodes: data.totp.backupCodes || [],
      });

      setCurrentStep(3);
      setLoading(false);
    } catch (err) {
      setError('An error occurred. Please try again.');
      setLoading(false);
    }
  };

  // ============================================
  // STEP 3: Accept Terms
  // ============================================
  const handleTermsAccept = () => {
    setFormData({ ...formData, agreedToTerms: true });
    setCurrentStep(4);
  };

  // ============================================
  // STEP 4: Verify TOTP
  // ============================================
  const handleTotpVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/verify-totp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: tempData.userId,
          code: formData.totpCode,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Invalid verification code');
        setLoading(false);
        return;
      }

      // Start deployment
      setCurrentStep(5);
      
      // Simulate deployment
      setTimeout(() => {
        setCurrentStep(6);
        setLoading(false);
      }, 3000);
    } catch (err) {
      setError('An error occurred. Please try again.');
      setLoading(false);
    }
  };

  const handleComplete = () => {
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-6 py-12">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-900/20 via-zinc-950 to-zinc-950"></div>

      {/* Content */}
      <div className="relative w-full max-w-2xl">
        {/* Logo */}
        <Link href="/" className="flex items-center justify-center space-x-2 mb-8">
          <Logo size="large" />
          <span className="text-2xl font-light tracking-tight text-zinc-100">
            Shell<span className="font-semibold text-amber-600">Vault</span>
          </span>
        </Link>

        {/* Progress Indicator */}
        {currentStep < 6 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              {[1, 2, 3, 4, 5].map((step) => (
                <div
                  key={step}
                  className={`flex-1 h-1 mx-1 rounded-full transition-colors ${
                    step <= currentStep ? 'bg-amber-600' : 'bg-zinc-800'
                  }`}
                />
              ))}
            </div>
            <p className="text-center text-sm text-zinc-500">
              Step {currentStep} of 5
            </p>
          </div>
        )}

        {/* Card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 shadow-2xl">
          {/* Step 1: Username + Email */}
          {currentStep === 1 && (
            <>
              <div className="mb-8">
                <h1 className="text-3xl font-light tracking-tight text-zinc-100 mb-2">
                  Create Your Vault
                </h1>
                <p className="text-zinc-400">
                  Passwordless authentication - more secure, less hassle
                </p>
              </div>

              {error && (
                <div className="mb-6">
                  <Alert type="error" message={error} onClose={() => setError('')} />
                </div>
              )}

              <form onSubmit={handleRegister} className="space-y-6">
                <Input
                  label="Username"
                  type="text"
                  value={formData.username}
                  onChange={(value) => setFormData({ ...formData, username: value })}
                  placeholder="Choose a username"
                  required
                  autoFocus
                />

                <Input
                  label="Email Address"
                  type="email"
                  value={formData.email}
                  onChange={(value) => setFormData({ ...formData, email: value })}
                  placeholder="you@company.com"
                  required
                />

                <div className="bg-amber-600/10 border border-amber-600/20 rounded-lg p-4">
                  <p className="text-sm text-amber-200">
                    <strong>Passwordless Security:</strong> No passwords to remember or leak. 
                    You'll use an authenticator app (like Google Authenticator) to login.
                  </p>
                </div>

                <Button type="submit" fullWidth loading={loading}>
                  Continue
                </Button>
              </form>
            </>
          )}

          {/* Step 2: Verify Email */}
          {currentStep === 2 && (
            <>
              <div className="mb-8">
                <h1 className="text-3xl font-light tracking-tight text-zinc-100 mb-2">
                  Check Your Email
                </h1>
                <p className="text-zinc-400">
                  We sent a verification token to <span className="text-amber-600 font-medium">{formData.email}</span>
                </p>
              </div>

              {error && (
                <div className="mb-6">
                  <Alert type="error" message={error} onClose={() => setError('')} />
                </div>
              )}

              <form onSubmit={handleVerifyEmail} className="space-y-6">
                <Input
                  label="Verification Token"
                  type="text"
                  value={formData.verificationToken}
                  onChange={(value) => setFormData({ ...formData, verificationToken: value })}
                  placeholder="Paste token from email"
                  required
                  autoFocus
                />

                <Button type="submit" fullWidth loading={loading}>
                  Verify Email
                </Button>

                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="w-full text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Use a different email
                </button>
              </form>
            </>
          )}

          {/* Step 3: Terms & Agreement */}
          {currentStep === 3 && (
            <>
              <div className="mb-8">
                <h1 className="text-3xl font-light tracking-tight text-zinc-100 mb-2">
                  Server Integration
                </h1>
                <p className="text-zinc-400">
                  ShellVault will deploy a lightweight listener on your servers
                </p>
              </div>

              <div className="space-y-6">
                {/* Terminal Preview */}
                <Terminal title="deployment-preview">
                  <div className="space-y-2 text-left">
                    <div className="text-zinc-500">$ shellvault deploy --init</div>
                    <div className="text-emerald-500">✓ Installing agent (2.1MB)</div>
                    <div className="text-emerald-500">✓ Configuring secure tunnel</div>
                    <div className="text-emerald-500">✓ Enabling auto-rotation</div>
                    <div className="text-amber-500">→ Agent ready for handshake</div>
                  </div>
                </Terminal>

                {/* What Happens */}
                <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-6 space-y-4">
                  <h3 className="text-lg font-semibold text-zinc-100">What ShellVault Does:</h3>
                  <ul className="space-y-3 text-sm text-zinc-400">
                    <li className="flex items-start space-x-3">
                      <svg className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <span>Deploys a lightweight agent (~2MB) on your servers</span>
                    </li>
                    <li className="flex items-start space-x-3">
                      <svg className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <span>Rotates SSH credentials automatically (every 24 hours by default)</span>
                    </li>
                    <li className="flex items-start space-x-3">
                      <svg className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <span>Establishes secure communication tunnel (encrypted)</span>
                    </li>
                    <li className="flex items-start space-x-3">
                      <svg className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <span>Monitors connection health and logs all access attempts</span>
                    </li>
                  </ul>
                </div>

                {/* Checkbox */}
                <label className="flex items-start space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.agreedToTerms}
                    onChange={(e) => setFormData({ ...formData, agreedToTerms: e.target.checked })}
                    className="mt-1 w-5 h-5 rounded border-zinc-700 bg-zinc-800 text-amber-600 focus:ring-amber-600 focus:ring-offset-0 focus:ring-2"
                  />
                  <span className="text-sm text-zinc-400">
                    I understand and agree to deploy ShellVault's agent on my servers. I have read the{' '}
                    <a href="#" className="text-amber-600 hover:text-amber-500 transition-colors">
                      Terms of Service
                    </a>{' '}
                    and{' '}
                    <a href="#" className="text-amber-600 hover:text-amber-500 transition-colors">
                      Privacy Policy
                    </a>
                    .
                  </span>
                </label>

                <Button
                  onClick={handleTermsAccept}
                  fullWidth
                  disabled={!formData.agreedToTerms}
                >
                  Accept & Continue
                </Button>
              </div>
            </>
          )}

          {/* Step 4: TOTP Setup */}
          {currentStep === 4 && (
            <>
              <div className="mb-8">
                <h1 className="text-3xl font-light tracking-tight text-zinc-100 mb-2">
                  Two-Factor Authentication
                </h1>
                <p className="text-zinc-400">
                  Scan this QR code with your authenticator app
                </p>
              </div>

              {error && (
                <div className="mb-6">
                  <Alert type="error" message={error} onClose={() => setError('')} />
                </div>
              )}

              <div className="space-y-6">
                {/* QR Code */}
                <div className="flex justify-center">
                  <div className="bg-white p-4 rounded-lg">
                    {tempData.qrCode ? (
                      <img
                        src={tempData.qrCode}
                        alt="TOTP QR Code"
                        width={200}
                        height={200}
                      />
                    ) : (
                      <div className="w-[200px] h-[200px] bg-zinc-800 animate-pulse rounded"></div>
                    )}
                  </div>
                </div>

                {/* Manual Entry */}
                <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-4">
                  <p className="text-xs text-zinc-500 mb-2">Can't scan? Enter this code manually:</p>
                  <code className="text-sm font-mono text-amber-600 break-all">
                    {tempData.totpSecret || 'Loading...'}
                  </code>
                </div>

                {/* Backup Codes */}
                {tempData.backupCodes.length > 0 && (
                  <div className="bg-amber-600/10 border border-amber-600/20 rounded-lg p-4">
                    <p className="text-sm font-semibold text-amber-200 mb-2">
                      Save these backup codes:
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {tempData.backupCodes.slice(0, 4).map((code, i) => (
                        <code key={i} className="text-xs font-mono text-amber-300 bg-zinc-900 px-2 py-1 rounded">
                          {code}
                        </code>
                      ))}
                    </div>
                    <p className="text-xs text-amber-300 mt-2">
                      Store these safely - they can be used if you lose your authenticator.
                    </p>
                  </div>
                )}

                {/* Verify */}
                <form onSubmit={handleTotpVerify} className="space-y-6">
                  <Input
                    label="Verification Code"
                    type="text"
                    value={formData.totpCode}
                    onChange={(value) => setFormData({ ...formData, totpCode: value })}
                    placeholder="Enter 6-digit code"
                    required
                    autoFocus
                  />

                  <Button type="submit" fullWidth loading={loading}>
                    Verify & Complete Setup
                  </Button>
                </form>
              </div>
            </>
          )}

          {/* Step 5: Deployment */}
          {currentStep === 5 && (
            <div className="text-center py-12">
              <div className="mb-8">
                <LoadingSpinner size="large" />
              </div>
              <h2 className="text-2xl font-light tracking-tight text-zinc-100 mb-4">
                Deploying Listener...
              </h2>
              <p className="text-zinc-400 mb-8">
                ShellVault is setting up your secure infrastructure
              </p>
              <Terminal title="deployment-log">
                <div className="space-y-2 text-left">
                  <div className="text-emerald-500">✓ Account created successfully</div>
                  <div className="text-emerald-500">✓ Generating encryption keys</div>
                  <div className="text-amber-500 animate-pulse">→ Deploying listener agent...</div>
                  <div className="text-zinc-600">Establishing secure tunnel</div>
                  <div className="text-zinc-600">Configuring auto-rotation</div>
                </div>
              </Terminal>
            </div>
          )}

          {/* Step 6: Success */}
          {currentStep === 6 && (
            <div className="text-center py-12">
              <div className="mb-8">
                <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto">
                  <svg className="w-10 h-10 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
              
              <h2 className="text-3xl font-light tracking-tight text-zinc-100 mb-4">
                You're All Set!
              </h2>
              <p className="text-zinc-400 mb-8">
                Your vault is ready. Passwordless authentication configured.
              </p>

              <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-6 mb-8 text-left">
                <h3 className="text-lg font-semibold text-zinc-100 mb-4">Login Instructions:</h3>
                <ul className="space-y-3 text-sm text-zinc-400">
                  <li className="flex items-start space-x-3">
                    <span className="text-amber-600 font-mono mt-0.5">1.</span>
                    <span>Go to the login page</span>
                  </li>
                  <li className="flex items-start space-x-3">
                    <span className="text-amber-600 font-mono mt-0.5">2.</span>
                    <span>Enter your username: <strong className="text-zinc-100">{formData.username}</strong></span>
                  </li>
                  <li className="flex items-start space-x-3">
                    <span className="text-amber-600 font-mono mt-0.5">3.</span>
                    <span>Open your authenticator app and enter the 6-digit code</span>
                  </li>
                </ul>
              </div>

              <Button onClick={handleComplete} fullWidth>
                Go to Login
              </Button>
            </div>
          )}
        </div>

        {/* Back to Login */}
        {currentStep === 1 && (
          <div className="mt-6 text-center">
            <p className="text-sm text-zinc-500">
              Already have an account?{' '}
              <Link href="/login" className="text-amber-600 hover:text-amber-500 transition-colors">
                Sign in
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}