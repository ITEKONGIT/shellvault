/**
 * Email Templates
 * 
 * Beautiful HTML templates for ShellVault emails
 */

import { formatTimeRemaining } from '@/lib/utils/rate-limit';

/**
 * Base email template (wrapper)
 */
function baseTemplate(content: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ShellVault</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background-color: #09090b;
      color: #f4f4f5;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      padding: 40px 20px;
    }
    .header {
      text-align: center;
      margin-bottom: 40px;
    }
    .logo {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 24px;
      font-weight: 300;
      color: #f4f4f5;
      text-decoration: none;
    }
    .logo-icon {
      width: 32px;
      height: 32px;
      background: linear-gradient(135deg, #d97706 0%, #b45309 100%);
      border-radius: 6px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: bold;
      font-family: monospace;
    }
    .logo-text-accent {
      font-weight: 600;
      color: #d97706;
    }
    .card {
      background-color: #18181b;
      border: 1px solid #27272a;
      border-radius: 12px;
      padding: 32px;
      margin-bottom: 24px;
    }
    h1 {
      margin: 0 0 8px 0;
      font-size: 28px;
      font-weight: 300;
      color: #f4f4f5;
    }
    .subtitle {
      margin: 0 0 24px 0;
      font-size: 16px;
      color: #a1a1aa;
    }
    .token-box {
      background-color: #09090b;
      border: 1px solid #27272a;
      border-radius: 8px;
      padding: 20px;
      margin: 24px 0;
      text-align: center;
    }
    .token {
      font-size: 32px;
      font-weight: 600;
      color: #d97706;
      font-family: monospace;
      letter-spacing: 4px;
      word-break: break-all;
    }
    .button {
      display: inline-block;
      background-color: #d97706;
      color: #ffffff;
      text-decoration: none;
      padding: 14px 32px;
      border-radius: 8px;
      font-weight: 500;
      margin: 16px 0;
      transition: background-color 0.2s;
    }
    .button:hover {
      background-color: #b45309;
    }
    .info-box {
      background-color: rgba(217, 119, 6, 0.1);
      border: 1px solid rgba(217, 119, 6, 0.2);
      border-radius: 8px;
      padding: 16px;
      margin: 24px 0;
    }
    .info-box-title {
      font-weight: 600;
      color: #fbbf24;
      margin: 0 0 8px 0;
    }
    .info-box-text {
      margin: 0;
      font-size: 14px;
      color: #fde68a;
    }
    .footer {
      text-align: center;
      color: #71717a;
      font-size: 14px;
      margin-top: 40px;
    }
    .footer a {
      color: #d97706;
      text-decoration: none;
    }
    .security-badge {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      color: #71717a;
      font-size: 12px;
      margin-top: 24px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">
        <div class="logo-icon">SV</div>
        <span>Shell<span class="logo-text-accent">Vault</span></span>
      </div>
    </div>
    ${content}
    <div class="footer">
      <p>This email was sent by ShellVault</p>
      <p>
        <a href="https://shellvault.io">Website</a> •
        <a href="https://shellvault.io/docs">Documentation</a> •
        <a href="https://shellvault.io/support">Support</a>
      </p>
      <div class="security-badge">
        <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd" />
        </svg>
        Secured with military-grade encryption
      </div>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Email verification template
 */
export function emailVerificationTemplate(params: {
  username: string;
  token: string;
  expiresInMinutes: number;
}): { html: string; text: string } {
  const content = `
    <div class="card">
      <h1>Verify Your Email</h1>
      <p class="subtitle">Welcome to ShellVault, ${params.username}!</p>
      
      <p style="color: #a1a1aa; line-height: 1.6;">
        You're almost there! Use the verification token below to complete your registration:
      </p>
      
      <div class="token-box">
        <div style="color: #71717a; font-size: 12px; margin-bottom: 8px;">VERIFICATION TOKEN</div>
        <div class="token">${params.token}</div>
      </div>
      
      <p style="color: #a1a1aa; font-size: 14px; text-align: center;">
        Copy this token and paste it in the registration form.
      </p>
      
      <div class="info-box">
        <div class="info-box-title">⏰ Token Expiry</div>
        <div class="info-box-text">
          This token will expire in ${params.expiresInMinutes} minutes for security.
          If it expires, you'll need to request a new one.
        </div>
      </div>
      
      <p style="color: #71717a; font-size: 14px; margin-top: 32px;">
        Didn't create a ShellVault account? You can safely ignore this email.
      </p>
    </div>
  `;

  const text = `
ShellVault - Verify Your Email

Welcome, ${params.username}!

Your verification token is:
${params.token}

Copy this token and paste it in the registration form.

This token will expire in ${params.expiresInMinutes} minutes.

Didn't create a ShellVault account? You can safely ignore this email.

---
ShellVault - Secure SSH Management
  `;

  return {
    html: baseTemplate(content),
    text: text.trim(),
  };
}

/**
 * Welcome email template (after account activation)
 */
export function welcomeEmailTemplate(params: {
  username: string;
}): { html: string; text: string } {
  const content = `
    <div class="card">
      <h1>Welcome to ShellVault! 🎉</h1>
      <p class="subtitle">Your account is now fully activated</p>
      
      <p style="color: #a1a1aa; line-height: 1.6;">
        Hi ${params.username}, you're all set to start managing your SSH connections securely!
      </p>
      
      <div style="text-align: center;">
        <a href="${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/login" class="button">
          Go to Dashboard
        </a>
      </div>
      
      <div class="info-box">
        <div class="info-box-title">🚀 Next Steps</div>
        <div class="info-box-text">
          1. Add your first server<br>
          2. Install the ShellVault agent<br>
          3. Start connecting securely!
        </div>
      </div>
      
      <p style="color: #a1a1aa; font-size: 14px; margin-top: 32px;">
        Need help? Check out our <a href="${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/docs" style="color: #d97706;">documentation</a> 
        or contact support.
      </p>
    </div>
  `;

  const text = `
ShellVault - Welcome! 🎉

Hi ${params.username}, your account is now fully activated!

You're all set to start managing your SSH connections securely.

Next Steps:
1. Add your first server
2. Install the ShellVault agent
3. Start connecting securely!

Login at: ${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/login

Need help? Visit our documentation or contact support.

---
ShellVault - Secure SSH Management
  `;

  return {
    html: baseTemplate(content),
    text: text.trim(),
  };
}

/**
 * Password reset template (future use)
 */
export function passwordResetTemplate(params: {
  username: string;
  resetToken: string;
  expiresInMinutes: number;
}): { html: string; text: string } {
  const content = `
    <div class="card">
      <h1>Reset Your Password</h1>
      <p class="subtitle">We received a request to reset your password</p>
      
      <p style="color: #a1a1aa; line-height: 1.6;">
        Hi ${params.username}, use the link below to reset your password:
      </p>
      
      <div style="text-align: center;">
        <a href="${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/reset-password?token=${params.resetToken}" class="button">
          Reset Password
        </a>
      </div>
      
      <div class="info-box">
        <div class="info-box-title">⏰ Link Expiry</div>
        <div class="info-box-text">
          This link will expire in ${params.expiresInMinutes} minutes for security.
        </div>
      </div>
      
      <p style="color: #71717a; font-size: 14px; margin-top: 32px;">
        Didn't request a password reset? You can safely ignore this email.
        Your password will not be changed.
      </p>
    </div>
  `;

  const text = `
ShellVault - Reset Your Password

Hi ${params.username},

We received a request to reset your password.

Reset your password here:
${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/reset-password?token=${params.resetToken}

This link will expire in ${params.expiresInMinutes} minutes.

Didn't request a password reset? You can safely ignore this email.

---
ShellVault - Secure SSH Management
  `;

  return {
    html: baseTemplate(content),
    text: text.trim(),
  };
}

/**
 * Security alert template
 */
export function securityAlertTemplate(params: {
  username: string;
  alertType: string;
  details: string;
  ipAddress: string;
  timestamp: Date;
}): { html: string; text: string } {
  const content = `
    <div class="card">
      <h1>🚨 Security Alert</h1>
      <p class="subtitle">Unusual activity detected on your account</p>
      
      <p style="color: #a1a1aa; line-height: 1.6;">
        Hi ${params.username}, we detected the following activity on your account:
      </p>
      
      <div class="info-box">
        <div class="info-box-title">Alert Details</div>
        <div class="info-box-text">
          <strong>Type:</strong> ${params.alertType}<br>
          <strong>Details:</strong> ${params.details}<br>
          <strong>IP Address:</strong> ${params.ipAddress}<br>
          <strong>Time:</strong> ${params.timestamp.toLocaleString()}
        </div>
      </div>
      
      <p style="color: #a1a1aa; line-height: 1.6;">
        If this was you, you can safely ignore this email.
        If you don't recognize this activity, please secure your account immediately.
      </p>
      
      <div style="text-align: center;">
        <a href="${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/security" class="button">
          Review Security Settings
        </a>
      </div>
    </div>
  `;

  const text = `
ShellVault - Security Alert 🚨

Hi ${params.username},

We detected unusual activity on your account:

Type: ${params.alertType}
Details: ${params.details}
IP Address: ${params.ipAddress}
Time: ${params.timestamp.toLocaleString()}

If this was you, you can safely ignore this email.
If you don't recognize this activity, please secure your account immediately.

Review security settings: ${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/security

---
ShellVault - Secure SSH Management
  `;

  return {
    html: baseTemplate(content),
    text: text.trim(),
  };
}