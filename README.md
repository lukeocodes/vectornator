# Luke's Vectornator

[![GitHub Action](https://img.shields.io/badge/GitHub-Action-blue?logo=github)](https://github.com/marketplace/actions/vectornator-vector-store-sync)
[![npm version](https://img.shields.io/npm/v/@lukeocodes/vectornator.svg)](https://www.npmjs.com/package/@lukeocodes/vectornator)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Maintain remote vector stores with your repository content. Automatically sync documentation, markdown files, and other text content to vector databases for AI applications.

## Features

- 🔄 **Automatic Synchronization**: Keep vector stores in sync with your repository
- 📝 **Smart Change Detection**: Only sync files that have changed using content hashing
- 🎯 **Metadata Rich**: Sends comprehensive metadata with each file
- 🔌 **Extensible**: Support for multiple vector store providers
- 📦 **Dual Usage**: Works as both npm package and GitHub Action
- 🔐 **Git Notes Storage**: Store sync metadata in git notes (no file clutter!)
- 🎨 **Beautiful CLI**: Colored output with progress indicators

## Quick Start

### As a GitHub Action

```yaml
name: Sync to Vector Store
on:
  push:
    branches: [main]
    paths:
      - "docs/**"
      - "*.md"

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # Required for git notes

      - uses: lukeocodes/vectornator@v1
        with:
          api-key: ${{ secrets.OPENAI_API_KEY }}
          store-id: ${{ secrets.VECTOR_STORE_ID }}
          directory: docs
          patterns: "**/*.md,**/*.mdx"
```

### As an npm Package

```bash
# Install globally
npm install -g @lukeocodes/vectornator

# Or use with npx
npx @lukeocodes/vectornator sync --directory ./docs
```

## Installation

### npm Package

```bash
npm install -g @lukeocodes/vectornator
```

### GitHub Action

Add to your workflow:

```yaml
- uses: lukeocodes/vectornator@v1
```

## Configuration

### Environment Variables

```bash
# OpenAI Provider
OPENAI_API_KEY=your-api-key
OPENAI_STORE_ID=your-store-id

# Other providers (coming soon)
PINECONE_API_KEY=your-api-key
PINECONE_ENVIRONMENT=your-environment
```

### CLI Options

```bash
vectornator sync [options]

Options:
  -d, --directory <path>      Directory to sync (default: ".")
  -p, --provider <name>       Vector store provider (default: "openai")
  --patterns <patterns...>    File patterns to include
  --exclude <patterns...>     File patterns to exclude
  --dry-run                   Show what would be done without making changes
  --no-git-notes             Use file-based metadata instead of git notes
  --store-id <id>            Vector store ID
  --api-key <key>            API key for the provider
  -v, --verbose              Verbose output
  -h, --help                 Display help
```

### GitHub Action Inputs

| Input       | Description                                    | Required | Default                           |
| ----------- | ---------------------------------------------- | -------- | --------------------------------- |
| `api-key`   | API key for the vector store provider          | Yes      | -                                 |
| `store-id`  | Vector store ID                                | No       | -                                 |
| `directory` | Directory to sync                              | No       | `.`                               |
| `provider`  | Vector store provider                          | No       | `openai`                          |
| `patterns`  | File patterns to include (comma-separated)     | No       | `**/*.md,**/*.mdx,**/*.txt`       |
| `exclude`   | File patterns to exclude (comma-separated)     | No       | `node_modules/**,.git/**,dist/**` |
| `dry-run`   | Show what would be done without making changes | No       | `false`                           |
| `verbose`   | Enable verbose output                          | No       | `false`                           |

## Usage Examples

### Basic Sync

```bash
# Sync current directory
vectornator sync

# Sync specific directory
vectornator sync --directory ./docs

# Dry run to see what would happen
vectornator sync --dry-run
```

### Create a New Vector Store

```bash
vectornator create-store "my-documentation"
# Output: Store ID: vs_abc123...
```

### List Files in Vector Store

```bash
vectornator list
```

### Custom Patterns

```bash
# Only sync markdown files
vectornator sync --patterns "**/*.md"

# Exclude test files
vectornator sync --exclude "**/test/**" "**/*.test.md"
```

### Using Git Notes for Metadata

By default, Vectornator stores sync metadata in git notes. This keeps your repository clean:

```bash
# View metadata for current commit
vectornator show-metadata

# View metadata for specific commit
vectornator show-metadata --commit abc123

# Use file-based metadata instead
vectornator sync --no-git-notes
```

## Metadata Storage

Vectornator uses **git notes** by default to store sync metadata. This means:

- ✅ No `.vectornator` directory in your repo
- ✅ Metadata travels with your git history
- ✅ Each commit can have its own sync state
- ✅ Works seamlessly in CI/CD environments

The metadata is stored in `refs/notes/vectornator` and includes:

- File hashes for change detection
- Vector store file IDs
- Upload timestamps
- Version numbers

## Supported Providers

### OpenAI (Available Now)

```typescript
const provider = new OpenAIProvider();
await provider.initialize({
  apiKey: process.env.OPENAI_API_KEY,
  storeId: process.env.OPENAI_STORE_ID,
});
```

### Coming Soon

- **Pinecone**: High-performance vector database
- **Weaviate**: Open-source vector search engine
- **Qdrant**: Vector similarity search engine
- **ChromaDB**: Open-source embedding database

## Creating Custom Providers

Implement the `VectorStoreProvider` interface:

```typescript
import { BaseVectorStoreProvider } from "@lukeocodes/vectornator";

export class MyCustomProvider extends BaseVectorStoreProvider {
  name = "custom";

  async validateConfig(): Promise<void> {
    // Validate your configuration
  }

  async connect(): Promise<void> {
    // Connect to your service
  }

  async uploadFile(
    filePath: string,
    content: Buffer,
    metadata: FileMetadata
  ): Promise<string> {
    // Upload file and return ID
  }

  // ... implement other required methods
}
```

## Development

```bash
# Clone the repository
git clone https://github.com/lukeocodes/vectornator.git
cd vectornator

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Development mode
npm run dev
```

## Architecture

```
vectornator/
├── src/
│   ├── types/          # TypeScript interfaces
│   ├── providers/      # Vector store providers
│   ├── core/           # Core sync engine
│   └── cli.ts          # CLI interface
├── action.yml          # GitHub Action definition
└── package.json        # npm package definition
```

## How It Works

1. **File Discovery**: Scans your repository for files matching patterns
2. **Change Detection**: Computes SHA-256 hashes to detect changes
3. **Metadata Enrichment**: Adds file metadata (size, path, timestamps)
4. **Smart Sync**: Only uploads changed files, removes deleted files
5. **State Tracking**: Stores sync state in git notes or local file

## Best Practices

1. **Use Specific Patterns**: Target only the files you need in vector store
2. **Exclude Large Files**: Vector stores work best with text content
3. **Regular Syncs**: Set up CI/CD to sync on every push
4. **Monitor Usage**: Track your API usage and costs
5. **Version Control**: The git notes metadata travels with your code

## Troubleshooting

### "Vector store does not exist"

Create a new store:

```bash
vectornator create-store "my-docs"
```

### "No metadata found"

For existing projects, run an initial sync:

```bash
vectornator sync --force
```

### Git Notes Not Working

Ensure your repository is configured:

```bash
git config --add notes.displayRef refs/notes/vectornator
git config --add remote.origin.fetch "+refs/notes/*:refs/notes/*"
```

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

## License

MIT © Luke Oliff

## Acknowledgments

- Inspired by the need to keep AI applications in sync with documentation
- Git notes idea from [@lukeocodes](https://github.com/lukeocodes)
- Built with TypeScript and ❤️
