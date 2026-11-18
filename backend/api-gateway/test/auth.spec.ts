import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../src/auth/auth.service';
import { DatabaseService } from '../src/common/database/database.service';

describe('AuthService (Unit Tests)', () => {
  let authService: AuthService;
  let mockDatabase: DatabaseService;

  beforeEach(() => {
    mockDatabase = {
      pool: undefined,
      dbReady: false,
      semanticVectorReady: false,
      getHealth: () => ({ status: 'ok', service: 'database', persistence: 'memory' }),
      onModuleInit: async () => {}
    } as unknown as DatabaseService;

    authService = new AuthService(mockDatabase);
  });

  describe('register', () => {
    it('should register a new user in memory with hashed password and analyst role', async () => {
      const response = await authService.register('alice@example.com', 'Secret123!', 'Alice Smith');

      expect(response).toBeDefined();
      expect(response.accessToken).toBeDefined();
      expect(response.user).toEqual({
        id: expect.stringMatching(/^usr_/),
        email: 'alice@example.com',
        fullName: 'Alice Smith',
        role: 'Analyst'
      });
      expect(authService.inMemoryUsers).toHaveLength(1);
      expect(authService.inMemoryUsers[0].passwordHash).not.toBe('Secret123!');
    });

    it('should reject registration if email already exists', async () => {
      await authService.register('duplicate@example.com', 'Pass1', 'First User');

      await expect(
        authService.register('DUPLICATE@example.com', 'Pass2', 'Second User')
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('login', () => {
    beforeEach(async () => {
      await authService.register('bob@example.com', 'Password123!', 'Bob Jones');
    });

    it('should login successfully with correct credentials', async () => {
      const result = await authService.login('bob@example.com', 'Password123!');

      expect(result.accessToken).toBeDefined();
      expect(result.user.email).toBe('bob@example.com');
      expect(result.user.fullName).toBe('Bob Jones');
    });

    it('should reject login with wrong password', async () => {
      await expect(
        authService.login('bob@example.com', 'WrongPassword!')
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject login for unknown email', async () => {
      await expect(
        authService.login('unknown@example.com', 'Password123!')
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('token validation & user retrieval', () => {
    let validToken: string;

    beforeEach(async () => {
      const registered = await authService.register('charlie@example.com', 'Pass123!', 'Charlie Brown');
      validToken = registered.accessToken;
    });

    it('should get current user with a valid JWT token', async () => {
      const user = await authService.getCurrentUser(validToken);

      expect(user).toBeDefined();
      expect(user.email).toBe('charlie@example.com');
      expect(user.fullName).toBe('Charlie Brown');
      expect(user.role).toBe('Analyst');
    });

    it('should validate token synchronously via requireAuthUser', () => {
      const user = authService.requireAuthUser(validToken);

      expect(user).toBeDefined();
      expect(user.email).toBe('charlie@example.com');
      expect(user.role).toBe('Analyst');
    });

    it('should throw UnauthorizedException when requireAuthUser receives no token', () => {
      expect(() => authService.requireAuthUser(undefined)).toThrow(UnauthorizedException);
      expect(() => authService.requireAuthUser('')).toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for an invalid or tampered JWT token', () => {
      expect(() => authService.requireAuthUser('invalid.jwt.token')).toThrow(UnauthorizedException);
      expect(() => authService.verifyToken('tampered-token')).toThrow(UnauthorizedException);
    });
  });

  describe('refresh token', () => {
    it('should provide refreshToken on register and login', async () => {
      const regRes = await authService.register('dave@example.com', 'PassDave123!', 'Dave Dave');
      expect(regRes.refreshToken).toBeDefined();

      const logRes = await authService.login('dave@example.com', 'PassDave123!');
      expect(logRes.refreshToken).toBeDefined();
    });

    it('should refresh tokens successfully using a valid refreshToken', async () => {
      const regRes = await authService.register('eva@example.com', 'PassEva123!', 'Eva Green');
      const refreshed = await authService.refresh(regRes.refreshToken);

      expect(refreshed.accessToken).toBeDefined();
      expect(refreshed.refreshToken).toBeDefined();
      expect(refreshed.user.email).toBe('eva@example.com');
      expect(refreshed.user.fullName).toBe('Eva Green');
    });

    it('should reject refresh with missing, invalid or tampered token', async () => {
      await expect(authService.refresh('')).rejects.toThrow(UnauthorizedException);
      await expect(authService.refresh('invalid-refresh-token')).rejects.toThrow(UnauthorizedException);
    });

    it('should reject refresh if token type is not refresh', async () => {
      const regRes = await authService.register('frank@example.com', 'PassFrank123!', 'Frank Cast');
      // Pass the accessToken instead of the refreshToken
      await expect(authService.refresh(regRes.accessToken)).rejects.toThrow(UnauthorizedException);
    });
  });
});
