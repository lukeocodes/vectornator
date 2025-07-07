import { exec } from 'child_process';
import { promisify } from 'util';
import { StoredMetadata, MetadataManager } from './metadata-manager';

const execAsync = promisify(exec);

/**
 * Git Notes-based metadata manager
 * Stores vector store metadata in git notes instead of files
 */
export class GitMetadataManager extends MetadataManager {
    private readonly notesRef = 'refs/notes/vectornator';
    private gitConfigured = false;

    constructor() {
        super('.vectornator/metadata.json'); // Keep file path for fallback
    }

    /**
     * Configure git to use our notes namespace
     */
    private async configureGit(): Promise<void> {
        if (this.gitConfigured) return;

        try {
            // Add our notes ref to display refs
            await execAsync(`git config --add notes.displayRef ${this.notesRef}`);

            // Ensure we fetch notes
            await execAsync(`git config --add remote.origin.fetch "+refs/notes/*:refs/notes/*"`);

            this.gitConfigured = true;
        } catch (error) {
            console.warn('Failed to configure git notes, falling back to file-based metadata');
        }
    }

    /**
     * Get the current commit SHA
     */
    private async getCurrentCommit(): Promise<string> {
        try {
            const { stdout } = await execAsync('git rev-parse HEAD');
            return stdout.trim();
        } catch {
            return 'HEAD';
        }
    }

    /**
     * Read metadata from git notes
     */
    async load(): Promise<StoredMetadata> {
        await this.configureGit();

        try {
            // Try to read from git notes first
            const commit = await this.getCurrentCommit();
            const { stdout } = await execAsync(`git notes --ref=vectornator show ${commit} 2>/dev/null`);

            if (stdout) {
                this.metadata = JSON.parse(stdout);
                return this.metadata!;
            }
        } catch {
            // Notes don't exist or git not available
        }

        // Fall back to file-based metadata
        return super.load();
    }

    /**
     * Save metadata to git notes
     */
    async save(): Promise<void> {
        if (!this.metadata) {
            throw new Error('No metadata to save');
        }

        this.metadata.lastSync = new Date().toISOString();

        try {
            await this.configureGit();

            // Save to git notes
            const commit = await this.getCurrentCommit();
            const metadataJson = JSON.stringify(this.metadata, null, 2);

            // Write to a temp file to avoid shell escaping issues
            const tempFile = `/tmp/vectornator-metadata-${Date.now()}.json`;
            const fs = await import('fs/promises');
            await fs.writeFile(tempFile, metadataJson);

            // Add note to current commit
            await execAsync(`git notes --ref=vectornator add -f -F ${tempFile} ${commit}`);

            // Clean up temp file
            await fs.unlink(tempFile);

            // Also save to file as backup
            await super.save();
        } catch (error) {
            console.warn('Failed to save to git notes, falling back to file-based metadata');
            // Fall back to file-based save
            await super.save();
        }
    }

    /**
     * Push notes to remote
     */
    async pushNotes(): Promise<void> {
        try {
            await execAsync(`git push origin ${this.notesRef}`);
        } catch (error) {
            console.warn('Failed to push notes to remote:', error);
        }
    }

    /**
     * Fetch notes from remote
     */
    async fetchNotes(): Promise<void> {
        try {
            await execAsync(`git fetch origin ${this.notesRef}:${this.notesRef}`);
        } catch (error) {
            console.warn('Failed to fetch notes from remote:', error);
        }
    }

    /**
     * Get metadata for a specific commit
     */
    async getMetadataForCommit(commit: string): Promise<StoredMetadata | null> {
        try {
            const { stdout } = await execAsync(`git notes --ref=vectornator show ${commit} 2>/dev/null`);
            if (stdout) {
                return JSON.parse(stdout);
            }
        } catch {
            // No notes for this commit
        }
        return null;
    }

    /**
     * List all commits with metadata
     */
    async listCommitsWithMetadata(): Promise<string[]> {
        try {
            const { stdout } = await execAsync(`git notes --ref=vectornator list`);
            return stdout.trim().split('\n').filter(line => line);
        } catch {
            return [];
        }
    }
} 