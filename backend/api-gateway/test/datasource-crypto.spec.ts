import { DatasourceCryptoService } from '../src/common/crypto/datasource-crypto.service';

describe('DatasourceCryptoService (AES-256-GCM)', () => {
  let service: DatasourceCryptoService;

  beforeEach(() => {
    service = new DatasourceCryptoService();
  });

  it('should encrypt and decrypt a JSON payload reversibly', () => {
    const payload = {
      host: 'database.internal.corp',
      port: 5432,
      database: 'finance_dw',
      username: 'etl_user',
      password: 'super_secure_db_password_#2026'
    };

    const encrypted = service.encryptJson(payload);
    expect(typeof encrypted).toBe('string');
    expect(encrypted.split('.')).toHaveLength(3); // iv.authTag.ciphertext

    const decrypted = service.decryptJson(encrypted);
    expect(decrypted).toEqual(payload);
  });

  it('should generate different ciphertexts for the same payload due to random IV', () => {
    const payload = { token: 'secret-api-token' };
    const enc1 = service.encryptJson(payload);
    const enc2 = service.encryptJson(payload);

    expect(enc1).not.toEqual(enc2);
    expect(service.decryptJson(enc1)).toEqual(payload);
    expect(service.decryptJson(enc2)).toEqual(payload);
  });

  it('should return empty object on empty ciphertext', () => {
    expect(service.decryptJson('')).toEqual({});
  });

  it('should return empty object on malformed ciphertext', () => {
    expect(service.decryptJson('invalid.format')).toEqual({});
  });

  it('should fail decryption if authentication tag or ciphertext is tampered with', () => {
    const payload = { data: 'critical_financial_report' };
    const encrypted = service.encryptJson(payload);
    const [iv, tag, data] = encrypted.split('.');

    // Tamper with data buffer
    const tamperedData = Buffer.from(data, 'base64');
    tamperedData[0] ^= 0xff;
    const tamperedEncrypted = `${iv}.${tag}.${tamperedData.toString('base64')}`;

    expect(() => service.decryptJson(tamperedEncrypted)).toThrow();
  });
});
