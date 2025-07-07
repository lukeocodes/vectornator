import * as https from 'https';
import * as path from 'path';
import * as crypto from 'crypto';
import { BaseVectorStoreProvider } from './base';
import {
    VectorStoreFile,
    FileMetadata,
    ProgressCallback
} from '../types';

interface UploadInfo {
    uploadId: string;
    fileSize: number;
    filePath: string;
    filename: string;
}

export class OpenAIProvider extends BaseVectorStoreProvider {
    name = 'openai';
    private apiKey = '';
    private storeId = '';
    private readonly chunkSize = 64 * 1024 * 1024; // 64MB chunks

    protected async validateConfig(): Promise<void> {
        if (!this.config.apiKey) {
            throw new Error('OpenAI API key is required');
        }
        this.apiKey = this.config.apiKey;
        this.storeId = this.config.storeId || '';
    }

    protected async connect(): Promise<void> {
        // Test connection by making a simple API call
        try {
            await this.makeRequest('models', 'GET');
        } catch (error) {
            throw new Error(`Failed to connect to OpenAI API: ${error}`);
        }
    }

    async verifyStore(): Promise<boolean> {
        this.ensureInitialized();
        if (!this.storeId) return false;

        try {
            const response = await this.makeRequest(`vector_stores/${this.storeId}`, 'GET');
            return response.id === this.storeId;
        } catch {
            return false;
        }
    }

    async createStore(name: string): Promise<string> {
        this.ensureInitialized();

        const response = await this.makeRequest('vector_stores', 'POST', { name });
        if (!response.id) {
            throw new Error('Failed to create vector store');
        }

        this.storeId = response.id;
        return response.id;
    }

    async listFiles(): Promise<VectorStoreFile[]> {
        this.ensureInitialized();
        if (!this.storeId) {
            throw new Error('Vector store ID not set');
        }

        const allFiles: VectorStoreFile[] = [];
        let lastId: string | null = null;
        let hasMore = true;

        while (hasMore) {
            const queryParams: Record<string, string | number> = { limit: 100 };
            if (lastId) {
                queryParams.after = lastId;
            }

            const response = await this.makeRequest(
                `vector_stores/${this.storeId}/files`,
                'GET',
                null,
                { queryParams }
            );

            if (response.data) {
                for (const file of response.data) {
                    // Try to extract metadata from attributes
                    const metadata: FileMetadata = {
                        path: file.attributes?.full_path || file.filename || '',
                        hash: file.attributes?.hash || '',
                        size: file.attributes?.size || 0,
                        lastModified: file.attributes?.modified_date || file.created_at || '',
                        mimeType: 'text/markdown',
                        ...file.attributes
                    };

                    allFiles.push({
                        id: file.id,
                        metadata
                    });
                }
            }

            hasMore = response.has_more === true;
            if (hasMore && response.last_id) {
                lastId = response.last_id;
            }
        }

        return allFiles;
    }

    async getFile(fileId: string): Promise<VectorStoreFile | null> {
        this.ensureInitialized();

        try {
            const response = await this.makeRequest(`files/${fileId}`, 'GET');
            if (!response.id) return null;

            const metadata: FileMetadata = {
                path: response.filename || '',
                hash: '',
                size: response.bytes || 0,
                lastModified: response.created_at || new Date().toISOString(),
                mimeType: 'text/markdown'
            };

            return {
                id: response.id,
                metadata
            };
        } catch {
            return null;
        }
    }

    async uploadFile(
        filePath: string,
        content: Buffer,
        metadata: FileMetadata,
        onProgress?: ProgressCallback
    ): Promise<string> {
        this.ensureInitialized();
        if (!this.storeId) {
            throw new Error('Vector store ID not set');
        }

        const uploadInfo = await this.createUpload(filePath, content.length);
        const uploadData = await this.uploadFileInChunks(
            uploadInfo,
            content,
            onProgress
        );
        const fileId = await this.completeUpload(uploadData);

        // Add file to vector store with metadata
        await this.addFileToVectorStore(fileId, metadata);

        return fileId;
    }

    async updateFile(
        fileId: string,
        content: Buffer,
        metadata: FileMetadata,
        onProgress?: ProgressCallback
    ): Promise<void> {
        this.ensureInitialized();

        // OpenAI doesn't support updating files, so we delete and re-upload
        await this.deleteFile(fileId);
        await this.uploadFile(metadata.path, content, metadata, onProgress);
    }

    async deleteFile(fileId: string): Promise<void> {
        this.ensureInitialized();
        if (!this.storeId) {
            throw new Error('Vector store ID not set');
        }

        await this.makeRequest(
            `vector_stores/${this.storeId}/files/${fileId}`,
            'DELETE'
        );
    }

    async searchByMetadata(query: Record<string, string | number | boolean>): Promise<VectorStoreFile[]> {
        // OpenAI doesn't support metadata search, so we need to list all and filter
        const allFiles = await this.listFiles();

        return allFiles.filter(file => {
            for (const [key, value] of Object.entries(query)) {
                if (file.metadata[key] !== value) {
                    return false;
                }
            }
            return true;
        });
    }

    async enrichMetadata(
        filePath: string,
        content: Buffer,
        baseMetadata: FileMetadata
    ): Promise<FileMetadata> {
        const enriched = await super.enrichMetadata(filePath, content, baseMetadata);

        // Add OpenAI-specific metadata
        return {
            ...enriched,
            hash: crypto.createHash('md5').update(content).digest('hex'),
            encoding: 'utf-8',
            provider: 'openai',
            storeId: this.storeId
        };
    }

    private async createUpload(filePath: string, fileSize: number): Promise<UploadInfo> {
        const filename = path.basename(filePath);
        const uploadFilename = filename.endsWith('.mdx')
            ? filename.replace('.mdx', '.md')
            : filename;

        const response = await this.makeRequest('uploads', 'POST', {
            purpose: 'assistants',
            filename: uploadFilename,
            bytes: fileSize,
            mime_type: 'text/markdown'
        });

        if (!response.id) {
            throw new Error('Failed to create upload');
        }

        return {
            uploadId: response.id,
            fileSize,
            filePath,
            filename: uploadFilename
        };
    }

    private async uploadFileInChunks(
        uploadInfo: UploadInfo,
        content: Buffer,
        onProgress?: ProgressCallback
    ): Promise<{ uploadId: string; partIds: string[] }> {
        const { uploadId, fileSize } = uploadInfo;
        const totalChunks = Math.ceil(fileSize / this.chunkSize);
        const partIds: string[] = [];

        for (let i = 0; i < totalChunks; i++) {
            const startByte = i * this.chunkSize;
            const endByte = Math.min(startByte + this.chunkSize, fileSize);
            const chunk = content.slice(startByte, endByte);

            this.reportProgress(
                onProgress,
                i + 1,
                totalChunks,
                `Uploading chunk ${i + 1}/${totalChunks}`,
                uploadInfo.filename
            );

            const partResponse = await this.uploadFilePart(
                uploadId,
                i + 1,
                chunk
            );

            partIds.push(partResponse.id);
        }

        return { uploadId, partIds };
    }

    private async uploadFilePart(
        uploadId: string,
        partNumber: number,
        chunk: Buffer
    ): Promise<{ id: string }> {
        const boundary = `----WebKitFormBoundary${Math.random().toString(16).substr(2)}`;

        let payload = `--${boundary}\r\n`;
        payload += 'Content-Disposition: form-data; name="data"; filename="blob"\r\n';
        payload += 'Content-Type: application/octet-stream\r\n\r\n';

        const headerBuffer = Buffer.from(payload);
        const footerBuffer = Buffer.from(`\r\n--${boundary}--\r\n`);

        const body = Buffer.concat([headerBuffer, chunk, footerBuffer]);

        const response = await this.makeRequest(
            `uploads/${uploadId}/parts`,
            'POST',
            body,
            {
                headers: {
                    'Content-Type': `multipart/form-data; boundary=${boundary}`
                },
                raw: true
            }
        );

        if (!response.id) {
            throw new Error('Failed to upload file part');
        }

        return response;
    }

    private async completeUpload(uploadData: { uploadId: string; partIds: string[] }): Promise<string> {
        const response = await this.makeRequest(
            `uploads/${uploadData.uploadId}/complete`,
            'POST',
            { part_ids: uploadData.partIds }
        );

        if (!response.file?.id) {
            throw new Error('Failed to complete upload');
        }

        return response.file.id;
    }

    private async addFileToVectorStore(fileId: string, metadata: FileMetadata): Promise<void> {
        const attributes = {
            ...metadata,
            full_path: metadata.path,
            modified_date: metadata.lastModified,
            mime_type: metadata.mimeType
        };

        await this.makeRequest(
            `vector_stores/${this.storeId}/files`,
            'POST',
            {
                file_id: fileId,
                attributes
            },
            {
                headers: {
                    'OpenAI-Beta': 'assistants=v2'
                }
            }
        );
    }

    private async makeRequest(
        endpoint: string,
        method: string,
        data?: Buffer | Record<string, unknown> | null,
        options: {
            queryParams?: Record<string, string | number>;
            headers?: Record<string, string>;
            raw?: boolean;
        } = {}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): Promise<any> {
        let path = `/v1/${endpoint}`;

        if (options.queryParams) {
            const queryString = Object.entries(options.queryParams)
                .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
                .join('&');
            path = `${path}?${queryString}`;
        }

        const isBuffer = Buffer.isBuffer(data);
        const postData = isBuffer ? data : (data ? JSON.stringify(data) : '');

        const requestOptions: https.RequestOptions = {
            hostname: 'api.openai.com',
            path,
            method,
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                ...(!isBuffer && { 'Content-Type': 'application/json' }),
                ...(postData && { 'Content-Length': Buffer.byteLength(postData) }),
                ...options.headers
            }
        };

        return new Promise((resolve, reject) => {
            const req = https.request(requestOptions, (res) => {
                let body = '';

                res.on('data', (chunk) => {
                    body += chunk;
                });

                res.on('end', () => {
                    if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
                        reject(new Error(`API request failed with status ${res.statusCode}: ${body}`));
                        return;
                    }

                    try {
                        const response = body ? JSON.parse(body) : {};
                        resolve(response);
                    } catch (err) {
                        reject(new Error(`Failed to parse response: ${err}`));
                    }
                });
            });

            req.on('error', reject);
            req.setTimeout(60000, () => {
                req.destroy();
                reject(new Error('Request timed out after 60 seconds'));
            });

            if (postData) {
                req.write(postData);
            }
            req.end();
        });
    }
} 