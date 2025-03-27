import OpenAI from 'openai';
import dotenv from 'dotenv';
import pino from 'pino';

// Load environment variables
dotenv.config();

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

// Supported LLM providers
export enum LLMProvider {
  OPENAI = 'openai',
  OPENROUTER = 'openrouter',
}

/**
 * Factory class to create and configure LLM clients
 */
export class LLMClient {
  private static instance: OpenAI;
  private static provider: LLMProvider;
  private static model: string;

  /**
   * Get the LLM client instance
   * @returns The OpenAI compatible client
   */
  public static getInstance(): OpenAI {
    if (!LLMClient.instance) {
      LLMClient.initialize();
    }
    return LLMClient.instance;
  }

  /**
   * Get the configured LLM model
   * @returns The model name
   */
  public static getModel(): string {
    if (!LLMClient.model) {
      LLMClient.initialize();
    }
    return LLMClient.model;
  }

  /**
   * Get the configured LLM provider
   * @returns The provider enum
   */
  public static getProvider(): LLMProvider {
    if (!LLMClient.provider) {
      LLMClient.initialize();
    }
    return LLMClient.provider;
  }

  /**
   * Initialize the LLM client
   */
  private static initialize(): void {
    // Determine the provider
    const providerStr = process.env.LLM_PROVIDER?.toLowerCase() || LLMProvider.OPENAI;
    LLMClient.provider = Object.values(LLMProvider).includes(providerStr as LLMProvider)
      ? providerStr as LLMProvider
      : LLMProvider.OPENAI;

    // Set the model based on provider
    if (LLMClient.provider === LLMProvider.OPENAI) {
      LLMClient.model = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';
    } else if (LLMClient.provider === LLMProvider.OPENROUTER) {
      LLMClient.model = process.env.OPENROUTER_MODEL || 'openai/gpt-3.5-turbo';
    }

    // Configure the client based on provider
    if (LLMClient.provider === LLMProvider.OPENAI) {
      LLMClient.instance = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
      logger.info(`Initialized OpenAI client with model: ${LLMClient.model}`);
    } else if (LLMClient.provider === LLMProvider.OPENROUTER) {
      LLMClient.instance = new OpenAI({
        apiKey: process.env.OPENROUTER_API_KEY,
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {
          'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://lovebot.com',
          'X-Title': 'LoveBot',
        },
      });
      logger.info(`Initialized OpenRouter client with model: ${LLMClient.model}`);
    }
  }

  /**
   * Reset the client instance (mainly for testing)
   */
  public static reset(): void {
    LLMClient.instance = undefined;
    LLMClient.provider = undefined;
    LLMClient.model = undefined;
  }

  /**
   * Get information about available models for the current provider
   * @returns Object with available models and their descriptions
   */
  public static getAvailableModels(): { [key: string]: string } {
    if (LLMClient.provider === LLMProvider.OPENAI) {
      return {
        'gpt-3.5-turbo': 'OpenAI GPT-3.5 Turbo - Fast and cost-effective',
        'gpt-4o': 'OpenAI GPT-4o - Latest model with enhanced capabilities',
        'gpt-4o-mini': 'OpenAI GPT-4o Mini - Smaller, faster version of GPT-4o',
        'gpt-4-turbo': 'OpenAI GPT-4 Turbo - Previous generation premium model',
      };
    } else if (LLMClient.provider === LLMProvider.OPENROUTER) {
      return {
        'openai/gpt-3.5-turbo': 'OpenAI GPT-3.5 Turbo - Fast and cost-effective',
        'openai/gpt-4o': 'OpenAI GPT-4o - Latest model with enhanced capabilities',
        'openai/gpt-4-turbo': 'OpenAI GPT-4 Turbo - Premium model with strong reasoning',
        'anthropic/claude-3-opus': 'Anthropic Claude 3 Opus - Most capable Claude model',
        'anthropic/claude-3-sonnet': 'Anthropic Claude 3 Sonnet - Balanced Claude model',
        'anthropic/claude-3-haiku': 'Anthropic Claude 3 Haiku - Fast, efficient Claude model',
        'meta-llama/llama-3-70b-instruct': 'Meta Llama 3 70B - Open weights model with strong capabilities',
        'meta-llama/llama-3-8b-instruct': 'Meta Llama 3 8B - Smaller, efficient Llama model',
        'mistral/mistral-large': 'Mistral Large - High performance open weights model',
        'mistral/mistral-medium': 'Mistral Medium - Mid-tier open weights model',
        'mistral/mistral-small': 'Mistral Small - Efficient open weights model',
      };
    }
    
    return {};
  }
} 