// app/servers/add/page.tsx

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface FormData {
  name: string;
  ipAddress: string;
  port: string;
  sshUsername: string;
  hostname: string;
  tags: string;
  notes: string;
  installAgent: boolean;  // ✅ NEW
  sshPassword: string;     // ✅ NEW
}

interface FormErrors {
  [key: string]: string;
}

export default function AddServerPage() {
  const router = useRouter();
  const [formData, setFormData] = useState<FormData>({
    name: '',
    ipAddress: '',
    port: '22',
    sshUsername: 'root',
    hostname: '',
    tags: '',
    notes: '',
    installAgent: false,  // ✅ NEW
    sshPassword: '',      // ✅ NEW
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [installProgress, setInstallProgress] = useState<string>('');

  // Handle input change
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    
    // Handle checkbox
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData((prev) => ({ 
        ...prev, 
        [name]: checked,
        // Clear password if unchecking
        ...(name === 'installAgent' && !checked ? { sshPassword: '' } : {})
      }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
    
    // Clear error for this field
    if (errors[name]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  // Validate form
  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    // Name validation
    if (!formData.name.trim()) {
      newErrors.name = 'Server name is required';
    } else if (formData.name.length < 3) {
      newErrors.name = 'Name must be at least 3 characters';
    }

    // IP validation
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!formData.ipAddress.trim()) {
      newErrors.ipAddress = 'IP address is required';
    } else if (!ipRegex.test(formData.ipAddress)) {
      newErrors.ipAddress = 'Invalid IP address format';
    } else {
      const parts = formData.ipAddress.split('.').map(Number);
      if (parts.some((p) => p < 0 || p > 255)) {
        newErrors.ipAddress = 'IP address octets must be 0-255';
      }
    }

    // Port validation
    const port = parseInt(formData.port);
    if (isNaN(port) || port < 1 || port > 65535) {
      newErrors.port = 'Port must be between 1 and 65535';
    }

    // Username validation
    if (!formData.sshUsername.trim()) {
      newErrors.sshUsername = 'Username is required';
    } else if (!/^[a-z_][a-z0-9_-]*$/i.test(formData.sshUsername)) {
      newErrors.sshUsername = 'Username must start with letter or underscore';
    }

    // Hostname validation (optional)
    if (
      formData.hostname &&
      !/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i.test(formData.hostname)
    ) {
      newErrors.hostname = 'Invalid hostname format';
    }

    // ✅ NEW: Password validation if agent installation is checked
    if (formData.installAgent && !formData.sshPassword.trim()) {
      newErrors.sshPassword = 'SSH password is required to install agent';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setInstallProgress('');

    try {
      const tags = formData.tags
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      const payload: any = {
        name: formData.name,
        ipAddress: formData.ipAddress,
        port: parseInt(formData.port),
        sshUsername: formData.sshUsername,
        hostname: formData.hostname || null,
        tags,
        notes: formData.notes || null,
        installAgent: formData.installAgent,  // ✅ NEW
      };

      // ✅ NEW: Include password if installing agent
      if (formData.installAgent) {
        payload.sshPassword = formData.sshPassword;
        setInstallProgress('Verifying SSH access...');
      }

      const response = await fetch('/api/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add server');
      }

      // ✅ Show progress for agent installation
      if (formData.installAgent && data.agentInstalled) {
        setInstallProgress('Agent installed successfully! ✓');
      }

      // Success - redirect to dashboard
      setTimeout(() => {
        router.push('/dashboard');
      }, 1000);
    } catch (err: any) {
      setSubmitError(err.message);
      setInstallProgress('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-zinc-950/80 backdrop-blur-sm border-b border-zinc-800/50 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-amber-600 to-amber-800 rounded-md flex items-center justify-center font-mono text-sm font-bold">
              SV
            </div>
            <span className="text-xl font-light tracking-tight">
              Shell<span className="font-semibold text-amber-600">Vault</span>
            </span>
          </div>

          <div className="flex items-center space-x-6">
            <Link
              href="/dashboard"
              className="text-sm text-zinc-400 hover:text-zinc-100 transition-colors"
            >
              Dashboard
            </Link>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="pt-24 pb-12 px-6">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <Link
              href="/dashboard"
              className="inline-flex items-center text-sm text-zinc-400 hover:text-amber-600 transition-colors mb-4"
            >
              <svg
                className="w-4 h-4 mr-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              Back to Dashboard
            </Link>

            <h1 className="text-4xl font-light tracking-tight mb-2">
              Add New <span className="font-semibold text-amber-600">Server</span>
            </h1>
            <p className="text-zinc-400">
              Register your server for secure access management
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8">
              {/* Server Name */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Display Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="Production Web Server"
                  className={`w-full bg-zinc-950 border ${
                    errors.name ? 'border-red-500' : 'border-zinc-800'
                  } rounded-lg px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-600 transition-colors`}
                />
                {errors.name && (
                  <p className="text-red-400 text-sm mt-2">{errors.name}</p>
                )}
                <p className="text-zinc-500 text-sm mt-2">
                  A friendly name to identify this server
                </p>
              </div>

              {/* IP Address */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  IP Address <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  name="ipAddress"
                  value={formData.ipAddress}
                  onChange={handleChange}
                  placeholder="192.168.1.50"
                  className={`w-full bg-zinc-950 border ${
                    errors.ipAddress ? 'border-red-500' : 'border-zinc-800'
                  } rounded-lg px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-600 transition-colors`}
                />
                {errors.ipAddress && (
                  <p className="text-red-400 text-sm mt-2">{errors.ipAddress}</p>
                )}
                <p className="text-zinc-500 text-sm mt-2">
                  The server's IP address
                </p>
              </div>

              {/* Hostname and Port */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Hostname
                  </label>
                  <input
                    type="text"
                    name="hostname"
                    value={formData.hostname}
                    onChange={handleChange}
                    placeholder="prod-web-1"
                    className={`w-full bg-zinc-950 border ${
                      errors.hostname ? 'border-red-500' : 'border-zinc-800'
                    } rounded-lg px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-600 transition-colors`}
                  />
                  {errors.hostname && (
                    <p className="text-red-400 text-sm mt-2">{errors.hostname}</p>
                  )}
                  <p className="text-zinc-500 text-sm mt-2">Optional</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    SSH Port <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="number"
                    name="port"
                    value={formData.port}
                    onChange={handleChange}
                    placeholder="22"
                    className={`w-full bg-zinc-950 border ${
                      errors.port ? 'border-red-500' : 'border-zinc-800'
                    } rounded-lg px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-600 transition-colors`}
                  />
                  {errors.port && (
                    <p className="text-red-400 text-sm mt-2">{errors.port}</p>
                  )}
                  <p className="text-zinc-500 text-sm mt-2">Default: 22</p>
                </div>
              </div>

              {/* SSH Username */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  SSH Username <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  name="sshUsername"
                  value={formData.sshUsername}
                  onChange={handleChange}
                  placeholder="ubuntu"
                  className={`w-full bg-zinc-950 border ${
                    errors.sshUsername ? 'border-red-500' : 'border-zinc-800'
                  } rounded-lg px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-600 transition-colors`}
                />
                {errors.sshUsername && (
                  <p className="text-red-400 text-sm mt-2">
                    {errors.sshUsername}
                  </p>
                )}
                <p className="text-zinc-500 text-sm mt-2">Default: root</p>
              </div>

              {/* Tags */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Tags
                </label>
                <input
                  type="text"
                  name="tags"
                  value={formData.tags}
                  onChange={handleChange}
                  placeholder="production, web, nginx"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-600 transition-colors"
                />
                <p className="text-zinc-500 text-sm mt-2">
                  Comma-separated tags (e.g., production, staging, database)
                </p>
              </div>

              {/* Notes */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Notes
                </label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  placeholder="Additional notes about this server..."
                  rows={4}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-600 transition-colors resize-none"
                />
                <p className="text-zinc-500 text-sm mt-2">
                  Optional notes (max 500 characters)
                </p>
              </div>

              {/* ✅ NEW: Install Agent Checkbox */}
              <div className="border-t border-zinc-800 pt-6">
                <label className="flex items-start space-x-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    name="installAgent"
                    checked={formData.installAgent}
                    onChange={handleChange}
                    className="mt-1 w-5 h-5 rounded border-zinc-700 bg-zinc-950 text-amber-600 focus:ring-amber-600 focus:ring-offset-0 cursor-pointer"
                  />
                  <div className="flex-1">
                    <span className="text-sm font-medium text-zinc-100 group-hover:text-amber-600 transition-colors">
                      Install ShellVault Agent Now
                    </span>
                    <p className="text-sm text-zinc-400 mt-1">
                      Automatically install and configure the agent for passwordless access.
                      This will verify your server ownership.
                    </p>
                  </div>
                </label>

                {/* ✅ NEW: Password Field (shown only when checkbox is checked) */}
                {formData.installAgent && (
                  <div className="mt-6 bg-amber-600/5 border border-amber-600/20 rounded-lg p-6">
                    <div className="flex items-start gap-3 mb-4">
                      <svg
                        className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                        />
                      </svg>
                      <div>
                        <p className="text-sm font-medium text-amber-200">
                          One-Time Password Required
                        </p>
                        <p className="text-sm text-amber-300/70 mt-1">
                          Your SSH password will be used once to verify ownership and install the agent.
                          It will <strong>never be stored</strong> and will be discarded immediately after use.
                        </p>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-2">
                        SSH Password <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="password"
                        name="sshPassword"
                        value={formData.sshPassword}
                        onChange={handleChange}
                        placeholder="Enter your SSH password"
                        className={`w-full bg-zinc-950 border ${
                          errors.sshPassword ? 'border-red-500' : 'border-zinc-800'
                        } rounded-lg px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-600 transition-colors`}
                        autoComplete="new-password"
                      />
                      {errors.sshPassword && (
                        <p className="text-red-400 text-sm mt-2">{errors.sshPassword}</p>
                      )}
                      <p className="text-zinc-500 text-sm mt-2">
                        Used once to verify ownership and install the agent
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Install Progress */}
            {installProgress && (
              <div className="bg-amber-600/10 border border-amber-600/20 rounded-lg p-4">
                <p className="text-amber-200 text-sm">{installProgress}</p>
              </div>
            )}

            {/* Submit Error */}
            {submitError && (
              <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4">
                <p className="text-red-400 text-sm">{submitError}</p>
              </div>
            )}

            {/* Form Actions */}
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => router.back()}
                disabled={isSubmitting}
                className="flex-1 px-6 py-3 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting 
                  ? (formData.installAgent ? 'Installing Agent...' : 'Adding Server...') 
                  : 'Add Server'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}