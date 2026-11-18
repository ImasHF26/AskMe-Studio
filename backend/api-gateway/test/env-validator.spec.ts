import { validateEnvironment } from '../src/config/env.validator';

describe('Environment Validator (env.validator)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should pass in development mode even if JWT_SECRET is change-me (with console warning)', () => {
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = 'change-me';

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => validateEnvironment()).not.toThrow();
    expect(warnSpy).toHaveBeenCalled();
    const hasWarningMessage = warnSpy.mock.calls.some((args) =>
      args.some((arg) => typeof arg === 'string' && arg.includes('JWT_SECRET is either missing or set to the default insecure value'))
    );
    expect(hasWarningMessage).toBe(true);
    warnSpy.mockRestore();
  });

  it('should throw fatal error in production mode if JWT_SECRET is change-me', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'change-me';

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => validateEnvironment()).toThrow(
      /Environment validation failed with 1 fatal security error/
    );
    expect(errorSpy).toHaveBeenCalled();
    const hasFatalMessage = errorSpy.mock.calls.some((args) =>
      args.some((arg) => typeof arg === 'string' && arg.includes('[FATAL SECURITY]'))
    );
    expect(hasFatalMessage).toBe(true);
    errorSpy.mockRestore();
  });

  it('should throw fatal error in production mode if JWT_SECRET is missing', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => validateEnvironment()).toThrow(
      /Environment validation failed/
    );
    errorSpy.mockRestore();
  });

  it('should pass in production mode when a strong secret is provided', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'super_secret_production_key_askme_987654321';
    process.env.DATASOURCE_SECRET = 'datasource_encryption_key_robust_12345';

    expect(() => validateEnvironment()).not.toThrow();
  });
});
