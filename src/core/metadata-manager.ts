import * as fs from 'fs/promises';
import * as path from 'path';
import { FileMetadata, VectorStoreFile } from '../types';

export interface StoredMetadata {
    version: string;
    lastSync: string;
    storeId?: string;
    files: Record<string, FileEntry>;
}

export interface FileEntry {
    fileId: string;
    metadata: FileMetadata;
    uploadedAt: string;
    version: number;
}

export class MetadataManager {
    private metadataPath: string;
    protected metadata: StoredMetadata | null = null;

    constructor(metadataPath?: string) {
        this.metadataPath = metadataPath || '.vectornator/metadata.json';
    }

    async load(): Promise<StoredMetadata> {
        if (this.metadata) {
            return this.metadata;
        }

        try {
            const content = await fs.readFile(this.metadataPath, 'utf-8');
            this.metadata = JSON.parse(content);
            return this.metadata!;
        } catch (error) {
            // File doesn't exist or is invalid, create new metadata
            this.metadata = {
                version: '1.0.0',
                lastSync: new Date().toISOString(),
                files: {}
            };
            return this.metadata;
        }
    }

    async save(): Promise<void> {
        if (!this.metadata) {
            throw new Error('No metadata to save');
        }

        this.metadata.lastSync = new Date().toISOString();

        // Ensure directory exists
        const dir = path.dirname(this.metadataPath);
        await fs.mkdir(dir, { recursive: true });

        // Save with pretty formatting
        await fs.writeFile(
            this.metadataPath,
            JSON.stringify(this.metadata, null, 2),
            'utf-8'
        );
    }

    async getFileEntry(filePath: string): Promise<FileEntry | null> {
        const metadata = await this.load();
        return metadata.files[filePath] || null;
    }

    async setFileEntry(filePath: string, entry: FileEntry): Promise<void> {
        const metadata = await this.load();
        metadata.files[filePath] = entry;
        this.metadata = metadata;
    }

    async removeFileEntry(filePath: string): Promise<void> {
        const metadata = await this.load();
        delete metadata.files[filePath];
        this.metadata = metadata;
    }

    async getAllFiles(): Promise<Record<string, FileEntry>> {
        const metadata = await this.load();
        return metadata.files;
    }

    async setStoreId(storeId: string): Promise<void> {
        const metadata = await this.load();
        metadata.storeId = storeId;
        this.metadata = metadata;
    }

    async getStoreId(): Promise<string | undefined> {
        const metadata = await this.load();
        return metadata.storeId;
    }

    /**
     * Compare local files with stored metadata to determine what needs to be synced
     */
    async compareFiles(
        localFiles: Array<{ path: string; metadata: FileMetadata }>,
        remoteFiles: VectorStoreFile[]
    ): Promise<{
        toAdd: Array<{ path: string; metadata: FileMetadata }>;
        toUpdate: Array<{ path: string; metadata: FileMetadata; fileId: string }>;
        toDelete: Array<{ fileId: string; path: string }>;
        unchanged: Array<{ path: string; fileId: string }>;
    }> {
        const metadata = await this.load();
        const toAdd: Array<{ path: string; metadata: FileMetadata }> = [];
        const toUpdate: Array<{ path: string; metadata: FileMetadata; fileId: string }> = [];
        const unchanged: Array<{ path: string; fileId: string }> = [];

        // Create a map of remote files by ID for quick lookup
        const remoteFileMap = new Map<string, VectorStoreFile>();
        for (const file of remoteFiles) {
            remoteFileMap.set(file.id, file);
        }

        // Check each local file
        for (const localFile of localFiles) {
            const entry = metadata.files[localFile.path];

            if (!entry) {
                // File not in metadata, needs to be added
                toAdd.push(localFile);
            } else {
                // Check if file still exists in remote
                const remoteFile = remoteFileMap.get(entry.fileId);

                if (!remoteFile) {
                    // File in metadata but not in remote, re-add it
                    toAdd.push(localFile);
                } else if (entry.metadata.hash !== localFile.metadata.hash) {
                    // File content changed, needs update
                    toUpdate.push({
                        ...localFile,
                        fileId: entry.fileId
                    });
                    // Remove from remote map as it's been processed
                    remoteFileMap.delete(entry.fileId);
                } else {
                    // File unchanged
                    unchanged.push({
                        path: localFile.path,
                        fileId: entry.fileId
                    });
                    // Remove from remote map as it's been processed
                    remoteFileMap.delete(entry.fileId);
                }
            }
        }

        // Any files left in remoteFileMap need to be deleted
        const toDelete: Array<{ fileId: string; path: string }> = [];
        for (const [fileId, remoteFile] of remoteFileMap) {
            // Try to find the path from metadata
            let filePath = remoteFile.metadata.path || 'unknown';

            // Search metadata for this file ID
            for (const [path, entry] of Object.entries(metadata.files)) {
                if (entry.fileId === fileId) {
                    filePath = path;
                    break;
                }
            }

            toDelete.push({ fileId, path: filePath });
        }

        return { toAdd, toUpdate, toDelete, unchanged };
    }

    /**
     * Clean up metadata entries that no longer exist in remote
     */
    async cleanup(remoteFiles: VectorStoreFile[]): Promise<void> {
        const metadata = await this.load();
        const remoteFileIds = new Set(remoteFiles.map(f => f.id));

        // Remove entries for files that no longer exist in remote
        for (const [path, entry] of Object.entries(metadata.files)) {
            if (!remoteFileIds.has(entry.fileId)) {
                delete metadata.files[path];
            }
        }

        this.metadata = metadata;
    }
} 