import { VectorStoreProvider, SyncOptions, SyncResult, ProgressCallback } from '../types';
import { FileScanner } from './file-scanner';
import { MetadataManager } from './metadata-manager';
import { GitMetadataManager } from './git-metadata-manager';
import chalk from 'chalk';
import ora from 'ora';

export class SyncEngine {
    private provider: VectorStoreProvider;
    private scanner: FileScanner;
    private metadataManager: MetadataManager;
    private verbose: boolean = false;

    constructor(provider: VectorStoreProvider, metadataPath?: string, useGitNotes: boolean = true) {
        this.provider = provider;
        this.scanner = new FileScanner();

        // Use git notes by default, fall back to file-based if requested
        if (useGitNotes) {
            this.metadataManager = new GitMetadataManager();
        } else {
            this.metadataManager = new MetadataManager(metadataPath);
        }
    }

    async sync(options: SyncOptions): Promise<SyncResult> {
        const startTime = Date.now();
        this.verbose = options.verbose || false;

        const result: SyncResult = {
            added: [],
            updated: [],
            deleted: [],
            unchanged: [],
            failed: [],
            duration: 0
        };

        try {
            // If using git notes, fetch them first
            if (this.metadataManager instanceof GitMetadataManager) {
                this.log('Fetching metadata from git notes...');
                await this.metadataManager.fetchNotes();
            }

            // Step 1: Verify vector store
            this.log('Verifying vector store...');
            const storeExists = await this.provider.verifyStore();

            if (!storeExists) {
                const storeId = await this.metadataManager.getStoreId();
                if (!storeId) {
                    throw new Error('Vector store does not exist and no store ID configured');
                }
            }

            // Step 2: Scan local files
            const spinner = ora('Scanning local files...').start();
            const scannedFiles = await this.scanner.scan({
                directory: options.directory,
                patterns: options.patterns,
                exclude: options.exclude
            });
            spinner.succeed(`Found ${scannedFiles.length} files`);

            // Step 3: Get remote files
            spinner.text = 'Fetching remote files...';
            spinner.start();
            const remoteFiles = await this.provider.listFiles();
            spinner.succeed(`Found ${remoteFiles.length} remote files`);

            // Step 4: Compare files
            this.log('Comparing files...');
            const comparison = await this.metadataManager.compareFiles(
                scannedFiles.map(f => ({ path: f.path, metadata: f.metadata })),
                remoteFiles
            );

            // Log the plan
            console.log(chalk.cyan('\nSync Plan:'));
            console.log(chalk.green(`  Add: ${comparison.toAdd.length} files`));
            console.log(chalk.yellow(`  Update: ${comparison.toUpdate.length} files`));
            console.log(chalk.red(`  Delete: ${comparison.toDelete.length} files`));
            console.log(chalk.gray(`  Unchanged: ${comparison.unchanged.length} files`));

            if (options.dryRun) {
                console.log(chalk.magenta('\nDry run mode - no changes will be made'));
                result.duration = Date.now() - startTime;
                return result;
            }

            // Step 5: Process additions
            if (comparison.toAdd.length > 0) {
                console.log(chalk.green('\nAdding new files...'));
                for (const file of comparison.toAdd) {
                    const scannedFile = scannedFiles.find(f => f.path === file.path);
                    if (!scannedFile) continue;

                    try {
                        spinner.text = `Adding ${file.path}...`;
                        spinner.start();

                        const enrichedMetadata = await this.provider.enrichMetadata(
                            scannedFile.absolutePath,
                            scannedFile.content,
                            file.metadata
                        );

                        const fileId = await this.provider.uploadFile(
                            scannedFile.absolutePath,
                            scannedFile.content,
                            enrichedMetadata,
                            this.createProgressCallback(file.path)
                        );

                        await this.metadataManager.setFileEntry(file.path, {
                            fileId,
                            metadata: enrichedMetadata,
                            uploadedAt: new Date().toISOString(),
                            version: 1
                        });

                        result.added.push(file.path);
                        spinner.succeed(`Added ${file.path}`);
                    } catch (error) {
                        spinner.fail(`Failed to add ${file.path}`);
                        result.failed.push({
                            path: file.path,
                            error: error instanceof Error ? error.message : String(error)
                        });
                    }
                }
            }

            // Step 6: Process updates
            if (comparison.toUpdate.length > 0) {
                console.log(chalk.yellow('\nUpdating changed files...'));
                for (const file of comparison.toUpdate) {
                    const scannedFile = scannedFiles.find(f => f.path === file.path);
                    if (!scannedFile) continue;

                    try {
                        spinner.text = `Updating ${file.path}...`;
                        spinner.start();

                        const enrichedMetadata = await this.provider.enrichMetadata(
                            scannedFile.absolutePath,
                            scannedFile.content,
                            file.metadata
                        );

                        await this.provider.updateFile(
                            file.fileId,
                            scannedFile.content,
                            enrichedMetadata,
                            this.createProgressCallback(file.path)
                        );

                        const existingEntry = await this.metadataManager.getFileEntry(file.path);
                        await this.metadataManager.setFileEntry(file.path, {
                            fileId: file.fileId,
                            metadata: enrichedMetadata,
                            uploadedAt: new Date().toISOString(),
                            version: (existingEntry?.version || 0) + 1
                        });

                        result.updated.push(file.path);
                        spinner.succeed(`Updated ${file.path}`);
                    } catch (error) {
                        spinner.fail(`Failed to update ${file.path}`);
                        result.failed.push({
                            path: file.path,
                            error: error instanceof Error ? error.message : String(error)
                        });
                    }
                }
            }

            // Step 7: Process deletions
            if (comparison.toDelete.length > 0) {
                console.log(chalk.red('\nDeleting removed files...'));
                for (const file of comparison.toDelete) {
                    try {
                        spinner.text = `Deleting ${file.path}...`;
                        spinner.start();

                        await this.provider.deleteFile(file.fileId);
                        await this.metadataManager.removeFileEntry(file.path);

                        result.deleted.push(file.path);
                        spinner.succeed(`Deleted ${file.path}`);
                    } catch (error) {
                        spinner.fail(`Failed to delete ${file.path}`);
                        result.failed.push({
                            path: file.path,
                            error: error instanceof Error ? error.message : String(error)
                        });
                    }
                }
            }

            // Step 8: Record unchanged files
            result.unchanged = comparison.unchanged.map(f => f.path);

            // Step 9: Save metadata
            await this.metadataManager.save();

            // If using git notes, push them
            if (this.metadataManager instanceof GitMetadataManager) {
                this.log('Pushing metadata to git notes...');
                await this.metadataManager.pushNotes();
            }

            // Step 10: Cleanup
            await this.provider.cleanup();

        } catch (error) {
            console.error(chalk.red('\nSync failed:'), error);
            throw error;
        }

        result.duration = Date.now() - startTime;

        // Print summary
        console.log(chalk.cyan('\nSync Summary:'));
        console.log(chalk.green(`  ✓ Added: ${result.added.length} files`));
        console.log(chalk.yellow(`  ✓ Updated: ${result.updated.length} files`));
        console.log(chalk.red(`  ✓ Deleted: ${result.deleted.length} files`));
        console.log(chalk.gray(`  - Unchanged: ${result.unchanged.length} files`));
        if (result.failed.length > 0) {
            console.log(chalk.red(`  ✗ Failed: ${result.failed.length} files`));
        }
        console.log(chalk.blue(`\nCompleted in ${(result.duration / 1000).toFixed(2)}s`));

        return result;
    }

    private log(message: string): void {
        if (this.verbose) {
            console.log(chalk.gray(`[sync] ${message}`));
        }
    }

    private createProgressCallback(filePath: string): ProgressCallback {
        return (progress) => {
            if (this.verbose) {
                console.log(chalk.gray(`  ${filePath}: ${progress.message} (${progress.current}/${progress.total})`));
            }
        };
    }
} 