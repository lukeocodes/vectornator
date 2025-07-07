/**
 * Centralized constants for Vectornator
 */

// Metadata storage
export const DEFAULT_METADATA_BRANCH = 'metadata/vectornator';
export const DEFAULT_METADATA_FILE = 'metadata.json';
export const DEFAULT_METADATA_PATH = '.vectornator/metadata.json';

// Storage types
export const STORAGE_TYPE_GIT_BRANCH = 'git-branch';
export const STORAGE_TYPE_FILE = 'file';

// Default values
export const DEFAULT_STORAGE_TYPE = STORAGE_TYPE_GIT_BRANCH;
export const DEFAULT_PROVIDER = 'openai';

// File patterns
export const DEFAULT_PATTERNS = ['**/*.md', '**/*.mdx', '**/*.txt'];
export const DEFAULT_EXCLUDE = ['node_modules/**', '.git/**', 'dist/**'];

// Environment variable names
export const ENV_METADATA_BRANCH = 'VECTORNATOR_METADATA_BRANCH';
export const ENV_API_KEY_PREFIX = '_API_KEY';
export const ENV_STORE_ID_PREFIX = '_STORE_ID';

/**
 * Get the metadata branch name from environment or use default
 */
export function getMetadataBranch(): string {
    return process.env[ENV_METADATA_BRANCH] || DEFAULT_METADATA_BRANCH;
} 