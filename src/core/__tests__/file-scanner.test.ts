import { FileScanner } from '../file-scanner';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('FileScanner', () => {
    let tempDir: string;
    let scanner: FileScanner;

    beforeEach(async () => {
        // Create a temporary directory for testing
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vectornator-test-'));
        scanner = new FileScanner();
    });

    afterEach(async () => {
        // Clean up temporary directory
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('should discover markdown files', async () => {
        // Create test files
        await fs.writeFile(path.join(tempDir, 'test1.md'), '# Test 1');
        await fs.writeFile(path.join(tempDir, 'test2.mdx'), '# Test 2');
        await fs.writeFile(path.join(tempDir, 'test3.txt'), 'Test 3');
        await fs.writeFile(path.join(tempDir, 'ignore.js'), 'console.log()');

        // Scan directory
        const files = await scanner.scan({ directory: tempDir });

        // Should find 3 files (2 markdown + 1 text)
        expect(files).toHaveLength(3);
        expect(files.map(f => f.path).sort()).toEqual([
            'test1.md',
            'test2.mdx',
            'test3.txt'
        ]);
    });

    it('should calculate file hashes', async () => {
        const content = '# Test Content';
        const filePath = path.join(tempDir, 'test.md');
        await fs.writeFile(filePath, content);

        const files = await scanner.scan({ directory: tempDir });

        expect(files).toHaveLength(1);
        expect(files[0].metadata.hash).toBeDefined();
        expect(files[0].metadata.hash).toHaveLength(64); // SHA-256 hash length
    });

    it('should respect exclude patterns', async () => {
        // Create test files
        await fs.mkdir(path.join(tempDir, 'node_modules'), { recursive: true });
        await fs.writeFile(path.join(tempDir, 'readme.md'), '# Readme');
        await fs.writeFile(path.join(tempDir, 'node_modules', 'test.md'), '# Test');

        // Scan with default excludes (includes node_modules)
        const files = await scanner.scan({ directory: tempDir });

        // Should only find the readme, not the file in node_modules
        expect(files).toHaveLength(1);
        expect(files[0].path).toBe('readme.md');
    });

    it('should use custom patterns', async () => {
        // Create test files
        await fs.writeFile(path.join(tempDir, 'test.md'), '# Test');
        await fs.writeFile(path.join(tempDir, 'test.json'), '{}');
        await fs.writeFile(path.join(tempDir, 'test.yml'), 'key: value');

        // Scan with custom patterns
        const files = await scanner.scan({
            directory: tempDir,
            patterns: ['**/*.json', '**/*.yml']
        });

        // Should only find JSON and YAML files
        expect(files).toHaveLength(2);
        expect(files.map(f => f.path).sort()).toEqual(['test.json', 'test.yml']);
    });

    it('should extract correct metadata', async () => {
        const content = '# Test File\n\nThis is a test.';
        const filePath = path.join(tempDir, 'test.md');
        await fs.writeFile(filePath, content);

        const files = await scanner.scan({ directory: tempDir });
        const file = files[0];

        expect(file.metadata).toMatchObject({
            path: 'test.md',
            size: Buffer.byteLength(content),
            mimeType: 'text/markdown',
            encoding: 'utf-8'
        });
        expect(file.metadata.hash).toBeDefined();
        expect(file.metadata.lastModified).toBeDefined();
    });
}); 