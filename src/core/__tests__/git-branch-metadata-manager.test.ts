import { GitBranchMetadataManager } from '../git-branch-metadata-manager';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

describe('GitBranchMetadataManager', () => {
    let tempDir: string;
    let manager: GitBranchMetadataManager;
    const testBranch = 'test-metadata-branch';
    const originalCwd = process.cwd();

    beforeEach(async () => {
        // Create temporary directory and initialize git repo
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vectornator-git-test-'));

        // Initialize git repo with no signing
        execSync('git init', { cwd: tempDir });
        execSync('git config user.email "test@example.com"', { cwd: tempDir });
        execSync('git config user.name "Test User"', { cwd: tempDir });
        execSync('git config commit.gpgsign false', { cwd: tempDir });

        // Create initial commit
        await fs.writeFile(path.join(tempDir, 'README.md'), '# Test');
        execSync('git add .', { cwd: tempDir });
        execSync('git commit -m "Initial commit" --no-gpg-sign', { cwd: tempDir });

        // Create manager with test branch
        process.env.VECTORNATOR_METADATA_BRANCH = testBranch;
        manager = new GitBranchMetadataManager();

        // Change to temp directory for git operations
        process.chdir(tempDir);
    });

    afterEach(async () => {
        // Restore original directory
        process.chdir(originalCwd);
        // Clean up
        await fs.rm(tempDir, { recursive: true, force: true });
        delete process.env.VECTORNATOR_METADATA_BRANCH;
    });

    describe('branch operations', () => {
        it('should create metadata branch if it does not exist', async () => {
            await manager.load();

            // Check if branch was created
            const branches = execSync('git branch -a', { encoding: 'utf-8' });
            expect(branches).toContain(testBranch);
        });

        it('should use existing branch if available', async () => {
            // Create branch manually
            execSync(`git checkout -b ${testBranch}`, { cwd: tempDir });
            await fs.writeFile(path.join(tempDir, 'metadata.json'), JSON.stringify({
                version: '1.0.0',
                storeId: 'existing-store',
                files: {}
            }));
            execSync('git add .', { cwd: tempDir });
            execSync('git commit -m "Add metadata" --no-gpg-sign', { cwd: tempDir });
            try {
                execSync('git checkout main', { cwd: tempDir });
            } catch {
                execSync('git checkout master', { cwd: tempDir });
            }

            const metadata = await manager.load();
            expect(metadata.storeId).toBe('existing-store');
        });
    });

    describe('metadata operations', () => {
        it('should save and load metadata', async () => {
            await manager.load();
            await manager.setStoreId('test-store-123');
            await manager.save();

            // Create new instance to test persistence
            const newManager = new GitBranchMetadataManager();
            const storeId = await newManager.getStoreId();
            expect(storeId).toBe('test-store-123');
        });

        it('should handle file entries', async () => {
            await manager.load();

            const entry = {
                fileId: 'file-123',
                metadata: {
                    path: 'test.md',
                    hash: 'abc123',
                    size: 100,
                    lastModified: new Date().toISOString(),
                    mimeType: 'text/markdown'
                },
                uploadedAt: new Date().toISOString(),
                version: 1
            };

            await manager.setFileEntry('test.md', entry);
            await manager.save();

            const retrieved = await manager.getFileEntry('test.md');
            expect(retrieved).toEqual(entry);
        });

        it('should remove file entries', async () => {
            await manager.load();

            await manager.setFileEntry('test.md', {
                fileId: 'file-123',
                metadata: {
                    path: 'test.md',
                    hash: 'abc123',
                    size: 100,
                    lastModified: new Date().toISOString(),
                    mimeType: 'text/markdown'
                },
                uploadedAt: new Date().toISOString(),
                version: 1
            });

            await manager.removeFileEntry('test.md');
            await manager.save();

            const retrieved = await manager.getFileEntry('test.md');
            expect(retrieved).toBeNull();
        });
    });

    describe('git operations', () => {
        it('should handle fetch without remote gracefully', async () => {
            // fetchMetadata should not throw when no remote exists
            await expect(manager.fetchMetadata()).resolves.not.toThrow();
        });

        it('should handle push without remote gracefully', async () => {
            // pushMetadata should not throw when no remote exists
            await manager.load();
            await manager.setStoreId('test-store');
            await manager.save();

            await expect(manager.pushMetadata()).resolves.not.toThrow();
        });
    });

    describe('error handling', () => {
        it('should handle corrupted metadata gracefully', async () => {
            // Create branch with invalid JSON
            execSync(`git checkout -b ${testBranch}`, { cwd: tempDir });
            await fs.writeFile(path.join(tempDir, 'metadata.json'), 'invalid json');
            execSync('git add .', { cwd: tempDir });
            execSync('git commit -m "Add invalid metadata" --no-gpg-sign', { cwd: tempDir });
            try {
                execSync('git checkout main', { cwd: tempDir });
            } catch {
                execSync('git checkout master', { cwd: tempDir });
            }

            const metadata = await manager.load();
            expect(metadata.version).toBe('1.0.0');
            expect(metadata.files).toEqual({});
        });

        it('should fall back to file-based storage when not in git repo', async () => {
            // Create non-git directory
            const nonGitDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vectornator-nongit-'));
            process.chdir(nonGitDir);

            const nonGitManager = new GitBranchMetadataManager();
            const metadata = await nonGitManager.load();

            // Should fall back to file-based storage
            expect(metadata.version).toBe('1.0.0');
            expect(metadata.files).toEqual({});

            process.chdir(tempDir);
            await fs.rm(nonGitDir, { recursive: true, force: true });
        });
    });
}); 