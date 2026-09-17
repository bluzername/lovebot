/**
 * Central place for environment-driven configuration.
 * Every process.env read that can fail should go through here so the
 * process fails fast with a clear message instead of a confusing 401 later.
 */

export enum LLMProvider {
  OPENAI = 'openai',
  OPENROUTER = 'openrouter',
}

// Default model ids. Verified against the provider docs on 2026-09-17:
// - OpenAI: https://developers.openai.com/api/docs/models/gpt-4o-mini
// - OpenRouter: https://openrouter.ai/api/v1/models
// Override with OPENAI_MODEL / OPENROUTER_MODEL.
export const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
export const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-4o-mini';
export const DEFAULT_LLM_PROVIDER = LLMProvider.OPENAI;
export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
export const DEFAULT_OPENROUTER_SITE_URL = 'https://github.com/bluzername/lovebot';

export interface LLMSettings {
  provider: LLMProvider;
  model: string;
  /** Name of the env var that must hold the API key for this provider. */
  apiKeyEnvName: 'OPENAI_API_KEY' | 'OPENROUTER_API_KEY';
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing required environment variable ${name}. ` +
      `Copy .env.example to .env and set ${name}.`
    );
  }
  return value;
}

export function optionalEnv(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== '' ? value : fallback;
}

export function getLLMProvider(): LLMProvider {
  const raw = optionalEnv('LLM_PROVIDER', DEFAULT_LLM_PROVIDER).toLowerCase();
  return Object.values(LLMProvider).includes(raw as LLMProvider)
    ? (raw as LLMProvider)
    : DEFAULT_LLM_PROVIDER;
}

/**
 * Resolve provider and model from the environment without touching the
 * API key, so status/help output can describe the config safely.
 */
export function getLLMSettings(): LLMSettings {
  const provider = getLLMProvider();
  if (provider === LLMProvider.OPENROUTER) {
    return {
      provider,
      model: optionalEnv('OPENROUTER_MODEL', DEFAULT_OPENROUTER_MODEL),
      apiKeyEnvName: 'OPENROUTER_API_KEY',
    };
  }
  return {
    provider,
    model: optionalEnv('OPENAI_MODEL', DEFAULT_OPENAI_MODEL),
    apiKeyEnvName: 'OPENAI_API_KEY',
  };
}

export function isLLMKeyConfigured(): boolean {
  const value = process.env[getLLMSettings().apiKeyEnvName];
  return Boolean(value && value.trim() !== '');
}
