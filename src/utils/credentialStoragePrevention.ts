/**
 * Credential Storage Prevention Utilities
 * 
 * Provides utilities to detect and prevent AWS credentials from being stored
 * in browser localStorage or sessionStorage.
 * 
 * Security: Credentials should only be stored in memory, never persisted.
 */

/**
 * Credential patterns to detect in storage
 */
const STORAGE_CREDENTIAL_PATTERNS = [
  /AKIA[0-9A-Z]{16}/i,           // Long-term access keys
  /ASIA[0-9A-Z]{16}/i,           // Temporary access keys (STS)
  /AIDA[0-9A-Z]{16}/i,           // IAM user IDs
  /AROA[0-9A-Z]{16}/i,           // IAM role IDs
  /[A-Za-z0-9/+=]{40}/,          // Secret keys (40 chars)
  /FwoGZXIvYXdzE[A-Za-z0-9/+=]{100,}/,  // Session tokens
];

/**
 * Check if a string contains credential patterns
 * @param value String to check
 * @returns true if credentials detected, false otherwise
 */
function containsCredentials(value: string): boolean {
  if (typeof value !== 'string') {
    return false;
  }

  return STORAGE_CREDENTIAL_PATTERNS.some(pattern => pattern.test(value));
}

/**
 * Scan localStorage and sessionStorage for credentials
 * @returns Array of storage keys that contain credentials
 */
export function scanStorageForCredentials(): { storage: 'localStorage' | 'sessionStorage'; key: string }[] {
  const violations: { storage: 'localStorage' | 'sessionStorage'; key: string }[] = [];

  // Check localStorage
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const value = localStorage.getItem(key);
        if (value && containsCredentials(value)) {
          violations.push({ storage: 'localStorage', key });
        }
      }
    }
  } catch (error) {
    console.warn('[CredentialStoragePrevention] Failed to scan localStorage:', error);
  }

  // Check sessionStorage
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key) {
        const value = sessionStorage.getItem(key);
        if (value && containsCredentials(value)) {
          violations.push({ storage: 'sessionStorage', key });
        }
      }
    }
  } catch (error) {
    console.warn('[CredentialStoragePrevention] Failed to scan sessionStorage:', error);
  }

  return violations;
}

/**
 * Perform startup check for credentials in storage
 * Logs warnings if credentials are detected
 */
export function performStartupStorageCheck(): void {
  console.log('[CredentialStoragePrevention] Performing startup storage check...');
  
  const violations = scanStorageForCredentials();
  
  if (violations.length > 0) {
    console.warn(
      `[CredentialStoragePrevention] WARNING: Detected ${violations.length} storage item(s) containing credentials!`
    );
    
    for (const violation of violations) {
      console.warn(
        `[CredentialStoragePrevention] - ${violation.storage}.${violation.key} contains credential patterns`
      );
    }
    
    console.warn(
      '[CredentialStoragePrevention] Credentials should never be stored in browser storage. ' +
      'This is a security violation.'
    );
  } else {
    console.log('[CredentialStoragePrevention] Startup check passed - no credentials detected in storage');
  }
}

/**
 * Periodic check interval ID
 */
let periodicCheckInterval: NodeJS.Timeout | null = null;

/**
 * Start periodic checks for credentials in storage
 * Checks every 5 minutes by default
 * @param intervalMs Check interval in milliseconds (default: 5 minutes)
 */
export function startPeriodicStorageCheck(intervalMs: number = 5 * 60 * 1000): void {
  if (periodicCheckInterval) {
    console.warn('[CredentialStoragePrevention] Periodic check already running');
    return;
  }

  console.log(`[CredentialStoragePrevention] Starting periodic storage checks (every ${intervalMs}ms)`);
  
  periodicCheckInterval = setInterval(() => {
    const violations = scanStorageForCredentials();
    
    if (violations.length > 0) {
      console.warn(
        `[CredentialStoragePrevention] PERIODIC CHECK: Detected ${violations.length} storage item(s) containing credentials!`
      );
      
      for (const violation of violations) {
        console.warn(
          `[CredentialStoragePrevention] - ${violation.storage}.${violation.key} contains credential patterns`
        );
      }
    }
  }, intervalMs);
}

/**
 * Stop periodic storage checks
 */
export function stopPeriodicStorageCheck(): void {
  if (periodicCheckInterval) {
    clearInterval(periodicCheckInterval);
    periodicCheckInterval = null;
    console.log('[CredentialStoragePrevention] Stopped periodic storage checks');
  }
}

/**
 * Check if periodic storage check is running
 * @returns true if running, false otherwise
 */
export function isPeriodicCheckRunning(): boolean {
  return periodicCheckInterval !== null;
}
