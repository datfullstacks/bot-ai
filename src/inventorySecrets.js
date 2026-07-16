import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes
} from 'node:crypto';
import { config } from './config.js';

const ENCRYPTED_PREFIX = 'enc:v1:';

function decodeEncryptionKey() {
  const raw = String(config.inventory.encryptionKey || '').trim();
  if (!raw) return null;

  if (/^[a-f0-9]{64}$/i.test(raw)) {
    return Buffer.from(raw, 'hex');
  }

  try {
    const decoded = Buffer.from(raw, 'base64');
    if (decoded.length === 32) return decoded;
  } catch {
    // Fall through to the actionable error below.
  }

  throw Object.assign(
    new Error('INVENTORY_ENCRYPTION_KEY must be 32 bytes encoded as 64 hex characters or base64'),
    { statusCode: 500 }
  );
}

export function inventoryEncryptionStatus() {
  try {
    return {
      configured: Boolean(String(config.inventory.encryptionKey || '').trim()),
      valid: Boolean(decodeEncryptionKey()),
      error: ''
    };
  } catch (error) {
    return {
      configured: true,
      valid: false,
      error: error.message
    };
  }
}

export function assertInventoryEncryptionReadyForImport() {
  const key = decodeEncryptionKey();
  if (process.env.NODE_ENV === 'production' && !key) {
    throw Object.assign(
      new Error('INVENTORY_ENCRYPTION_KEY is required before importing production inventory'),
      { statusCode: 503 }
    );
  }
  return key;
}

export function isEncryptedInventorySecret(value) {
  return String(value || '').startsWith(ENCRYPTED_PREFIX);
}

export function encryptInventorySecret(value) {
  const secret = String(value || '');
  const key = decodeEncryptionKey();
  if (!key) return secret;

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    ENCRYPTED_PREFIX.slice(0, -1),
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url')
  ].join(':');
}

export function decryptInventorySecret(value) {
  const stored = String(value || '');
  if (!isEncryptedInventorySecret(stored)) return stored;

  const key = decodeEncryptionKey();
  if (!key) {
    throw Object.assign(
      new Error('INVENTORY_ENCRYPTION_KEY is required to decrypt inventory'),
      { statusCode: 500 }
    );
  }

  const [, version, ivText, tagText, encryptedText] = stored.split(':');
  if (version !== 'v1' || !ivText || !tagText || !encryptedText) {
    throw Object.assign(new Error('Encrypted inventory payload is invalid'), { statusCode: 500 });
  }

  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivText, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedText, 'base64url')),
      decipher.final()
    ]).toString('utf8');
  } catch {
    throw Object.assign(
      new Error('Unable to decrypt inventory. Check INVENTORY_ENCRYPTION_KEY.'),
      { statusCode: 500 }
    );
  }
}

export function assertInventorySecretsReadyForSale(items = []) {
  for (const item of items) {
    const secret = typeof item === 'object' && item !== null ? item.secret : item;
    if (process.env.NODE_ENV === 'production' && !isEncryptedInventorySecret(secret)) {
      throw Object.assign(
        new Error('Available inventory contains legacy plaintext data; re-import it with encryption before selling'),
        { statusCode: 503 }
      );
    }
    if (isEncryptedInventorySecret(secret)) {
      decryptInventorySecret(secret);
    }
  }
}

export function inventorySecretFingerprint(value) {
  const secret = String(value || '');
  const key = decodeEncryptionKey();
  return key
    ? createHmac('sha256', key).update(secret).digest('hex')
    : createHash('sha256').update(secret).digest('hex');
}

export function inventorySecretPreview(item = {}) {
  if (isEncryptedInventorySecret(item.secret)) {
    const fingerprint = String(item.secretFingerprint || '').slice(0, 8);
    return fingerprint ? `encrypted:${fingerprint}` : 'encrypted';
  }
  const secret = String(item.secret || '');
  return secret ? `${secret.slice(0, 6)}...` : '';
}
