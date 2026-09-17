/**
 * Central place for environment-driven configuration.
 * Every process.env read that can fail should go through here so the
 * process fails fast with a clear message instead of a confusing 401 later.
 */

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
