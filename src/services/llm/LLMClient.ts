import OpenAI from 'openai';
import dotenv from 'dotenv';
import pino from 'pino';
import {
  LLMProvider,
  LLMSettings,
  getLLMSettings,
  requireEnv,
  optionalEnv,
  OPENROUTER_BASE_URL,
  DEFAULT_OPENROUTER_SITE_URL,
} from '../../config';

// Load environment variables
dotenv.config();

// Re-export so existing importers keep working
export { LLMProvider };

// Create logger
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      levelFirst: true,
      translateTime: 'SYS:standard',
    }
  }
});

interface LLMState extends LLMSettings {
  client: OpenAI;
}

/**
 * Factory class to create and configure LLM clients
 */
export class LLMClient {
  private static state: LLMState | undefined;

  /**
   * Get the LLM client instance
   * @returns The OpenAI compatible client
   */
  public static getInstance(): OpenAI {
    return LLMClient.getState().client;
  }

  /**
   * Get the configured LLM model
   * @returns The model name
   */
  public static getModel(): string {
    return LLMClient.getState().model;
  }

  /**
   * Get the configured LLM provider
   * @returns The provider enum
   */
  public static getProvider(): LLMProvider {
    return LLMClient.getState().provider;
  }

  private static getState(): LLMState {
    if (!LLMClient.state) {
      LLMClient.state = LLMClient.initialize();
    }
    return LLMClient.state;
  }

  /**
   * Initialize the LLM client. Throws if the provider's API key is missing.
   */
  private static initialize(): LLMState {
    const settings = getLLMSettings();
    const apiKey = requireEnv(settings.apiKeyEnvName);

    if (settings.provider === LLMProvider.OPENROUTER) {
      const client = new OpenAI({
        apiKey,
        baseURL: OPENROUTER_BASE_URL,
        defaultHeaders: {
          'HTTP-Referer': optionalEnv('OPENROUTER_SITE_URL', DEFAULT_OPENROUTER_SITE_URL),
          'X-Title': 'LoveBot',
        },
      });
      logger.info(`Initialized OpenRouter client with model: ${settings.model}`);
      return { ...settings, client };
    }

    const client = new OpenAI({ apiKey });
    logger.info(`Initialized OpenAI client with model: ${settings.model}`);
    return { ...settings, client };
  }

  /**
   * Reset the client instance (mainly for testing)
   */
  public static reset(): void {
    LLMClient.state = undefined;
  }

  /**
   * Get information about available models for the current provider.
   * Ids verified against provider docs on 2026-09-17; any id the provider
   * accepts can be set via OPENAI_MODEL / OPENROUTER_MODEL.
   * @returns Object with available models and their descriptions
   */
  public static getAvailableModels(): { [key: string]: string } {
    const provider = getLLMSettings().provider;
    if (provider === LLMProvider.OPENAI) {
      return {
        'gpt-4o-mini': 'OpenAI GPT-4o mini - fast, affordable small model (default)',
        'gpt-5.6-luna': 'OpenAI GPT-5.6 Luna - cost-optimized current generation model',
        'gpt-5.6-sol': 'OpenAI GPT-5.6 Sol - flagship model',
      };
    }
    if (provider === LLMProvider.OPENROUTER) {
      return {
        'openai/gpt-4o-mini': 'OpenAI GPT-4o mini - fast, affordable small model (default)',
        'openai/gpt-5.6-luna': 'OpenAI GPT-5.6 Luna - cost-optimized current generation model',
        'openai/gpt-4o': 'OpenAI GPT-4o',
        'anthropic/claude-haiku-4.5': 'Anthropic Claude Haiku 4.5 - fast, efficient',
        'anthropic/claude-sonnet-5': 'Anthropic Claude Sonnet 5 - balanced',
        'anthropic/claude-opus-5': 'Anthropic Claude Opus 5 - most capable',
        'meta-llama/llama-3.3-70b-instruct': 'Meta Llama 3.3 70B - open weights',
        'meta-llama/llama-3.1-8b-instruct': 'Meta Llama 3.1 8B - small open weights',
        'mistralai/mistral-large': 'Mistral Large',
        'mistralai/mistral-small-2603': 'Mistral Small',
      };
    }
    return {};
  }
}
