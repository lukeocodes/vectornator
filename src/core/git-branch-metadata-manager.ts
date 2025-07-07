import { exec } from 'child_process';
import { promisify } from 'util';
import { StoredMetadata, MetadataManager } from './metadata-manager';

const execAsync = promisify(exec);

/**
 * Git Branch-based metadata manager
 * Stores vector store metadata in a dedicated git branch
 */
export class GitBranchMetadataManager extends MetadataManager {
    private readonly metadataBranch = 'vectornator-metadata';
    private readonly metadataFile = 'metadata.json';
    private gitConfigured = false;

    constructor() {
        super('.vectornator/metadata.json'); // Keep file path for local operations
    }

    /**
     * Ensure the metadata branch exists
     */
    private async ensureMetadataBranch(): Promise<void> {
        try {
            // Check if branch exists locally
            await execAsync(`git rev-parse --verify ${this.metadataBranch}`);
        } catch {
            // Branch doesn't exist, create an orphan branch
            try {
                // Save current branch
                const { stdout: currentBranch } = await execAsync('git rev-parse --abbrev-ref HEAD');
                const branch = currentBranch.trim();

                // Create orphan branch
                await execAsync(`git checkout --orphan ${this.metadataBranch}`);

                // Remove all files from index
                await execAsync('git rm -rf . 2>/dev/null || true');

                // Create initial metadata
                const initialMetadata: StoredMetadata = {
                    version: '1.0.0',
                    lastSync: new Date().toISOString(),
                    files: {}
                };

                const fs = await import('fs/promises');
                await fs.writeFile(this.metadataFile, JSON.stringify(initialMetadata, null, 2));

                // Commit initial metadata
                await execAsync(`git add ${this.metadataFile}`);
                await execAsync(`git commit -m "Initialize vectornator metadata"`);

                // Switch back to original branch
                await execAsync(`git checkout ${branch}`);
            } catch (error) {
                console.error('Failed to create metadata branch:', error);
                throw error;
            }
        }
    }

    /**
     * Read metadata from git branch
     */
    async load(): Promise<StoredMetadata> {
        try {
            await this.ensureMetadataBranch();

            // Read file from metadata branch without checking it out
            const { stdout } = await execAsync(
                `git show ${this.metadataBranch}:${this.metadataFile} 2>/dev/null`
            );

            if (stdout) {
                this.metadata = JSON.parse(stdout);
                return this.metadata!;
            }
        } catch (error) {
            console.warn('Failed to load from git branch, falling back to file-based metadata');
        }

        // Fall back to file-based metadata
        return super.load();
    }

    /**
     * Save metadata to git branch
     */
    async save(): Promise<void> {
        if (!this.metadata) {
            throw new Error('No metadata to save');
        }

        this.metadata.lastSync = new Date().toISOString();

        try {
            await this.ensureMetadataBranch();

            // Save current branch (not needed for this operation but keeping for clarity)
            // const { stdout: currentBranch } = await execAsync('git rev-parse --abbrev-ref HEAD');
            // const branch = currentBranch.trim();

            // Create a temporary directory for the operation
            const tempDir = `/tmp/vectornator-${Date.now()}`;
            const fs = await import('fs/promises');
            await fs.mkdir(tempDir, { recursive: true });

            // Write metadata to temp file
            const tempFile = `${tempDir}/${this.metadataFile}`;
            await fs.writeFile(tempFile, JSON.stringify(this.metadata, null, 2));

            // Use git commands to update the branch without switching
            const { stdout: treeHash } = await execAsync(
                `git hash-object -w ${tempFile}`,
                { cwd: process.cwd() }
            );

            // Create tree with the new file
            const { stdout: newTree } = await execAsync(
                `echo "100644 blob ${treeHash.trim()}\t${this.metadataFile}" | git mktree`,
                { cwd: process.cwd() }
            );

            // Get parent commit
            let parentArg = '';
            try {
                const { stdout: parent } = await execAsync(`git rev-parse ${this.metadataBranch}`);
                parentArg = `-p ${parent.trim()}`;
            } catch {
                // No parent (first commit)
            }

            // Create commit
            const message = `Update metadata at ${new Date().toISOString()}`;
            const { stdout: commitHash } = await execAsync(
                `echo "${message}" | git commit-tree ${newTree.trim()} ${parentArg}`,
                { cwd: process.cwd() }
            );

            // Update branch reference
            await execAsync(`git update-ref refs/heads/${this.metadataBranch} ${commitHash.trim()}`);

            // Clean up
            await fs.rm(tempDir, { recursive: true });

            // Also save to file as backup
            await super.save();
        } catch (error) {
            console.error('Failed to save to git branch:', error);
            // Fall back to file-based save
            await super.save();
        }
    }

    /**
     * Push metadata branch to remote
     */
    async pushMetadata(): Promise<void> {
        try {
            await execAsync(`git push origin ${this.metadataBranch}`);
        } catch (error: any) {
            if (error.code === 128 && error.stderr?.includes("'origin' does not appear to be a git repository")) {
                // No remote configured - this is fine for local repos
                return;
            }
            console.warn('Note: Unable to push metadata branch to remote (this is fine for local repositories)');
        }
    }

    /**
     * Fetch metadata branch from remote
     */
    async fetchMetadata(): Promise<void> {
        try {
            // Try to fetch the metadata branch
            await execAsync(`git fetch origin ${this.metadataBranch}:${this.metadataBranch}`);
        } catch (error: any) {
            // Handle common cases gracefully
            if (error.code === 128) {
                if (error.stderr?.includes("couldn't find remote ref")) {
                    // This is normal for first-time use - branch doesn't exist on remote yet
                    return;
                }
                if (error.stderr?.includes("'origin' does not appear to be a git repository")) {
                    // No remote configured - this is fine for local repos
                    return;
                }
            }
            console.warn('Note: Unable to fetch metadata branch from remote (this is normal for first-time use)');
        }
    }
} 