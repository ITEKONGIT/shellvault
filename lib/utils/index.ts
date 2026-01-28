import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Tailwind class merge utility
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Get client IP from request
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  
  if (realIp) {
    return realIp;
  }
  
  return 'unknown';
}

// Get user agent from request
export function getUserAgent(request: Request): string {
  return request.headers.get('user-agent') || 'unknown';
}

// API response helper
export function apiResponse<T>(
  data: T,
  status: number = 200
): Response {
  return Response.json(data, { status });
}

// API error helper
export function apiError(
  message: string,
  status: number = 500,
  details?: any
): Response {
  return Response.json(
    {
      error: message,
      details,
    },
    { status }
  );
}