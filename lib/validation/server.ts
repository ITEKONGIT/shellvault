// lib/validation/server.ts

import { z } from 'zod';

/**
 * Server validation schemas
 */

// IP address validation regex
const IP_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;

// Hostname validation regex (optional, DNS-safe)
const HOSTNAME_REGEX = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i;

// Username validation regex (Linux-safe)
const USERNAME_REGEX = /^[a-z_]([a-z0-9_-]{0,31})$/;

/**
 * Validate IP address format and range
 */
function isValidIpAddress(ip: string): boolean {
  if (!IP_REGEX.test(ip)) return false;
  
  const parts = ip.split('.').map(Number);
  return parts.every(part => part >= 0 && part <= 255);
}

/**
 * Create Server Schema
 */
export const createServerSchema = z.object({
  name: z.string()
    .min(3, 'Name must be at least 3 characters')
    .max(100, 'Name must be less than 100 characters')
    .trim(),
  
  ipAddress: z.string()
    .trim()
    .refine(isValidIpAddress, {
      message: 'Invalid IP address format (e.g., 192.168.1.50)',
    }),
  
  port: z.number()
    .int('Port must be an integer')
    .min(1, 'Port must be between 1 and 65535')
    .max(65535, 'Port must be between 1 and 65535')
    .default(22),
  
  sshUsername: z.string()
    .min(1, 'Username is required')
    .max(32, 'Username must be less than 32 characters')
    .regex(USERNAME_REGEX, 'Invalid username format (must start with letter or underscore)')
    .default('root'),
  
  hostname: z.string()
    .min(1, 'Hostname must be at least 1 character')
    .max(63, 'Hostname must be less than 63 characters')
    .regex(HOSTNAME_REGEX, 'Invalid hostname format')
    .optional()
    .nullable(),
  
  tags: z.array(z.string().trim().min(1).max(50))
    .max(10, 'Maximum 10 tags allowed')
    .default([]),
  
  notes: z.string()
    .max(500, 'Notes must be less than 500 characters')
    .optional()
    .nullable(),
});

/**
 * Update Server Schema (all fields optional)
 */
export const updateServerSchema = z.object({
  name: z.string()
    .min(3, 'Name must be at least 3 characters')
    .max(100, 'Name must be less than 100 characters')
    .trim()
    .optional(),
  
  port: z.number()
    .int('Port must be an integer')
    .min(1, 'Port must be between 1 and 65535')
    .max(65535, 'Port must be between 1 and 65535')
    .optional(),
  
  sshUsername: z.string()
    .min(1, 'Username is required')
    .max(32, 'Username must be less than 32 characters')
    .regex(USERNAME_REGEX, 'Invalid username format')
    .optional(),
  
  hostname: z.string()
    .min(1, 'Hostname must be at least 1 character')
    .max(63, 'Hostname must be less than 63 characters')
    .regex(HOSTNAME_REGEX, 'Invalid hostname format')
    .optional()
    .nullable(),
  
  tags: z.array(z.string().trim().min(1).max(50))
    .max(10, 'Maximum 10 tags allowed')
    .optional(),
  
  notes: z.string()
    .max(500, 'Notes must be less than 500 characters')
    .optional()
    .nullable(),
});

/**
 * List Servers Query Schema
 */
export const listServersSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  status: z.enum(['all', 'pending', 'online', 'offline']).default('all'),
  tags: z.string().optional(), // comma-separated
  search: z.string().max(100).optional(),
});

/**
 * Type exports
 */
export type CreateServerInput = z.infer<typeof createServerSchema>;
export type UpdateServerInput = z.infer<typeof updateServerSchema>;
export type ListServersQuery = z.infer<typeof listServersSchema>;