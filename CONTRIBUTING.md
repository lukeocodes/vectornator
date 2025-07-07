# Contributing to Vectornator

Thank you for your interest in contributing to Vectornator! This guide will help you get started.

## Code of Conduct

Please note that this project is released with a [Contributor Code of Conduct](CODE_OF_CONDUCT.md). By participating in this project you agree to abide by its terms.

## How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported in [Issues](https://github.com/lukeocodes/vectornator/issues)
2. If not, create a new issue with:
   - Clear title and description
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (OS, Node version, etc.)

### Suggesting Features

1. Check existing [Issues](https://github.com/lukeocodes/vectornator/issues) for similar requests
2. Create a new issue with:
   - Clear description of the feature
   - Use cases and benefits
   - Potential implementation approach

### Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`npm test`)
5. Commit with conventional commits (`feat: add amazing feature`)
6. Push to your fork
7. Open a Pull Request

## Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/vectornator.git
cd vectornator

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Run in development mode
npm run dev
```

## Project Structure

```
vectornator/
├── src/
│   ├── types/          # TypeScript interfaces
│   ├── providers/      # Vector store providers
│   ├── core/           # Core functionality
│   └── cli.ts          # CLI entry point
├── docs/               # Documentation
├── tests/              # Test files
└── examples/           # Example usage
```

## Adding a New Provider

1. Create a new file in `src/providers/`
2. Extend `BaseVectorStoreProvider`
3. Implement all required methods
4. Register in `src/providers/registry.ts`
5. Add tests
6. Update documentation

Example:

```typescript
import { BaseVectorStoreProvider } from "./base";

export class MyProvider extends BaseVectorStoreProvider {
  name = "myprovider";

  protected async validateConfig(): Promise<void> {
    // Validate configuration
  }

  protected async connect(): Promise<void> {
    // Connect to service
  }

  // ... implement other methods
}
```

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch
```

### Writing Tests

- Place tests next to the code they test
- Name test files `*.test.ts`
- Use descriptive test names
- Test edge cases

Example:

```typescript
describe("FileScanner", () => {
  it("should discover markdown files", async () => {
    const scanner = new FileScanner();
    const files = await scanner.scan({ directory: "./test-data" });
    expect(files).toHaveLength(3);
  });
});
```

## Commit Guidelines

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation changes
- `style:` Code style changes
- `refactor:` Code refactoring
- `test:` Test changes
- `chore:` Build/tooling changes

Examples:

```
feat: add Pinecone provider
fix: handle rate limiting in OpenAI provider
docs: update installation instructions
```

## Code Style

- TypeScript for all source code
- ESLint for linting
- Prettier for formatting (if added)
- Clear variable and function names
- Comments for complex logic

## Documentation

- Update README.md for user-facing changes
- Update architecture docs for design changes
- Add JSDoc comments to public APIs
- Include examples for new features

## Release Process

1. Maintainers will review and merge PRs
2. Releases follow semantic versioning
3. Changelog is automatically generated
4. npm package and GitHub Action are published

## Getting Help

- Open an issue for bugs or features
- Join discussions in [Discussions](https://github.com/lukeocodes/vectornator/discussions)
- Tag @lukeocodes for urgent matters

## Recognition

Contributors will be recognized in:

- GitHub contributors page
- Release notes
- README acknowledgments (for significant contributions)

Thank you for contributing to Vectornator! 🚀
