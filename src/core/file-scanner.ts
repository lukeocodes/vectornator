import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { glob } from 'glob';
import { FileMetadata } from '../types';

export interface ScanOptions {
    directory: string;
    patterns?: string[];
    exclude?: string[];
}

export interface ScannedFile {
    path: string;
    absolutePath: string;
    content: Buffer;
    metadata: FileMetadata;
}

export class FileScanner {
    private defaultPatterns = ['**/*.md', '**/*.mdx', '**/*.txt'];
    private defaultExcludes = ['node_modules/**', '.git/**', 'dist/**', '*.log'];

    async scan(options: ScanOptions): Promise<ScannedFile[]> {
        const patterns = options.patterns || this.defaultPatterns;
        const exclude = [...this.defaultExcludes, ...(options.exclude || [])];

        const files: ScannedFile[] = [];

        for (const pattern of patterns) {
            const matches = await glob(pattern, {
                cwd: options.directory,
                ignore: exclude,
                nodir: true
            });

            for (const match of matches) {
                const absolutePath = path.join(options.directory, match);
                const file = await this.processFile(match, absolutePath);
                if (file) {
                    files.push(file);
                }
            }
        }

        return files;
    }

    private async processFile(relativePath: string, absolutePath: string): Promise<ScannedFile | null> {
        try {
            const [content, stats] = await Promise.all([
                fs.readFile(absolutePath),
                fs.stat(absolutePath)
            ]);

            const hash = crypto.createHash('sha256').update(content).digest('hex');
            const mimeType = this.getMimeType(absolutePath);

            const metadata: FileMetadata = {
                path: relativePath,
                hash,
                size: stats.size,
                lastModified: stats.mtime.toISOString(),
                mimeType,
                encoding: 'utf-8'
            };

            return {
                path: relativePath,
                absolutePath,
                content,
                metadata
            };
        } catch (error) {
            console.error(`Failed to process file ${relativePath}:`, error);
            return null;
        }
    }

    private getMimeType(filePath: string): string {
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes: Record<string, string> = {
            '.md': 'text/markdown',
            '.mdx': 'text/markdown',
            '.txt': 'text/plain',
            '.json': 'application/json',
            '.yml': 'text/yaml',
            '.yaml': 'text/yaml'
        };

        return mimeTypes[ext] || 'text/plain';
    }

    async getFileHash(filePath: string): Promise<string> {
        const content = await fs.readFile(filePath);
        return crypto.createHash('sha256').update(content).digest('hex');
    }
} 