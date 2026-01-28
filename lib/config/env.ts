/**
 * Environment Configuration & Validation
 * 
 * Validates required environment variables on startup to prevent
 * runtime crashes. Addresses Edge Case #1 from Phase 1 analysis.
 */

export interface EnvConfig {
  // Database
  DATABASE_URL: string;
  
  // Authentication
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  
  // Application
  NODE_ENV: 'development' | 'production' | 'test';
  LOG_LEVEL: string;
  
  // Optional: Rate limiting (for Phase 16)
  REDIS_URL?: string;
}

/**
 * Validate and load environment variables
 */
export function validateEnv(): EnvConfig {
  const required = {
    DATABASE_URL: process.env.DATABASE_URL,
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
    NODE_ENV: process.env.NODE_ENV || 'development',
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  };

  // Check required variables
  const missing: string[] = [];
  
  if (!required.DATABASE_URL) missing.push('DATABASE_URL');
  if (!required.JWT_SECRET) missing.push('JWT_SECRET');

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      `Please check your .env file and ensure these are set.`
    );
  }

  // Validate JWT_SECRET strength (minimum 32 characters)
  if (required.JWT_SECRET!.length < 32) {
    throw new Error(
      'JWT_SECRET must be at least 32 characters long for security.\n' +
      'Generate a strong secret with: openssl rand -base64 32'
    );
  }

  // At this point, we know required vars are defined (we checked above)
  return {
    ...required,
    DATABASE_URL: required.DATABASE_URL!,
    JWT_SECRET: required.JWT_SECRET!,
    NODE_ENV: required.NODE_ENV as 'development' | 'production' | 'test',
    REDIS_URL: process.env.REDIS_URL,
  };
}

// Export validated config
export const env = validateEnv();

// Log environment info (non-sensitive)
if (env.NODE_ENV === 'development') {
  console.log('✓ Environment validated');
  console.log(`  - NODE_ENV: ${env.NODE_ENV}`);
  console.log(`  - LOG_LEVEL: ${env.LOG_LEVEL}`);
  console.log(`  - JWT_EXPIRES_IN: ${env.JWT_EXPIRES_IN}`);
  console.log(`  - DATABASE: ${env.DATABASE_URL.split('@')[1]?.split('/')[0] || 'configured'}`);
}