/**
 * Email Service
 * 
 * Abstraction layer for sending emails.
 * Supports multiple providers: SendGrid, Resend, AWS SES, Nodemailer
 * 
 * Configuration via environment variables:
 * - EMAIL_PROVIDER: 'sendgrid' | 'resend' | 'ses' | 'smtp'
 * - EMAIL_FROM: sender email address
 * - Provider-specific keys (see below)
 */

import logger from '@/lib/logger';

// Email configuration
const EMAIL_CONFIG = {
  provider: (process.env.EMAIL_PROVIDER || 'console') as 'sendgrid' | 'resend' | 'ses' | 'smtp' | 'console',
  from: process.env.EMAIL_FROM || 'noreply@shellvault.io',
  fromName: process.env.EMAIL_FROM_NAME || 'ShellVault',
};

/**
 * Email data interface
 */
export interface EmailData {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Send email using configured provider
 */
export async function sendEmail(data: EmailData): Promise<boolean> {
  try {
    switch (EMAIL_CONFIG.provider) {
      case 'sendgrid':
        return await sendWithSendGrid(data);
      
      case 'resend':
        return await sendWithResend(data);
      
      case 'ses':
        return await sendWithSES(data);
      
      case 'smtp':
        return await sendWithSMTP(data);
      
      case 'console':
      default:
        return sendToConsole(data);
    }
  } catch (error) {
    logger.error('Email sending failed:', error);
    return false;
  }
}

/**
 * SendGrid integration
 * Required env: SENDGRID_API_KEY
 */
async function sendWithSendGrid(data: EmailData): Promise<boolean> {
  const apiKey = process.env.SENDGRID_API_KEY;
  
  if (!apiKey) {
    logger.error('SENDGRID_API_KEY not configured');
    return sendToConsole(data);
  }

  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{
          to: [{ email: data.to }],
          subject: data.subject,
        }],
        from: {
          email: EMAIL_CONFIG.from,
          name: EMAIL_CONFIG.fromName,
        },
        content: [
          { type: 'text/html', value: data.html },
          ...(data.text ? [{ type: 'text/plain', value: data.text }] : []),
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error('SendGrid error:', error);
      return false;
    }

    logger.info('Email sent via SendGrid', { to: data.to });
    return true;
  } catch (error) {
    logger.error('SendGrid error:', error);
    return false;
  }
}

/**
 * Resend integration
 * Required env: RESEND_API_KEY
 */
async function sendWithResend(data: EmailData): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  
  if (!apiKey) {
    logger.error('RESEND_API_KEY not configured');
    return sendToConsole(data);
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${EMAIL_CONFIG.fromName} <${EMAIL_CONFIG.from}>`,
        to: [data.to],
        subject: data.subject,
        html: data.html,
        text: data.text,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error('Resend error:', error);
      return false;
    }

    logger.info('Email sent via Resend', { to: data.to });
    return true;
  } catch (error) {
    logger.error('Resend error:', error);
    return false;
  }
}

/**
 * AWS SES integration
 * Required env: AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
 */
async function sendWithSES(data: EmailData): Promise<boolean> {
  logger.warn('AWS SES integration not implemented yet');
  logger.info('Falling back to console output');
  return sendToConsole(data);
  
  // TODO: Implement AWS SES using AWS SDK
  // npm install @aws-sdk/client-ses
}

/**
 * SMTP integration
 * Required env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
 */
async function sendWithSMTP(data: EmailData): Promise<boolean> {
  logger.warn('SMTP integration not implemented yet');
  logger.info('Falling back to console output');
  return sendToConsole(data);
  
  // TODO: Implement SMTP using nodemailer
  // npm install nodemailer
}

/**
 * Console output (development/testing)
 */
function sendToConsole(data: EmailData): boolean {
  console.log('\n========================================');
  console.log('📧 EMAIL (Console Mode)');
  console.log('========================================');
  console.log(`From: ${EMAIL_CONFIG.fromName} <${EMAIL_CONFIG.from}>`);
  console.log(`To: ${data.to}`);
  console.log(`Subject: ${data.subject}`);
  console.log('----------------------------------------');
  console.log(data.text || 'See HTML version');
  console.log('========================================\n');
  
  logger.debug('Email logged to console (EMAIL_PROVIDER=console)', {
    to: data.to,
    subject: data.subject,
  });
  
  return true;
}

/**
 * Test email connection
 */
export async function testEmailConnection(): Promise<boolean> {
  logger.info('Testing email connection', {
    provider: EMAIL_CONFIG.provider,
    from: EMAIL_CONFIG.from,
  });

  try {
    const result = await sendEmail({
      to: process.env.EMAIL_TEST_RECIPIENT || 'test@example.com',
      subject: 'ShellVault Email Test',
      html: '<p>Email service is working correctly!</p>',
      text: 'Email service is working correctly!',
    });

    if (result) {
      logger.info('Email test successful');
    } else {
      logger.error('Email test failed');
    }

    return result;
  } catch (error) {
    logger.error('Email test error:', error);
    return false;
  }
}