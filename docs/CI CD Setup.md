# CI/CD Setup

This document describes the continuous integration and continuous deployment (CI/CD) setup for the Vectornator project.

## Overview

The CI/CD pipeline is built using GitHub Actions and semantic-release to automate the entire release process. It ensures code quality, runs tests, and automatically publishes new versions based on conventional commits.

## Key Components

### 1. Conventional Commits

We use [Conventional Commits](https://www.conventionalcommits.org/) to standardize commit messages and enable automated versioning.

**Commit Format:**

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Supported Types:**

- `feat`: New feature (triggers minor release)
- `fix`: Bug fix (triggers patch release)
- `perf`: Performance improvement (triggers patch release)
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `build`: Build system changes
- `ci`: CI/CD changes
- `chore`: Other changes
- `revert`: Reverting previous commits

### 2. GitHub Actions Workflows

#### Main CI/CD Pipeline (`.github/workflows/ci-cd.yml`)

The main pipeline runs on every push and pull request:

1. **Lint Job**:

   - Runs ESLint with auto-fix
   - Commits any automatic fixes
   - Ensures code style consistency

2. **Test Job**:

   - Runs tests on Node.js versions 16, 18, and 20
   - Generates code coverage reports
   - Uploads coverage to Codecov

3. **Build Job**:

   - Builds the TypeScript project
   - Verifies build outputs
   - Uploads build artifacts

4. **Release Job** (main branch only):

   - Runs semantic-release
   - Generates changelog
   - Updates version in package.json
   - Creates git tags
   - Publishes to npm
   - Creates GitHub releases

5. **Publish Action Job**:
   - Updates the GitHub Action branch
   - Ensures the action is always up-to-date

#### Commit Linting (`.github/workflows/commitlint.yml`)

- Validates commit messages on pull requests
- Ensures all commits follow conventional commit format
- Checks PR titles for compliance

#### Code Quality Workflows

- **CodeQL Analysis**: Uses GitHub's default code scanning setup (configured in repository settings)
- **Dependency Review**: Reviews dependencies for vulnerabilities
- **Dependabot**: Automated dependency updates

### 3. Semantic Release Configuration

The `.releaserc.json` file configures semantic-release with:

- **Commit Analyzer**: Determines version bumps based on commit types
- **Release Notes Generator**: Creates formatted release notes
- **Changelog Plugin**: Updates CHANGELOG.md
- **NPM Plugin**: Publishes to npm registry
- **Git Plugin**: Commits version changes
- **GitHub Plugin**: Creates GitHub releases

### 4. Git Hooks (Husky)

Pre-commit hooks ensure code quality before commits:

- **pre-commit**: Runs ESLint
- **commit-msg**: Validates commit messages with commitlint

### 5. NPM Publishing

The package is published to npm as `@lukeocodes/vectornator` with:

- Public access
- Automatic version bumping
- CLI binary registration

## Setup Requirements

### Repository Secrets

The following secrets must be configured in GitHub:

1. **NPM_TOKEN**: npm authentication token for publishing
2. **CODECOV_TOKEN**: (Optional) Codecov token for coverage reports
3. **GITHUB_TOKEN**: Automatically provided by GitHub Actions

### Local Development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Husky will automatically set up git hooks during installation.

3. Make commits using conventional commit format:
   ```bash
   git commit -m "feat: add new vector store provider"
   ```

## Release Process

1. **Development**: Make changes in feature branches
2. **Commit**: Use conventional commits
3. **Pull Request**: Create PR to main branch
4. **Review**: Code review and automated checks
5. **Merge**: Merge to main branch
6. **Automatic Release**:
   - Version bump based on commits
   - Changelog generation
   - npm publication
   - GitHub release creation
   - Git tag creation

## Version Bumping Rules

- **Major** (x.0.0): Breaking changes (manually triggered with `BREAKING CHANGE:` in commit)
- **Minor** (0.x.0): New features (`feat:` commits)
- **Patch** (0.0.x): Bug fixes (`fix:`), performance improvements (`perf:`), and reverts (`revert:`)

## Troubleshooting

### Failed Releases

If a release fails:

1. Check GitHub Actions logs
2. Ensure NPM_TOKEN is valid
3. Verify no conflicting git tags exist
4. Run `npm run build` locally to check for build issues

### Skipping Releases

To skip CI/CD on a commit, add `[skip ci]` to the commit message:

```bash
git commit -m "chore: update docs [skip ci]"
```

## Best Practices

1. **Always use conventional commits** for clear version history
2. **Write descriptive commit messages** for better changelogs
3. **Keep PRs focused** on single features or fixes
4. **Run tests locally** before pushing
5. **Review generated changelogs** after releases

## Monitoring

- **GitHub Actions**: Monitor workflow runs in the Actions tab
- **npm**: Check package versions at https://www.npmjs.com/package/@lukeocodes/vectornator
- **Codecov**: View coverage reports (if configured)
- **Dependabot**: Review automated dependency PRs weekly
