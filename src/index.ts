// Main exports for Vectornator library

export * from './types';
export { BaseVectorStoreProvider } from './providers/base';
export { OpenAIProvider } from './providers/openai';
export { providerRegistry } from './providers/registry';
export { SyncEngine } from './core/sync-engine';
export { FileScanner } from './core/file-scanner';
export { MetadataManager } from './core/metadata-manager';

// Constants
export * from './constants';
