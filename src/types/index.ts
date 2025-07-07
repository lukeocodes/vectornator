/**
 * Core types and interfaces for Vectornator
 */

/**
 * File metadata stored locally and remotely
 */
export interface FileMetadata {
    path: string;
    hash: string;
    size: number;
    lastModified: string;
    mimeType: string;
    encoding?: string;
    [key: string]: string | number | boolean | undefined; // Allow custom metadata
}

/**
 * Vector store file representation
 */
export interface VectorStoreFile {
    id: string;
    metadata: FileMetadata;
    content?: string;
}

/**
 * Configuration for vector store providers
 */
export interface VectorStoreConfig {
    apiKey?: string;
    endpoint?: string;
    storeId?: string;
    [key: string]: string | number | boolean | undefined; // Allow provider-specific config
}

/**
 * Options for syncing files
 */
export interface SyncOptions {
    directory: string;
    patterns?: string[];
    exclude?: string[];
    dryRun?: boolean;
    force?: boolean;
    metadataFile?: string;
    maxConcurrent?: number;
    verbose?: boolean;
}

/**
 * Result of a sync operation
 */
export interface SyncResult {
    added: string[];
    updated: string[];
    deleted: string[];
    unchanged: string[];
    failed: Array<{
        path: string;
        error: string;
    }>;
    duration: number;
}

/**
 * Progress callback for long-running operations
 */
export type ProgressCallback = (progress: {
    current: number;
    total: number;
    message: string;
    file?: string;
}) => void;

/**
 * Main interface that all vector store providers must implement
 */
export interface VectorStoreProvider {
    /**
     * Provider name for identification
     */
    name: string;

    /**
     * Initialize the provider with configuration
     */
    initialize(config: VectorStoreConfig): Promise<void>;

    /**
     * Verify the vector store exists and is accessible
     */
    verifyStore(): Promise<boolean>;

    /**
     * Create a new vector store if it doesn't exist
     */
    createStore(name: string): Promise<string>;

    /**
     * List all files in the vector store
     */
    listFiles(): Promise<VectorStoreFile[]>;

    /**
     * Get a specific file by ID
     */
    getFile(fileId: string): Promise<VectorStoreFile | null>;

    /**
     * Upload a file to the vector store
     */
    uploadFile(
        filePath: string,
        content: Buffer,
        metadata: FileMetadata,
        onProgress?: ProgressCallback
    ): Promise<string>;

    /**
     * Update an existing file
     */
    updateFile(
        fileId: string,
        content: Buffer,
        metadata: FileMetadata,
        onProgress?: ProgressCallback
    ): Promise<void>;

    /**
     * Delete a file from the vector store
     */
    deleteFile(fileId: string): Promise<void>;

    /**
     * Search for files by metadata
     */
    searchByMetadata(query: Record<string, string | number | boolean>): Promise<VectorStoreFile[]>;

    /**
     * Get provider-specific metadata enrichment
     */
    enrichMetadata(
        filePath: string,
        content: Buffer,
        baseMetadata: FileMetadata
    ): Promise<FileMetadata>;

    /**
     * Cleanup resources
     */
    cleanup(): Promise<void>;
}

/**
 * Factory function type for creating providers
 */
export type ProviderFactory = (config: VectorStoreConfig) => VectorStoreProvider;

/**
 * Registry of available providers
 */
export interface ProviderRegistry {
    [name: string]: ProviderFactory;
} 