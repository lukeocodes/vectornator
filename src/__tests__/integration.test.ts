import { SyncEngine } from '../core/sync-engine';
import { MetadataManager } from '../core/metadata-manager';
import { VectorStoreProvider, FileMetadata, VectorStoreFile } from '../types';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Mock provider for integration testing
class MockVectorStoreProvider implements VectorStoreProvider {
    name = 'mock';
    private store: Map<string, { content: Buffer; metadata: FileMetadata }> = new Map();
    private storeId?: string;

    async initialize(config: any): Promise<void> {
        this.storeId = config.storeId;
    }

    async verifyStore(): Promise<boolean> {
        return !!this.storeId;
    }

    async createStore(_name: string): Promise<string> {
        this.storeId = `store-${Date.now()}`;
        return this.storeId;
    }

    async listFiles(): Promise<VectorStoreFile[]> {
        return Array.from(this.store.entries()).map(([id, data]) => ({
            id,
            metadata: data.metadata
        }));
    }

    async getFile(fileId: string): Promise<VectorStoreFile | null> {
        const data = this.store.get(fileId);
        return data ? { id: fileId, metadata: data.metadata } : null;
    }

    async uploadFile(filePath: string, content: Buffer, metadata: FileMetadata): Promise<string> {
        const fileId = `file-${Date.now()}-${Math.random()}`;
        this.store.set(fileId, { content, metadata });
        return fileId;
    }

    async updateFile(fileId: string, content: Buffer, metadata: FileMetadata): Promise<void> {
        this.store.set(fileId, { content, metadata });
    }

    async deleteFile(fileId: string): Promise<void> {
        this.store.delete(fileId);
    }

    async searchByMetadata(_query: Record<string, any>): Promise<VectorStoreFile[]> {
        return this.listFiles();
    }

    async enrichMetadata(filePath: string, content: Buffer, baseMetadata: FileMetadata): Promise<FileMetadata> {
        return {
            ...baseMetadata,
            provider: 'mock',
            enriched: true
        };
    }

    async cleanup(): Promise<void> {
        // No-op
    }
}

describe('Integration Tests', () => {
    let tempDir: string;
    let metadataPath: string;
    let provider: MockVectorStoreProvider;
    let syncEngine: SyncEngine;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vectornator-integration-'));
        metadataPath = path.join(tempDir, '.vectornator', 'metadata.json');

        provider = new MockVectorStoreProvider();
        await provider.initialize({ storeId: 'test-store' });

        syncEngine = new SyncEngine(provider, metadataPath, 'file');
    });

    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    describe('full sync workflow', () => {
        it('should sync new files to vector store', async () => {
            // Create test files
            await fs.writeFile(path.join(tempDir, 'doc1.md'), '# Document 1\n\nContent here.');
            await fs.writeFile(path.join(tempDir, 'doc2.txt'), 'Plain text document');
            await fs.mkdir(path.join(tempDir, 'subdir'));
            await fs.writeFile(path.join(tempDir, 'subdir', 'nested.md'), '# Nested Doc');

            // Run sync
            const result = await syncEngine.sync({
                directory: tempDir
            });

            // Verify results
            expect(result.added).toHaveLength(3);
            expect(result.added).toContain('doc1.md');
            expect(result.added).toContain('doc2.txt');
            expect(result.added).toContain(path.join('subdir', 'nested.md'));
            expect(result.updated).toHaveLength(0);
            expect(result.deleted).toHaveLength(0);
            expect(result.failed).toHaveLength(0);

            // Verify files in store
            const files = await provider.listFiles();
            expect(files).toHaveLength(3);
        });

        it('should update changed files', async () => {
            // Initial sync
            await fs.writeFile(path.join(tempDir, 'update.md'), '# Original content');
            const firstSync = await syncEngine.sync({ directory: tempDir });
            expect(firstSync.added).toHaveLength(1);

            // Modify file
            await fs.writeFile(path.join(tempDir, 'update.md'), '# Updated content\n\nNew stuff here.');

            // Second sync
            const secondSync = await syncEngine.sync({ directory: tempDir });
            expect(secondSync.added).toHaveLength(0);
            expect(secondSync.updated).toHaveLength(1);
            expect(secondSync.updated).toContain('update.md');
        });

        it('should delete removed files', async () => {
            // Initial sync
            await fs.writeFile(path.join(tempDir, 'delete-me.md'), '# To be deleted');
            await fs.writeFile(path.join(tempDir, 'keep-me.md'), '# Keep this');
            const firstSync = await syncEngine.sync({ directory: tempDir });
            expect(firstSync.added).toHaveLength(2);

            // Remove one file
            await fs.unlink(path.join(tempDir, 'delete-me.md'));

            // Second sync
            const secondSync = await syncEngine.sync({ directory: tempDir });
            expect(secondSync.deleted).toHaveLength(1);
            expect(secondSync.deleted).toContain('delete-me.md');

            // Verify only one file remains
            const files = await provider.listFiles();
            expect(files).toHaveLength(1);
            expect(files[0].metadata.path).toBe('keep-me.md');
        });

        it('should handle mixed operations in one sync', async () => {
            // Initial state
            await fs.writeFile(path.join(tempDir, 'existing.md'), '# Existing');
            await fs.writeFile(path.join(tempDir, 'to-update.md'), '# Original');
            await fs.writeFile(path.join(tempDir, 'to-delete.md'), '# Delete me');

            const firstSync = await syncEngine.sync({ directory: tempDir });
            expect(firstSync.added).toHaveLength(3);

            // Make changes
            await fs.writeFile(path.join(tempDir, 'new-file.md'), '# New file');
            await fs.writeFile(path.join(tempDir, 'to-update.md'), '# Updated content');
            await fs.unlink(path.join(tempDir, 'to-delete.md'));

            // Second sync
            const secondSync = await syncEngine.sync({ directory: tempDir });
            expect(secondSync.added).toHaveLength(1);
            expect(secondSync.updated).toHaveLength(1);
            expect(secondSync.deleted).toHaveLength(1);
            expect(secondSync.unchanged).toHaveLength(1);
        });
    });

    describe('metadata persistence', () => {
        it('should persist metadata between syncs', async () => {
            await fs.writeFile(path.join(tempDir, 'test.md'), '# Test');

            // First sync
            await syncEngine.sync({ directory: tempDir });

            // Create new engine instance
            const newEngine = new SyncEngine(provider, metadataPath, 'file');

            // Should recognize file as unchanged
            const result = await newEngine.sync({ directory: tempDir });
            expect(result.unchanged).toHaveLength(1);
            expect(result.added).toHaveLength(0);
        });

        it('should track file versions', async () => {
            const filePath = path.join(tempDir, 'versioned.md');

            // First sync - should create with version 1
            await fs.writeFile(filePath, '# Version 1');
            await syncEngine.sync({ directory: tempDir });

            // Create new metadata manager to force reload from disk
            let metadataManager = new MetadataManager(metadataPath);
            let entry = await metadataManager.getFileEntry('versioned.md');
            expect(entry?.version).toBe(1);

            // Second sync with update - should increment to version 2
            await fs.writeFile(filePath, '# Version 2');
            await syncEngine.sync({ directory: tempDir });

            // Create new metadata manager to force reload from disk
            metadataManager = new MetadataManager(metadataPath);
            entry = await metadataManager.getFileEntry('versioned.md');
            expect(entry?.version).toBe(2);

            // Third sync with update - should increment to version 3
            await fs.writeFile(filePath, '# Version 3');
            await syncEngine.sync({ directory: tempDir });

            // Create new metadata manager to force reload from disk
            metadataManager = new MetadataManager(metadataPath);
            entry = await metadataManager.getFileEntry('versioned.md');
            expect(entry?.version).toBe(3);
        });
    });

    describe('error recovery', () => {
        it('should handle partial sync failures', async () => {
            // Create files
            await fs.writeFile(path.join(tempDir, 'good1.md'), '# Good 1');
            await fs.writeFile(path.join(tempDir, 'bad.md'), '# Will fail');
            await fs.writeFile(path.join(tempDir, 'good2.md'), '# Good 2');

            // Mock upload failure for specific file
            const originalUpload = provider.uploadFile.bind(provider);
            provider.uploadFile = jest.fn().mockImplementation((path, content, metadata) => {
                if (metadata.path === 'bad.md') {
                    throw new Error('Upload failed');
                }
                return originalUpload(path, content, metadata);
            });

            const result = await syncEngine.sync({ directory: tempDir });

            expect(result.added).toHaveLength(2);
            expect(result.failed).toHaveLength(1);
            expect(result.failed[0].path).toBe('bad.md');
        });

        it('should recover from corrupted metadata', async () => {
            // Create invalid metadata
            await fs.mkdir(path.dirname(metadataPath), { recursive: true });
            await fs.writeFile(metadataPath, 'invalid json');

            // Should still work
            await fs.writeFile(path.join(tempDir, 'test.md'), '# Test');
            const result = await syncEngine.sync({ directory: tempDir });

            expect(result.added).toHaveLength(1);
        });
    });

    describe('performance', () => {
        it('should handle large number of files', async () => {
            const fileCount = 100;

            // Create many files
            const createPromises: Promise<void>[] = [];
            for (let i = 0; i < fileCount; i++) {
                createPromises.push(
                    fs.writeFile(
                        path.join(tempDir, `file${i}.md`),
                        `# File ${i}\n\nContent for file ${i}`
                    )
                );
            }
            await Promise.all(createPromises);

            const startTime = Date.now();
            const result = await syncEngine.sync({ directory: tempDir });
            const duration = Date.now() - startTime;

            expect(result.added).toHaveLength(fileCount);
            expect(result.failed).toHaveLength(0);
            expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
        });

        it('should efficiently detect unchanged files', async () => {
            // Create files
            const fileCount = 50;
            for (let i = 0; i < fileCount; i++) {
                await fs.writeFile(
                    path.join(tempDir, `unchanged${i}.md`),
                    `# Unchanged ${i}`
                );
            }

            // Initial sync
            await syncEngine.sync({ directory: tempDir });

            // Second sync should be fast
            const startTime = Date.now();
            const result = await syncEngine.sync({ directory: tempDir });
            const duration = Date.now() - startTime;

            expect(result.unchanged).toHaveLength(fileCount);
            expect(result.added).toHaveLength(0);
            expect(duration).toBeLessThan(2000); // Should be very fast
        });
    });
}); 