import { SyncEngine } from '../sync-engine';
import { VectorStoreProvider } from '../../types';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('SyncEngine', () => {
    let tempDir: string;
    let syncEngine: SyncEngine;
    let mockProvider: jest.Mocked<VectorStoreProvider>;

    beforeEach(async () => {
        // Create temporary directory
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vectornator-sync-test-'));

        // Create mock provider
        mockProvider = {
            name: 'test-provider',
            initialize: jest.fn().mockResolvedValue(undefined),
            verifyStore: jest.fn().mockResolvedValue(true),
            createStore: jest.fn().mockResolvedValue('test-store-id'),
            listFiles: jest.fn().mockResolvedValue([]),
            getFile: jest.fn().mockResolvedValue(null),
            uploadFile: jest.fn().mockResolvedValue('test-file-id'),
            updateFile: jest.fn().mockResolvedValue(undefined),
            deleteFile: jest.fn().mockResolvedValue(undefined),
            searchByMetadata: jest.fn().mockResolvedValue([]),
            enrichMetadata: jest.fn().mockImplementation((_, __, metadata) => Promise.resolve(metadata)),
            cleanup: jest.fn().mockResolvedValue(undefined)
        };

        // Create sync engine with file-based metadata for testing
        syncEngine = new SyncEngine(mockProvider, path.join(tempDir, 'metadata.json'), 'file');
    });

    afterEach(async () => {
        // Clean up
        await fs.rm(tempDir, { recursive: true, force: true });
        jest.clearAllMocks();
    });

    describe('sync', () => {
        it('should handle empty directory', async () => {
            const result = await syncEngine.sync({
                directory: tempDir
            });

            expect(mockProvider.verifyStore).toHaveBeenCalled();
            expect(result.added).toHaveLength(0);
            expect(result.updated).toHaveLength(0);
            expect(result.deleted).toHaveLength(0);
        });

        it('should add new files', async () => {
            // Create test files
            await fs.writeFile(path.join(tempDir, 'test.md'), '# Test');
            await fs.writeFile(path.join(tempDir, 'test2.txt'), 'Test 2');

            const result = await syncEngine.sync({
                directory: tempDir
            });

            expect(mockProvider.uploadFile).toHaveBeenCalledTimes(2);
            expect(result.added).toHaveLength(2);
            expect(result.added).toContain('test.md');
            expect(result.added).toContain('test2.txt');
        });

        it('should handle dry run mode', async () => {
            await fs.writeFile(path.join(tempDir, 'test.md'), '# Test');

            await syncEngine.sync({
                directory: tempDir,
                dryRun: true
            });

            expect(mockProvider.uploadFile).not.toHaveBeenCalled();
            expect(mockProvider.updateFile).not.toHaveBeenCalled();
            expect(mockProvider.deleteFile).not.toHaveBeenCalled();
        });

        it('should handle patterns option', async () => {
            await fs.writeFile(path.join(tempDir, 'test.md'), '# Test');
            await fs.writeFile(path.join(tempDir, 'test.json'), '{}');
            await fs.writeFile(path.join(tempDir, 'test.txt'), 'Test');

            const result = await syncEngine.sync({
                directory: tempDir,
                patterns: ['**/*.md', '**/*.json']
            });

            expect(result.added).toHaveLength(2);
            expect(result.added).toContain('test.md');
            expect(result.added).toContain('test.json');
            expect(result.added).not.toContain('test.txt');
        });

        it('should handle exclude option', async () => {
            await fs.mkdir(path.join(tempDir, 'node_modules'), { recursive: true });
            await fs.writeFile(path.join(tempDir, 'test.md'), '# Test');
            await fs.writeFile(path.join(tempDir, 'node_modules', 'test.md'), '# Test');

            const result = await syncEngine.sync({
                directory: tempDir
            });

            expect(result.added).toHaveLength(1);
            expect(result.added).toContain('test.md');
        });

        it('should handle provider errors gracefully', async () => {
            await fs.writeFile(path.join(tempDir, 'test.md'), '# Test');
            mockProvider.uploadFile.mockRejectedValue(new Error('Upload failed'));

            const result = await syncEngine.sync({
                directory: tempDir
            });

            expect(result.failed).toHaveLength(1);
            expect(result.failed[0].path).toBe('test.md');
            expect(result.failed[0].error).toBe('Upload failed');
        });

        it('should verify store before syncing', async () => {
            mockProvider.verifyStore.mockResolvedValue(false);

            await expect(syncEngine.sync({
                directory: tempDir
            })).rejects.toThrow('Vector store does not exist');
        });

        it('should call cleanup after sync', async () => {
            await syncEngine.sync({
                directory: tempDir
            });

            expect(mockProvider.cleanup).toHaveBeenCalled();
        });
    });

    describe('edge cases', () => {
        it('should handle files with special characters', async () => {
            const specialFileName = 'test with spaces & special.md';
            await fs.writeFile(path.join(tempDir, specialFileName), '# Test');

            const result = await syncEngine.sync({
                directory: tempDir
            });

            expect(result.added).toContain(specialFileName);
        });

        it('should handle deeply nested directories', async () => {
            const deepPath = path.join(tempDir, 'a', 'b', 'c', 'd');
            await fs.mkdir(deepPath, { recursive: true });
            await fs.writeFile(path.join(deepPath, 'test.md'), '# Test');

            const result = await syncEngine.sync({
                directory: tempDir
            });

            expect(result.added).toHaveLength(1);
            expect(result.added[0]).toContain('test.md');
        });

        it('should handle empty files', async () => {
            await fs.writeFile(path.join(tempDir, 'empty.md'), '');

            const result = await syncEngine.sync({
                directory: tempDir
            });

            expect(result.added).toContain('empty.md');
        });

        it('should handle very large files', async () => {
            const largeContent = 'x'.repeat(10 * 1024 * 1024); // 10MB
            await fs.writeFile(path.join(tempDir, 'large.txt'), largeContent);

            const result = await syncEngine.sync({
                directory: tempDir
            });

            expect(result.added).toContain('large.txt');
        });
    });
}); 