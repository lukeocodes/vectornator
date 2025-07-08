import { MetadataManager } from '../metadata-manager';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { FileMetadata, VectorStoreFile } from '../../types';

describe('MetadataManager', () => {
    let tempDir: string;
    let metadataPath: string;
    let manager: MetadataManager;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vectornator-metadata-test-'));
        metadataPath = path.join(tempDir, 'metadata.json');
        manager = new MetadataManager(metadataPath);
    });

    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    describe('load and save', () => {
        it('should create new metadata if file does not exist', async () => {
            const metadata = await manager.load();

            expect(metadata.version).toBe('1.0.0');
            expect(metadata.files).toEqual({});
            expect(metadata.lastSync).toBeDefined();
        });

        it('should load existing metadata', async () => {
            const existingData = {
                version: '1.0.0',
                lastSync: '2023-01-01T00:00:00.000Z',
                storeId: 'test-store',
                files: {
                    'test.md': {
                        fileId: 'file-123',
                        metadata: {
                            path: 'test.md',
                            hash: 'abc123',
                            size: 100,
                            lastModified: '2023-01-01T00:00:00.000Z',
                            mimeType: 'text/markdown'
                        },
                        uploadedAt: '2023-01-01T00:00:00.000Z',
                        version: 1
                    }
                }
            };

            await fs.writeFile(metadataPath, JSON.stringify(existingData));

            const metadata = await manager.load();
            expect(metadata).toEqual(existingData);
        });

        it('should save metadata with updated timestamp', async () => {
            await manager.load();
            await manager.setStoreId('new-store');
            await manager.save();

            const savedContent = await fs.readFile(metadataPath, 'utf-8');
            const savedData = JSON.parse(savedContent);

            expect(savedData.storeId).toBe('new-store');
            expect(new Date(savedData.lastSync).getTime()).toBeGreaterThan(Date.now() - 5000);
        });

        it('should create directory if it does not exist', async () => {
            const nestedPath = path.join(tempDir, 'nested', 'dir', 'metadata.json');
            const nestedManager = new MetadataManager(nestedPath);

            await nestedManager.load();
            await nestedManager.save();

            const exists = await fs.access(nestedPath).then(() => true).catch(() => false);
            expect(exists).toBe(true);
        });
    });

    describe('file operations', () => {
        it('should set and get file entries', async () => {
            const entry = {
                fileId: 'file-456',
                metadata: {
                    path: 'doc.txt',
                    hash: 'def456',
                    size: 200,
                    lastModified: new Date().toISOString(),
                    mimeType: 'text/plain'
                },
                uploadedAt: new Date().toISOString(),
                version: 1
            };

            await manager.setFileEntry('doc.txt', entry);
            const retrieved = await manager.getFileEntry('doc.txt');

            expect(retrieved).toEqual(entry);
        });

        it('should remove file entries', async () => {
            const entry = {
                fileId: 'file-789',
                metadata: {
                    path: 'remove.md',
                    hash: 'ghi789',
                    size: 300,
                    lastModified: new Date().toISOString(),
                    mimeType: 'text/markdown'
                },
                uploadedAt: new Date().toISOString(),
                version: 1
            };

            await manager.setFileEntry('remove.md', entry);
            await manager.removeFileEntry('remove.md');
            const retrieved = await manager.getFileEntry('remove.md');

            expect(retrieved).toBeNull();
        });

        it('should get all files', async () => {
            const entries = {
                'file1.md': {
                    fileId: 'id1',
                    metadata: {
                        path: 'file1.md',
                        hash: 'hash1',
                        size: 100,
                        lastModified: new Date().toISOString(),
                        mimeType: 'text/markdown'
                    },
                    uploadedAt: new Date().toISOString(),
                    version: 1
                },
                'file2.txt': {
                    fileId: 'id2',
                    metadata: {
                        path: 'file2.txt',
                        hash: 'hash2',
                        size: 200,
                        lastModified: new Date().toISOString(),
                        mimeType: 'text/plain'
                    },
                    uploadedAt: new Date().toISOString(),
                    version: 1
                }
            };

            for (const [path, entry] of Object.entries(entries)) {
                await manager.setFileEntry(path, entry);
            }

            const allFiles = await manager.getAllFiles();
            expect(allFiles).toEqual(entries);
        });
    });

    describe('compareFiles', () => {
        const createLocalFile = (path: string, hash: string): { path: string; metadata: FileMetadata } => ({
            path,
            metadata: {
                path,
                hash,
                size: 100,
                lastModified: new Date().toISOString(),
                mimeType: 'text/plain'
            }
        });

        const createRemoteFile = (id: string, path: string): VectorStoreFile => ({
            id,
            metadata: {
                path,
                hash: 'remote-hash',
                size: 100,
                lastModified: new Date().toISOString(),
                mimeType: 'text/plain'
            }
        });

        it('should identify files to add', async () => {
            const localFiles = [
                createLocalFile('new1.txt', 'hash1'),
                createLocalFile('new2.txt', 'hash2')
            ];
            const remoteFiles: VectorStoreFile[] = [];

            const result = await manager.compareFiles(localFiles, remoteFiles);

            expect(result.toAdd).toHaveLength(2);
            expect(result.toAdd.map(f => f.path)).toEqual(['new1.txt', 'new2.txt']);
        });

        it('should identify files to update', async () => {
            // Set up existing metadata
            await manager.setFileEntry('update.txt', {
                fileId: 'file-update',
                metadata: {
                    path: 'update.txt',
                    hash: 'old-hash',
                    size: 100,
                    lastModified: new Date().toISOString(),
                    mimeType: 'text/plain'
                },
                uploadedAt: new Date().toISOString(),
                version: 1
            });

            const localFiles = [createLocalFile('update.txt', 'new-hash')];
            const remoteFiles = [createRemoteFile('file-update', 'update.txt')];

            const result = await manager.compareFiles(localFiles, remoteFiles);

            expect(result.toUpdate).toHaveLength(1);
            expect(result.toUpdate[0].path).toBe('update.txt');
            expect(result.toUpdate[0].fileId).toBe('file-update');
        });

        it('should identify files to delete', async () => {
            // Set up existing metadata
            await manager.setFileEntry('delete.txt', {
                fileId: 'file-delete',
                metadata: {
                    path: 'delete.txt',
                    hash: 'delete-hash',
                    size: 100,
                    lastModified: new Date().toISOString(),
                    mimeType: 'text/plain'
                },
                uploadedAt: new Date().toISOString(),
                version: 1
            });

            const localFiles: Array<{ path: string; metadata: FileMetadata }> = [];
            const remoteFiles = [createRemoteFile('file-delete', 'delete.txt')];

            const result = await manager.compareFiles(localFiles, remoteFiles);

            expect(result.toDelete).toHaveLength(1);
            expect(result.toDelete[0].fileId).toBe('file-delete');
        });

        it('should identify unchanged files', async () => {
            const hash = 'same-hash';
            await manager.setFileEntry('unchanged.txt', {
                fileId: 'file-unchanged',
                metadata: {
                    path: 'unchanged.txt',
                    hash,
                    size: 100,
                    lastModified: new Date().toISOString(),
                    mimeType: 'text/plain'
                },
                uploadedAt: new Date().toISOString(),
                version: 1
            });

            const localFiles = [createLocalFile('unchanged.txt', hash)];
            const remoteFiles = [createRemoteFile('file-unchanged', 'unchanged.txt')];

            const result = await manager.compareFiles(localFiles, remoteFiles);

            expect(result.unchanged).toHaveLength(1);
            expect(result.unchanged[0].path).toBe('unchanged.txt');
        });
    });

    describe('cleanup', () => {
        it('should remove entries for files not in remote', async () => {
            // Add entries
            await manager.setFileEntry('keep.txt', {
                fileId: 'file-keep',
                metadata: {
                    path: 'keep.txt',
                    hash: 'keep-hash',
                    size: 100,
                    lastModified: new Date().toISOString(),
                    mimeType: 'text/plain'
                },
                uploadedAt: new Date().toISOString(),
                version: 1
            });

            await manager.setFileEntry('remove.txt', {
                fileId: 'file-remove',
                metadata: {
                    path: 'remove.txt',
                    hash: 'remove-hash',
                    size: 100,
                    lastModified: new Date().toISOString(),
                    mimeType: 'text/plain'
                },
                uploadedAt: new Date().toISOString(),
                version: 1
            });

            // Only keep.txt exists in remote
            const remoteFiles: VectorStoreFile[] = [{
                id: 'file-keep',
                metadata: {
                    path: 'keep.txt',
                    hash: 'keep-hash',
                    size: 100,
                    lastModified: new Date().toISOString(),
                    mimeType: 'text/plain'
                }
            }];

            await manager.cleanup(remoteFiles);

            const allFiles = await manager.getAllFiles();
            expect(Object.keys(allFiles)).toEqual(['keep.txt']);
        });
    });
}); 