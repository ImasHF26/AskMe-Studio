import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

@Injectable()
export class DatasourceCryptoService {
  private readonly jwtSecret = process.env.JWT_SECRET || 'change-me';
  private readonly datasourceSecret = process.env.DATASOURCE_SECRET || this.jwtSecret;

  encryptJson(payload: Record<string, unknown>): string {
    const plaintext = JSON.stringify(payload);
    const key = createHash('sha256').update(this.datasourceSecret).digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return `${iv.toString('base64')}.${authTag.toString('base64')}.${encrypted.toString('base64')}`;
  }

  decryptJson(ciphertext: string): Record<string, unknown> {
    if (!ciphertext) return {};
    const [ivB64, tagB64, payloadB64] = ciphertext.split('.');
    if (!ivB64 || !tagB64 || !payloadB64) return {};

    const key = createHash('sha256').update(this.datasourceSecret).digest();
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(tagB64, 'base64');
    const encrypted = Buffer.from(payloadB64, 'base64');

    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    return JSON.parse(plaintext) as Record<string, unknown>;
  }
}
