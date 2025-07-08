import { Command } from 'commander';

// Mock the provider registry
jest.mock('../providers/registry', () => {
    const mockProvider = {
        name: 'mock',
        initialize: jest.fn(),
        verifyStore: jest.fn().mockResolvedValue(true),
        createStore: jest.fn().mockResolvedValue('test-store-id'),
        listFiles: jest.fn().mockResolvedValue([]),
        uploadFile: jest.fn().mockResolvedValue('file-id'),
        deleteFile: jest.fn(),
        enrichMetadata: jest.fn().mockImplementation((_, __, metadata) => metadata),
        cleanup: jest.fn(),
        listStores: jest.fn().mockResolvedValue([])
    };

    const providerRegistry = {
        register: jest.fn(),
        get: jest.fn().mockResolvedValue(mockProvider),
        list: jest.fn().mockReturnValue(['openai', 'example'])
    };

    return {
        VectorStoreProviderRegistry: providerRegistry,
        providerRegistry
    };
});

// Mock the sync engine
jest.mock('../core/sync-engine', () => ({
    SyncEngine: jest.fn().mockImplementation(() => ({
        sync: jest.fn().mockResolvedValue({
            added: ['test.md'],
            updated: [],
            deleted: [],
            unchanged: [],
            failed: [],
            duration: 1000
        }),
        listStores: jest.fn().mockResolvedValue([
            { id: 'store1', name: 'Store 1', created_at: new Date() }
        ]),
        getStoreMetadata: jest.fn().mockResolvedValue({ fileCount: 1 })
    }))
}));

// Import the CLI setup function
import { createProgram } from '../cli';

describe('CLI Commands', () => {
    let program: Command;
    let originalExit: typeof process.exit;

    beforeEach(() => {
        // Mock process.exit to prevent tests from exiting
        originalExit = process.exit;
        process.exit = jest.fn() as any;

        // Create a fresh program instance for each test
        program = createProgram();
        // Suppress output during tests
        program.configureOutput({
            writeOut: jest.fn(),
            writeErr: jest.fn()
        });
    });

    afterEach(() => {
        // Restore process.exit
        process.exit = originalExit;
    });

    describe('sync command', () => {
        it('should have sync command with required options', () => {
            const syncCmd = program.commands.find(cmd => cmd.name() === 'sync');
            expect(syncCmd).toBeDefined();

            const options = syncCmd!.options;
            expect(options.some(opt => opt.short === '-p')).toBe(true);
            expect(options.some(opt => opt.long === '--provider')).toBe(true);
            expect(options.some(opt => opt.long === '--dry-run')).toBe(true);
            expect(options.some(opt => opt.long === '--verbose')).toBe(true);
        });

        it('should accept patterns option', () => {
            const syncCmd = program.commands.find(cmd => cmd.name() === 'sync');
            const patternsOpt = syncCmd!.options.find(opt => opt.long === '--patterns');
            expect(patternsOpt).toBeDefined();
        });

        it('should accept exclude option', () => {
            const syncCmd = program.commands.find(cmd => cmd.name() === 'sync');
            const excludeOpt = syncCmd!.options.find(opt => opt.long === '--exclude');
            expect(excludeOpt).toBeDefined();
        });
    });

    describe('list command', () => {
        it('should have list command with provider option', () => {
            const listCmd = program.commands.find(cmd => cmd.name() === 'list');
            expect(listCmd).toBeDefined();

            const providerOpt = listCmd!.options.find(opt => opt.long === '--provider');
            expect(providerOpt).toBeDefined();
        });
    });

    describe('create-store command', () => {
        it('should have create-store command with name argument', () => {
            const createCmd = program.commands.find(cmd => cmd.name() === 'create-store');
            expect(createCmd).toBeDefined();

            expect(createCmd!.registeredArguments).toHaveLength(1);
            expect(createCmd!.registeredArguments[0].required).toBe(true);
        });
    });

    describe('show-metadata command', () => {
        it('should have show-metadata command', () => {
            const metadataCmd = program.commands.find(cmd => cmd.name() === 'show-metadata');
            expect(metadataCmd).toBeDefined();
        });

        it('should have storage option', () => {
            const metadataCmd = program.commands.find(cmd => cmd.name() === 'show-metadata');
            const storageOpt = metadataCmd!.options.find(opt => opt.long === '--metadata-storage');
            expect(storageOpt).toBeDefined();
        });
    });

    describe('command validation', () => {
        it('should validate provider names', async () => {
            // Import the actual registry to modify it
            const { providerRegistry } = jest.requireMock('../providers/registry');

            // Mock the get method to throw an error
            const originalGet = providerRegistry.get;
            providerRegistry.get = jest.fn().mockRejectedValue(
                new Error('Unknown provider: invalid')
            );

            const syncCmd = program.commands.find(cmd => cmd.name() === 'sync');

            // The command will call process.exit(1) on error, which we've mocked
            await syncCmd!.parseAsync(['node', 'test', '-p', 'invalid'], { from: 'node' });

            // Check that process.exit was called with 1
            expect(process.exit).toHaveBeenCalledWith(1);

            // Restore original method
            providerRegistry.get = originalGet;
        });
    });
});

describe('CLI Integration', () => {
    it('should export createProgram function', () => {
        expect(createProgram).toBeDefined();
        expect(typeof createProgram).toBe('function');
    });

    it('should create a valid commander program', () => {
        const program = createProgram();
        expect(program).toBeInstanceOf(Command);
        expect(program.name()).toBe('vectornator');
    });

    it('should have correct version', () => {
        const program = createProgram();
        expect(program.version()).toMatch(/^\d+\.\d+\.\d+/);
    });
}); 