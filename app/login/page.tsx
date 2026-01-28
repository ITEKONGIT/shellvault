/**
 * Login Page
 * 
 * Minimalist + Rustic design
 * Username + TOTP authentication
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Input, Alert, Logo } from '@/components/ui/shellvault';

export default function LoginPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    username: '',
    totpCode: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Login failed');
        setLoading(false);
        return;
      }

      // Success - redirect to dashboard
      router.push('/dashboard');
    } catch (err) {
      setError('An error occurred. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-6 py-12">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-900/20 via-zinc-950 to-zinc-950"></div>

      {/* Content */}
      <div className="relative w-full max-w-md">
        {/* Logo */}
        <Link href="/" className="flex items-center justify-center space-x-2 mb-8">
          <Logo size="large" />
          <span className="text-2xl font-light tracking-tight text-zinc-100">
            Shell<span className="font-semibold text-amber-600">Vault</span>
          </span>
        </Link>

        {/* Card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 shadow-2xl">
          <div className="mb-8">
            <h1 className="text-3xl font-light tracking-tight text-zinc-100 mb-2">
              Welcome Back
            </h1>
            <p className="text-zinc-400">
              Enter your credentials to access your vault
            </p>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="mb-6">
              <Alert type="error" message={error} onClose={() => setError('')} />
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <Input
              label="Username"
              type="text"
              value={formData.username}
              onChange={(value) => setFormData({ ...formData, username: value })}
              placeholder="Enter your username"
              required
              autoFocus
            />

            <Input
              label="Authentication Code"
              type="text"
              value={formData.totpCode}
              onChange={(value) => setFormData({ ...formData, totpCode: value })}
              placeholder="6-digit code from authenticator"
              required
            />

            <Button type="submit" fullWidth loading={loading}>
              {loading ? 'Signing In...' : 'Sign In'}
            </Button>
          </form>

          {/* Divider */}
          <div className="my-8 flex items-center">
            <div className="flex-1 border-t border-zinc-800"></div>
            <span className="px-4 text-sm text-zinc-500">OR</span>
            <div className="flex-1 border-t border-zinc-800"></div>
          </div>

          {/* Register Link */}
          <div className="text-center">
            <p className="text-zinc-400 text-sm">
              Don't have an account?{' '}
              <Link href="/register" className="text-amber-600 hover:text-amber-500 font-medium transition-colors">
                Create one now
              </Link>
            </p>
          </div>
        </div>

        {/* Help Text */}
        <div className="mt-6 text-center">
          <p className="text-sm text-zinc-500">
            Need help? Contact{' '}
            <a href="mailto:support@shellvault.io" className="text-amber-600 hover:text-amber-500 transition-colors">
              support@shellvault.io
            </a>
          </p>
        </div>

        {/* Security Badge */}
        <div className="mt-8 flex items-center justify-center space-x-2 text-zinc-600 text-xs">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
          </svg>
          <span>Secured with military-grade encryption</span>
        </div>
      </div>
    </div>
  );
}