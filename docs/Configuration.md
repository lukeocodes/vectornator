# Vectornator Configuration

## Metadata Branch Configuration

By default, Vectornator stores metadata in the `metadata/vectornator` branch. You can customize this in several ways:

### 1. Environment Variable

Set the `VECTORNATOR_METADATA_BRANCH` environment variable:

```bash
export VECTORNATOR_METADATA_BRANCH="my-custom-branch"
vectornator sync
```

Or in your GitHub Actions workflow:

```yaml
- uses: lukeocodes/vectornator@v1
  env:
    VECTORNATOR_METADATA_BRANCH: "metadata/my-project"
  with:
    api-key: ${{ secrets.OPENAI_API_KEY }}
```

### 2. In Code

If you're using Vectornator as a library:

```typescript
import { DEFAULT_METADATA_BRANCH } from "@lukeocodes/vectornator";

// The default branch name is available as a constant
console.log(DEFAULT_METADATA_BRANCH); // "metadata/vectornator"
```

### 3. Multiple Projects

If you have multiple projects using Vectornator in the same repository, you can use different branches:

```bash
# Project A
VECTORNATOR_METADATA_BRANCH=metadata/project-a vectornator sync --directory project-a

# Project B
VECTORNATOR_METADATA_BRANCH=metadata/project-b vectornator sync --directory project-b
```

## Other Configuration Options

### Storage Type

Control where metadata is stored:

- `git-branch` (default): Store in a git branch
- `file`: Store in a local file

```bash
vectornator sync --metadata-storage file
```

### Provider Configuration

API keys and store IDs can be configured via environment variables:

```bash
# OpenAI
export OPENAI_API_KEY=your-key
export OPENAI_STORE_ID=your-store-id

# Other providers follow the pattern:
# {PROVIDER_NAME}_API_KEY
# {PROVIDER_NAME}_STORE_ID
```

### File Patterns

Default patterns:

- Include: `**/*.md`, `**/*.mdx`, `**/*.txt`
- Exclude: `node_modules/**`, `.git/**`, `dist/**`

Override with CLI options:

```bash
vectornator sync --patterns "**/*.md" "**/*.json" --exclude "**/test/**"
```

## Constants Reference

All configurable constants are exported from the package:

```typescript
import {
  DEFAULT_METADATA_BRANCH, // "metadata/vectornator"
  DEFAULT_METADATA_FILE, // "metadata.json"
  DEFAULT_METADATA_PATH, // ".vectornator/metadata.json"
  DEFAULT_STORAGE_TYPE, // "git-branch"
  DEFAULT_PROVIDER, // "openai"
  DEFAULT_PATTERNS, // ["**/*.md", "**/*.mdx", "**/*.txt"]
  DEFAULT_EXCLUDE, // ["node_modules/**", ".git/**", "dist/**"]
} from "@lukeocodes/vectornator";
```
