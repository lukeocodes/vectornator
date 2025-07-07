#!/usr/bin/env node

import { Command } from 'commander';
import { config as loadEnv } from 'dotenv';
import * as path from 'path';
import chalk from 'chalk';
import { SyncEngine } from './core/sync-engine';
import { providerRegistry } from './providers/registry';
import { VectorStoreProvider, VectorStoreConfig } from './types';
import {
    DEFAULT_PROVIDER,
    DEFAULT_STORAGE_TYPE,
    ENV_API_KEY_PREFIX,
    ENV_STORE_ID_PREFIX,
    STORAGE_TYPE_GIT_BRANCH
} from './constants';

// Load environment variables
loadEnv();

// CLI option types
interface SyncOptions {
    directory: string;
    provider: string;
    patterns?: string[];
    exclude?: string[];
    dryRun?: boolean;
    force?: boolean;
    metadataFile?: string;
    metadataStorage?: string;
    storeId?: string;
    apiKey?: string;
    verbose?: boolean;
}

interface ListOptions {
    provider: string;
    storeId?: string;
    apiKey?: string;
}

interface CreateStoreOptions {
    provider: string;
    apiKey?: string;
}

interface ShowMetadataOptions {
    metadataStorage?: string;
    metadataFile?: string;
}

const program = new Command();

program
    .name('vectornator')
    .description('Maintain remote vector stores with your repository content')
    .version('1.0.0');

program
    .command('sync')
    .description('Sync files to vector store')
    .option('-d, --directory <path>', 'Directory to sync', '.')
    .option('-p, --provider <name>', 'Vector store provider', DEFAULT_PROVIDER)
    .option('--patterns <patterns...>', 'File patterns to include')
    .option('--exclude <patterns...>', 'File patterns to exclude')
    .option('--dry-run', 'Show what would be done without making changes')
    .option('--force', 'Force sync even if no changes detected')
    .option('--metadata-file <path>', 'Path to metadata file (when using file storage)')
    .option('--metadata-storage <type>', 'Metadata storage type: git-branch or file', DEFAULT_STORAGE_TYPE)
    .option('--store-id <id>', 'Vector store ID')
    .option('--api-key <key>', 'API key for the provider')
    .option('-v, --verbose', 'Verbose output')
    .action(async (options: SyncOptions) => {
        try {
            console.log(chalk.cyan('🚀 Vectornator - Vector Store Sync\n'));

            // Get provider
            const provider = await getProvider(options.provider, {
                apiKey: options.apiKey || process.env[`${options.provider.toUpperCase()}${ENV_API_KEY_PREFIX}`],
                storeId: options.storeId || process.env[`${options.provider.toUpperCase()}${ENV_STORE_ID_PREFIX}`]
            });

            // Create sync engine
            const metadataStorage = options.metadataStorage || DEFAULT_STORAGE_TYPE;
            const engine = new SyncEngine(provider, options.metadataFile, metadataStorage);

            console.log(chalk.gray(`Using ${metadataStorage} for metadata storage`));

            // Run sync
            const result = await engine.sync({
                directory: path.resolve(options.directory),
                patterns: options.patterns,
                exclude: options.exclude,
                dryRun: options.dryRun,
                force: options.force,
                verbose: options.verbose
            });

            // Exit with appropriate code
            process.exit(result.failed.length > 0 ? 1 : 0);
        } catch (error) {
            console.error(chalk.red('Error:'), error);
            process.exit(1);
        }
    });

program
    .command('list')
    .description('List files in vector store')
    .option('-p, --provider <name>', 'Vector store provider', 'openai')
    .option('--store-id <id>', 'Vector store ID')
    .option('--api-key <key>', 'API key for the provider')
    .action(async (options: ListOptions) => {
        try {
            const provider = await getProvider(options.provider, {
                apiKey: options.apiKey || process.env[`${options.provider.toUpperCase()}_API_KEY`],
                storeId: options.storeId || process.env[`${options.provider.toUpperCase()}_STORE_ID`]
            });

            const files = await provider.listFiles();

            console.log(chalk.cyan(`\nFiles in vector store (${files.length} total):\n`));

            for (const file of files) {
                console.log(`  ${chalk.green('•')} ${file.metadata.path || file.id}`);
                if (file.metadata.size) {
                    console.log(`    Size: ${formatBytes(file.metadata.size)}`);
                }
                if (file.metadata.lastModified) {
                    console.log(`    Modified: ${new Date(file.metadata.lastModified).toLocaleString()}`);
                }
            }

            await provider.cleanup();
        } catch (error) {
            console.error(chalk.red('Error:'), error);
            process.exit(1);
        }
    });

program
    .command('create-store <name>')
    .description('Create a new vector store')
    .option('-p, --provider <name>', 'Vector store provider', 'openai')
    .option('--api-key <key>', 'API key for the provider')
    .action(async (name: string, options: CreateStoreOptions) => {
        try {
            const provider = await getProvider(options.provider, {
                apiKey: options.apiKey || process.env[`${options.provider.toUpperCase()}_API_KEY`]
            });

            console.log(chalk.cyan(`Creating vector store: ${name}...`));
            const storeId = await provider.createStore(name);

            console.log(chalk.green(`\n✓ Vector store created successfully!`));
            console.log(chalk.gray(`Store ID: ${storeId}`));
            console.log(chalk.gray(`\nAdd this to your environment variables:`));
            console.log(chalk.yellow(`${options.provider.toUpperCase()}_STORE_ID=${storeId}`));

            await provider.cleanup();
        } catch (error) {
            console.error(chalk.red('Error:'), error);
            process.exit(1);
        }
    });

program
    .command('show-metadata')
    .description('Show metadata')
    .option('--metadata-storage <type>', 'Metadata storage type: git-branch or file', 'git-branch')
    .option('--metadata-file <path>', 'Path to metadata file (when using file storage)')
    .action(async (options: ShowMetadataOptions) => {
        try {
            const metadataStorage = options.metadataStorage || 'git-branch';

            if (metadataStorage === STORAGE_TYPE_GIT_BRANCH) {
                const { GitBranchMetadataManager } = await import('./core/git-branch-metadata-manager');
                const manager = new GitBranchMetadataManager();

                console.log(chalk.cyan('\nGit branch metadata:\n'));

                const metadata = await manager.load();
                console.log(JSON.stringify(metadata, null, 2));
            } else {
                const { MetadataManager } = await import('./core/metadata-manager');
                const manager = new MetadataManager(options.metadataFile);

                const metadata = await manager.load();
                console.log(chalk.cyan('\nFile-based metadata:\n'));
                console.log(JSON.stringify(metadata, null, 2));
            }
        } catch (error) {
            console.error(chalk.red('Error:'), error);
            process.exit(1);
        }
    });

async function getProvider(name: string, config: VectorStoreConfig): Promise<VectorStoreProvider> {
    return providerRegistry.get(name, config);
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

program.parse(); 