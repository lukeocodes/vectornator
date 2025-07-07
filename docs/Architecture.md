# Vectornator Architecture

## Overview

Vectornator is designed as a modular, extensible system for synchronizing repository content with vector stores. The architecture supports multiple vector store providers and uses git notes for metadata storage.

## Core Components

### 1. Provider System

The provider system is built around a common interface that all vector store implementations must follow:

```typescript
interface VectorStoreProvider {
  initialize(config: VectorStoreConfig): Promise<void>;
  verifyStore(): Promise<boolean>;
  createStore(name: string): Promise<string>;
  listFiles(): Promise<VectorStoreFile[]>;
  uploadFile(...): Promise<string>;
  updateFile(...): Promise<void>;
  deleteFile(fileId: string): Promise<void>;
  // ... more methods
}
```

#### Built-in Providers

- **OpenAI Provider**: Full implementation for OpenAI's vector store API
- **Example Provider**: Reference implementation for custom providers

#### Provider Registry

The provider registry manages available providers and handles instantiation:

```typescript
providerRegistry.register("custom", (config) => new CustomProvider());
const provider = await providerRegistry.get("custom", config);
```

### 2. Sync Engine

The sync engine orchestrates the synchronization process:

1. **File Discovery**: Scans directories for matching files
2. **Change Detection**: Compares file hashes to detect changes
3. **Smart Sync**: Only syncs changed files
4. **Metadata Management**: Tracks sync state

### 3. Metadata Storage

#### Git Notes (Default)

Metadata is stored in `refs/notes/vectornator`:

```json
{
  "version": "1.0.0",
  "lastSync": "2024-01-01T00:00:00Z",
  "storeId": "vs_abc123",
  "files": {
    "docs/readme.md": {
      "fileId": "file_xyz",
      "hash": "sha256...",
      "version": 1
    }
  }
}
```

Benefits:

- No repository clutter
- Metadata travels with git history
- Per-commit sync state
- Works in CI/CD

#### File-based (Fallback)

When git notes aren't available, metadata is stored in `.vectornator/metadata.json`.

### 4. File Scanner

The file scanner discovers and processes files:

- **Pattern Matching**: Uses glob patterns for file selection
- **Hash Calculation**: SHA-256 for change detection
- **Metadata Extraction**: File size, timestamps, MIME types

### 5. CLI Interface

The CLI provides user-friendly commands:

- `sync`: Main synchronization command
- `list`: List files in vector store
- `create-store`: Create new vector store
- `show-metadata`: View sync metadata

## Data Flow

```
1. User runs: vectornator sync
2. File Scanner discovers files
3. Metadata Manager loads previous state
4. Sync Engine compares local vs remote
5. Provider uploads/updates/deletes files
6. Metadata Manager saves new state
7. Git Notes pushed to remote
```

## Extension Points

### Custom Providers

1. Extend `BaseVectorStoreProvider`
2. Implement required methods
3. Register with provider registry

### Custom Metadata

Providers can enrich metadata:

```typescript
async enrichMetadata(filePath, content, baseMetadata) {
  return {
    ...baseMetadata,
    customField: 'value',
    embeddings: await this.generateEmbeddings(content)
  };
}
```

## Security Considerations

- API keys stored in environment variables
- No sensitive data in git notes
- Secure HTTPS connections
- Rate limiting and retries

## Performance Optimizations

- Parallel file processing where possible
- Chunked uploads for large files
- Hash-based change detection
- Incremental syncs

## Future Enhancements

1. **Streaming Uploads**: For very large files
2. **Compression**: Reduce bandwidth usage
3. **Caching**: Local cache for faster syncs
4. **Webhooks**: Real-time sync triggers
5. **Multi-store Support**: Sync to multiple stores
