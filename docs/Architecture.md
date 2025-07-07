# Vectornator Architecture

## Overview

Vectornator is a tool for maintaining remote vector stores with repository content. It supports multiple vector store providers and uses git branches for metadata storage.

## Core Components

### 1. File Scanner

- Discovers files based on patterns
- Calculates SHA-256 hashes for change detection
- Extracts file metadata (size, modification time, etc.)
- Supports glob patterns for include/exclude

### 2. Sync Engine

- Orchestrates the synchronization process
- Compares local and remote states
- Handles additions, updates, and deletions
- Provides progress reporting

### 3. Vector Store Providers

- Abstract interface for different vector stores
- OpenAI implementation included
- Extensible for custom providers
- Handles authentication and API communication

### 4. Metadata Management

- Tracks sync state between local and remote
- Stores file hashes and vector store IDs
- Two storage strategies:
  - Git branch (default)
  - File-based

## Data Flow

```
1. File Discovery
   └─> Scanner finds matching files

2. Hash Calculation
   └─> SHA-256 for each file

3. State Comparison
   └─> Compare with stored metadata

4. Sync Operations
   ├─> Add new files
   ├─> Update changed files
   └─> Delete removed files

5. Metadata Update
   └─> Save new state
```

## Metadata Storage

### Git Branch (Default)

Metadata is stored in a dedicated `vectornator-metadata` branch:

```json
{
  "version": "1.0.0",
  "lastSync": "2024-01-15T10:30:00Z",
  "storeId": "vs_abc123",
  "files": {
    "docs/README.md": {
      "fileId": "file_xyz789",
      "hash": "sha256:abc...",
      "uploadedAt": "2024-01-15T10:30:00Z",
      "version": 1,
      "metadata": {
        "path": "docs/README.md",
        "size": 1234,
        "lastModified": "2024-01-15T10:00:00Z"
      }
    }
  }
}
```

### File-based Storage

When git integration isn't needed, metadata is stored in `.vectornator/metadata.json`.

## Provider Interface

```typescript
interface VectorStoreProvider {
  // Connection
  initialize(config: VectorStoreConfig): Promise<void>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;

  // Store operations
  verifyStore(): Promise<boolean>;
  createStore(name: string): Promise<string>;

  // File operations
  uploadFile(
    path: string,
    content: Buffer,
    metadata: FileMetadata
  ): Promise<string>;
  updateFile(
    fileId: string,
    content: Buffer,
    metadata: FileMetadata
  ): Promise<void>;
  deleteFile(fileId: string): Promise<void>;
  listFiles(): Promise<RemoteFile[]>;

  // Utilities
  enrichMetadata(
    path: string,
    content: Buffer,
    metadata: FileMetadata
  ): Promise<FileMetadata>;
  cleanup(): Promise<void>;
}
```

## GitHub Action Integration

1. Checkout with full history
2. Fetch metadata branch if exists
3. Install vectornator
4. Run sync
5. Push metadata branch to remote
6. Report results

## Security Considerations

- API keys via environment variables
- No credentials in metadata
- Metadata branch permissions same as code
- File content never stored locally

## Performance

- Parallel file processing where possible
- Incremental sync (only changed files)
- Progress reporting for large operations
- Efficient hash comparison

## Error Handling

- Graceful degradation
- Detailed error messages
- Retry logic for transient failures
- Rollback capability via git

## Future Enhancements

- Additional vector store providers
- Batch operations for large files
- Compression support
- Delta sync for large documents
