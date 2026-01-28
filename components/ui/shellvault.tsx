/**
 * ShellVault UI Components
 * 
 * Reusable components following the minimalist + rustic design system
 */

import React from 'react';
import Link from 'next/link';

/* ==================== BUTTONS ==================== */

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  fullWidth?: boolean;
  loading?: boolean;
}

export function Button({
  children,
  onClick,
  type = 'button',
  variant = 'primary',
  disabled = false,
  fullWidth = false,
  loading = false,
}: ButtonProps) {
  const baseClasses = 'px-8 py-4 rounded-lg font-medium transition-all';
  
  const variantClasses = {
    primary: 'bg-amber-600 hover:bg-amber-700 text-white shadow-lg shadow-amber-900/50 hover:scale-105 disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed disabled:hover:scale-100',
    secondary: 'bg-zinc-900 hover:bg-zinc-800 text-zinc-100 border border-zinc-800 disabled:bg-zinc-900 disabled:text-zinc-600 disabled:cursor-not-allowed',
    ghost: 'text-zinc-400 hover:text-zinc-100 disabled:text-zinc-700 disabled:cursor-not-allowed',
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`${baseClasses} ${variantClasses[variant]} ${fullWidth ? 'w-full' : ''}`}
    >
      {loading ? (
        <span className="flex items-center justify-center">
          <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Loading...
        </span>
      ) : children}
    </button>
  );
}

/* ==================== INPUTS ==================== */

interface InputProps {
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  success?: string;
  disabled?: boolean;
  required?: boolean;
  autoFocus?: boolean;
}

export function Input({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  error,
  success,
  disabled = false,
  required = false,
  autoFocus = false,
}: InputProps) {
  const borderColor = error
    ? 'border-red-500/50 focus:border-red-500'
    : success
    ? 'border-emerald-500/50 focus:border-emerald-500'
    : 'border-zinc-800 focus:border-amber-600';

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-zinc-300">
        {label}
        {required && <span className="text-amber-600 ml-1">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        autoFocus={autoFocus}
        className={`w-full bg-zinc-900 border ${borderColor} text-zinc-100 rounded-lg px-4 py-3 placeholder:text-zinc-500 transition-colors focus:outline-none disabled:bg-zinc-800 disabled:cursor-not-allowed`}
      />
      {error && (
        <p className="text-sm text-red-400 flex items-center space-x-1">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <span>{error}</span>
        </p>
      )}
      {success && (
        <p className="text-sm text-emerald-400 flex items-center space-x-1">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <span>{success}</span>
        </p>
      )}
    </div>
  );
}

/* ==================== CARDS ==================== */

interface CardProps {
  children: React.ReactNode;
  hover?: boolean;
  className?: string;
}

export function Card({ children, hover = false, className = '' }: CardProps) {
  return (
    <div
      className={`bg-zinc-900 border border-zinc-800 rounded-lg p-8 ${
        hover ? 'hover:border-amber-600/50 transition-colors' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}

/* ==================== TERMINAL ==================== */

interface TerminalProps {
  children: React.ReactNode;
  title?: string;
}

export function Terminal({ children, title = 'shellvault@secure' }: TerminalProps) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden shadow-2xl">
      <div className="bg-zinc-800 px-4 py-3 flex items-center space-x-2 border-b border-zinc-700">
        <div className="w-3 h-3 rounded-full bg-red-500"></div>
        <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
        <div className="w-3 h-3 rounded-full bg-green-500"></div>
        <span className="text-xs text-zinc-500 ml-4 font-mono">{title}</span>
      </div>
      <div className="p-6 font-mono text-sm">{children}</div>
    </div>
  );
}

/* ==================== STATUS INDICATOR ==================== */

interface StatusProps {
  status: 'online' | 'offline' | 'warning';
  label: string;
}

export function Status({ status, label }: StatusProps) {
  const colors = {
    online: 'bg-emerald-500',
    offline: 'bg-red-500',
    warning: 'bg-yellow-500',
  };

  return (
    <div className="inline-flex items-center space-x-2 bg-zinc-900 border border-zinc-800 rounded-full px-4 py-2">
      <span className={`w-2 h-2 ${colors[status]} rounded-full ${status === 'online' ? 'animate-pulse' : ''}`}></span>
      <span className="text-sm text-zinc-400">{label}</span>
    </div>
  );
}

/* ==================== ALERT ==================== */

interface AlertProps {
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  onClose?: () => void;
}

export function Alert({ type, message, onClose }: AlertProps) {
  const styles = {
    success: {
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
      text: 'text-emerald-400',
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
      ),
    },
    error: {
      bg: 'bg-red-500/10',
      border: 'border-red-500/20',
      text: 'text-red-400',
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
      ),
    },
    warning: {
      bg: 'bg-yellow-500/10',
      border: 'border-yellow-500/20',
      text: 'text-yellow-400',
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
      ),
    },
    info: {
      bg: 'bg-zinc-800/50',
      border: 'border-zinc-700',
      text: 'text-zinc-300',
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
        </svg>
      ),
    },
  };

  const style = styles[type];

  return (
    <div className={`${style.bg} border ${style.border} rounded-lg p-4 flex items-start space-x-3`}>
      <div className={style.text}>{style.icon}</div>
      <p className={`flex-1 text-sm ${style.text}`}>{message}</p>
      {onClose && (
        <button onClick={onClose} className={`${style.text} hover:opacity-70 transition-opacity`}>
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      )}
    </div>
  );
}

/* ==================== LOGO ==================== */

export function Logo({ size = 'default' }: { size?: 'small' | 'default' | 'large' }) {
  const sizes = {
    small: 'w-6 h-6 text-xs',
    default: 'w-8 h-8 text-sm',
    large: 'w-12 h-12 text-base',
  };

  return (
    <div className={`${sizes[size]} bg-gradient-to-br from-amber-600 to-amber-800 rounded-md flex items-center justify-center font-mono font-bold`}>
      SV
    </div>
  );
}

/* ==================== LOADING SPINNER ==================== */

export function LoadingSpinner({ size = 'default' }: { size?: 'small' | 'default' | 'large' }) {
  const sizes = {
    small: 'w-4 h-4',
    default: 'w-8 h-8',
    large: 'w-12 h-12',
  };

  return (
    <svg className={`animate-spin ${sizes[size]} text-amber-600`} viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}