/**
 * Legacy Logger Re-export
 *
 * @deprecated Use `import { logger, logEvent } from '@/lib/logging/structured'` instead.
 *
 * This file re-exports the structured logger to maintain backward compatibility
 * with existing imports. All new code should import from the structured logger module.
 */

import { logger } from '../logging/structured';

export { logger };
export default logger;
