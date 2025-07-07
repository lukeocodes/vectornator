import {
    VectorStoreProvider,
    VectorStoreConfig,
    VectorStoreFile,
    FileMetadata,
    ProgressCallback
} from '../types';

/**
 * Base class for vector store providers
 * Provides common functionality and enforces the interface
 */
export abstract class BaseVectorStoreProvider implements VectorStoreProvider {
    abstract name: string;
    protected config: VectorStoreConfig = {};
    protected initialized = false;

    /**
     * Initialize the provider
     */
    async initialize(config: VectorStoreConfig): Promise<void> {
        this.config = config;
        await this.validateConfig();
        await this.connect();
        this.initialized = true;
    }

    /**
     * Validate provider configuration
     */
    protected abstract validateConfig(): Promise<void>;

    /**
     * Connect to the vector store service
     */
    protected abstract connect(): Promise<void>;

    /**
     * Ensure provider is initialized
     */
    protected ensureInitialized(): void {
        if (!this.initialized) {
            throw new Error(`${this.name} provider not initialized. Call initialize() first.`);
        }
    }

    // Abstract methods that must be implemented by providers
    abstract verifyStore(): Promise<boolean>;
    abstract createStore(name: string): Promise<string>;
    abstract listFiles(): Promise<VectorStoreFile[]>;
    abstract getFile(fileId: string): Promise<VectorStoreFile | null>;
    abstract uploadFile(
        filePath: string,
        content: Buffer,
        metadata: FileMetadata,
        onProgress?: ProgressCallback
    ): Promise<string>;
    abstract updateFile(
        fileId: string,
        content: Buffer,
        metadata: FileMetadata,
        onProgress?: ProgressCallback
    ): Promise<void>;
    abstract deleteFile(fileId: string): Promise<void>;
    abstract searchByMetadata(query: Record<string, string | number | boolean>): Promise<VectorStoreFile[]>;

    /**
     * Default metadata enrichment - can be overridden by providers
     */
    async enrichMetadata(
        filePath: string,
        content: Buffer,
        baseMetadata: FileMetadata
    ): Promise<FileMetadata> {
        return {
            ...baseMetadata,
            provider: this.name,
            uploadedAt: new Date().toISOString(),
        };
    }

    /**
     * Default cleanup - can be overridden by providers
     */
    async cleanup(): Promise<void> {
        this.initialized = false;
    }

    /**
     * Helper method for progress reporting
     */
    protected reportProgress(
        onProgress: ProgressCallback | undefined,
        current: number,
        total: number,
        message: string,
        file?: string
    ): void {
        if (onProgress) {
            onProgress({ current, total, message, file });
        }
    }
} 