// components/ui/edit-server-modal.tsx

'use client';

import { useState, useEffect } from 'react';

interface EditServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  server: {
    id: string;
    name: string;
    port: number;
    sshUsername: string;
    hostname?: string | null;
    tags: string[];
    notes?: string | null;
  };
}

export function EditServerModal({
  isOpen,
  onClose,
  onSuccess,
  server,
}: EditServerModalProps) {
  const [formData, setFormData] = useState({
    name: server.name,
    port: server.port.toString(),
    sshUsername: server.sshUsername,
    hostname: server.hostname || '',
    tags: server.tags.join(', '),
    notes: server.notes || '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Reset form when server changes
  useEffect(() => {
    setFormData({
      name: server.name,
      port: server.port.toString(),
      sshUsername: server.sshUsername,
      hostname: server.hostname || '',
      tags: server.tags.join(', '),
      notes: server.notes || '',
    });
    setErrors({});
    setSubmitError(null);
  }, [server]);

  if (!isOpen) return null;

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim() || formData.name.length < 3) {
      newErrors.name = 'Name must be at least 3 characters';
    }

    const port = parseInt(formData.port);
    if (isNaN(port) || port < 1 || port > 65535) {
      newErrors.port = 'Port must be between 1 and 65535';
    }

    if (!formData.sshUsername.trim()) {
      newErrors.sshUsername = 'Username is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const tags = formData.tags
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      const response = await fetch(`/api/servers/${server.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          port: parseInt(formData.port),
          sshUsername: formData.sshUsername,
          hostname: formData.hostname || null,
          tags,
          notes: formData.notes || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update server');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setSubmitError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-zinc-900 border-b border-zinc-800 p-6 flex items-center justify-between">
          <h3 className="text-xl font-semibold text-zinc-100">Edit Server</h3>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-zinc-400 hover:text-zinc-100 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Display Name *
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className={`w-full bg-zinc-950 border ${
                errors.name ? 'border-red-500' : 'border-zinc-800'
              } rounded-lg px-4 py-2 text-zinc-100 focus:outline-none focus:border-amber-600 transition-colors`}
            />
            {errors.name && (
              <p className="text-red-400 text-sm mt-1">{errors.name}</p>
            )}
          </div>

          {/* Port and Username */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                SSH Port *
              </label>
              <input
                type="number"
                name="port"
                value={formData.port}
                onChange={handleChange}
                className={`w-full bg-zinc-950 border ${
                  errors.port ? 'border-red-500' : 'border-zinc-800'
                } rounded-lg px-4 py-2 text-zinc-100 focus:outline-none focus:border-amber-600 transition-colors`}
              />
              {errors.port && (
                <p className="text-red-400 text-sm mt-1">{errors.port}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Username *
              </label>
              <input
                type="text"
                name="sshUsername"
                value={formData.sshUsername}
                onChange={handleChange}
                className={`w-full bg-zinc-950 border ${
                  errors.sshUsername ? 'border-red-500' : 'border-zinc-800'
                } rounded-lg px-4 py-2 text-zinc-100 focus:outline-none focus:border-amber-600 transition-colors`}
              />
              {errors.sshUsername && (
                <p className="text-red-400 text-sm mt-1">{errors.sshUsername}</p>
              )}
            </div>
          </div>

          {/* Hostname */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Hostname
            </label>
            <input
              type="text"
              name="hostname"
              value={formData.hostname}
              onChange={handleChange}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-zinc-100 focus:outline-none focus:border-amber-600 transition-colors"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Tags
            </label>
            <input
              type="text"
              name="tags"
              value={formData.tags}
              onChange={handleChange}
              placeholder="production, web, nginx"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-600 transition-colors"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Notes
            </label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={3}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-600 transition-colors resize-none"
            />
          </div>

          {/* Submit Error */}
          {submitError && (
            <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-3">
              <p className="text-red-400 text-sm">{submitError}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}