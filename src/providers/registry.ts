import { VectorStoreProvider, VectorStoreConfig, ProviderFactory, ProviderRegistry } from '../types';
import { OpenAIProvider } from './openai';
import { ExampleCustomProvider } from './example-custom';

/**
 * Registry of available vector store providers
 */
class VectorStoreProviderRegistry {
    private providers: ProviderRegistry = {};

    constructor() {
        // Register built-in providers
        this.register('openai', (_config) => new OpenAIProvider());
        this.register('example', (_config) => new ExampleCustomProvider());
    }

    /**
     * Register a new provider
     */
    register(name: string, factory: ProviderFactory): void {
        this.providers[name.toLowerCase()] = factory;
    }

    /**
     * Get a provider instance
     */
    async get(name: string, config: VectorStoreConfig): Promise<VectorStoreProvider> {
        const factory = this.providers[name.toLowerCase()];

        if (!factory) {
            throw new Error(
                `Unknown provider: ${name}. Available providers: ${Object.keys(this.providers).join(', ')}`
            );
        }

        const provider = factory(config);
        await provider.initialize(config);
        return provider;
    }

    /**
     * List available providers
     */
    list(): string[] {
        return Object.keys(this.providers);
    }

    /**
     * Check if a provider is registered
     */
    has(name: string): boolean {
        return name.toLowerCase() in this.providers;
    }
}

// Export singleton instance
export const providerRegistry = new VectorStoreProviderRegistry(); 