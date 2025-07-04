import crypto from 'crypto';
import { storage } from './storage';

interface EncryptionKey {
  id: string;
  keyData: string;
  algorithm: string;
  keySize: number;
  createdAt: Date;
  expiresAt?: Date;
  status: 'active' | 'rotated' | 'expired';
  purpose: 'token_encryption' | 'data_encryption' | 'backup_encryption';
}

interface EncryptedData {
  encryptedData: string;
  iv: string;
  authTag: string;
  keyId: string;
  algorithm: string;
  version: string;
}

interface KeyRotationConfig {
  autoRotate: boolean;
  rotationIntervalDays: number;
  maxKeyAge: number;
  gracePeriodDays: number;
}

export class EncryptionService {
  private readonly ALGORITHM = 'aes-256-gcm';
  private readonly KEY_SIZE = 32; // 256 bits
  private readonly IV_SIZE = 16; // 128 bits
  private readonly AUTH_TAG_SIZE = 16; // 128 bits
  private readonly VERSION = '1.0';

  private keyCache = new Map<string, EncryptionKey>();
  private currentKeyIds = new Map<string, string>();

  private readonly KEY_ROTATION_CONFIG: KeyRotationConfig = {
    autoRotate: true,
    rotationIntervalDays: 90, // Rotate keys every 90 days
    maxKeyAge: 365, // Maximum key age 1 year
    gracePeriodDays: 30 // Grace period for old keys
  };

  constructor() {
    this.initializeEncryptionService();
  }

  private async initializeEncryptionService(): Promise<void> {
    try {
      // Initialize master keys for different purposes
      await this.ensureMasterKey('token_encryption');
      await this.ensureMasterKey('data_encryption');
      await this.ensureMasterKey('backup_encryption');

      // Start key rotation scheduler
      this.startKeyRotationScheduler();

      console.log('[Encryption] Service initialized with AES-256-GCM encryption');
    } catch (error) {
      console.error('[Encryption] Failed to initialize encryption service:', error);
      throw new Error('Encryption service initialization failed');
    }
  }

  // Key Management
  async generateMasterKey(purpose: EncryptionKey['purpose']): Promise<EncryptionKey> {
    try {
      const keyData = crypto.randomBytes(this.KEY_SIZE);
      const keyId = uuidv4();

      const encryptionKey: EncryptionKey = {
        id: keyId,
        keyData: keyData.toString('base64'),
        algorithm: this.ALGORITHM,
        keySize: this.KEY_SIZE,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + this.KEY_ROTATION_CONFIG.maxKeyAge * 24 * 60 * 60 * 1000),
        status: 'active',
        purpose
      };

      // Store key securely (in production, use HSM or KMS)
      await storage.storeEncryptionKey(encryptionKey);
      this.keyCache.set(keyId, encryptionKey);
      this.currentKeyIds.set(purpose, keyId);

      console.log(`[Encryption] Generated new master key for ${purpose}: ${keyId}`);
      return encryptionKey;
    } catch (error) {
      console.error('[Encryption] Error generating master key:', error);
      throw new Error('Failed to generate master key');
    }
  }

  private async ensureMasterKey(purpose: EncryptionKey['purpose']): Promise<void> {
    try {
      const currentKey = await storage.getCurrentEncryptionKey(purpose);
      
      if (!currentKey || this.isKeyExpiringSoon(currentKey)) {
        await this.generateMasterKey(purpose);
      } else {
        this.keyCache.set(currentKey.id, currentKey);
        this.currentKeyIds.set(purpose, currentKey.id);
      }
    } catch (error) {
      console.error(`[Encryption] Error ensuring master key for ${purpose}:`, error);
      throw error;
    }
  }

  private isKeyExpiringSoon(key: EncryptionKey): boolean {
    if (!key.expiresAt) return false;
    
    const daysUntilExpiry = (key.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    return daysUntilExpiry <= this.KEY_ROTATION_CONFIG.gracePeriodDays;
  }

  // Token Encryption (for OAuth tokens, API keys, etc.)
  async encryptToken(token: string): Promise<string> {
    try {
      const encrypted = await this.encrypt(token, 'token_encryption');
      return JSON.stringify(encrypted);
    } catch (error) {
      console.error('[Encryption] Error encrypting token:', error);
      throw new Error('Token encryption failed');
    }
  }

  async decryptToken(encryptedToken: string): Promise<string> {
    try {
      const encryptedData = JSON.parse(encryptedToken) as EncryptedData;
      return await this.decrypt(encryptedData);
    } catch (error) {
      console.error('[Encryption] Error decrypting token:', error);
      throw new Error('Token decryption failed');
    }
  }

  // Data Encryption (for sensitive user data)
  async encryptData(data: string): Promise<string> {
    try {
      const encrypted = await this.encrypt(data, 'data_encryption');
      return JSON.stringify(encrypted);
    } catch (error) {
      console.error('[Encryption] Error encrypting data:', error);
      throw new Error('Data encryption failed');
    }
  }

  async decryptData(encryptedData: string): Promise<string> {
    try {
      const data = JSON.parse(encryptedData) as EncryptedData;
      return await this.decrypt(data);
    } catch (error) {
      console.error('[Encryption] Error decrypting data:', error);
      throw new Error('Data decryption failed');
    }
  }

  // Core Encryption/Decryption
  private async encrypt(plaintext: string, purpose: EncryptionKey['purpose']): Promise<EncryptedData> {
    try {
      const keyId = this.currentKeyIds.get(purpose);
      if (!keyId) throw new Error(`No active key found for purpose: ${purpose}`);

      const key = await this.getKey(keyId);
      const keyBuffer = Buffer.from(key.keyData, 'base64');
      
      // Generate random IV
      const iv = crypto.randomBytes(this.IV_SIZE);
      
      // Create cipher
      const cipher = crypto.createCipher(this.ALGORITHM, keyBuffer);
      cipher.setAAD(Buffer.from(keyId)); // Additional authenticated data
      
      // Encrypt
      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      // Get authentication tag
      const authTag = cipher.getAuthTag();

      return {
        encryptedData: encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
        keyId,
        algorithm: this.ALGORITHM,
        version: this.VERSION
      };
    } catch (error) {
      console.error('[Encryption] Encryption failed:', error);
      throw error;
    }
  }

  private async decrypt(encryptedData: EncryptedData): Promise<string> {
    try {
      const key = await this.getKey(encryptedData.keyId);
      const keyBuffer = Buffer.from(key.keyData, 'base64');
      
      // Create decipher
      const decipher = crypto.createDecipher(encryptedData.algorithm, keyBuffer);
      decipher.setAAD(Buffer.from(encryptedData.keyId));
      decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
      
      // Decrypt
      let decrypted = decipher.update(encryptedData.encryptedData, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('[Encryption] Decryption failed:', error);
      throw new Error('Decryption failed - data may be corrupted or key invalid');
    }
  }

  private async getKey(keyId: string): Promise<EncryptionKey> {
    // Check cache first
    if (this.keyCache.has(keyId)) {
      return this.keyCache.get(keyId)!;
    }

    // Load from storage
    const key = await storage.getEncryptionKey(keyId);
    if (!key) {
      throw new Error(`Encryption key not found: ${keyId}`);
    }

    if (key.status !== 'active') {
      throw new Error(`Encryption key is not active: ${keyId}`);
    }

    this.keyCache.set(keyId, key);
    return key;
  }

  // Key Rotation
  async rotateKey(purpose: EncryptionKey['purpose']): Promise<void> {
    try {
      console.log(`[Encryption] Starting key rotation for ${purpose}`);

      // Generate new key
      const newKey = await this.generateMasterKey(purpose);

      // Mark old key as rotated
      const oldKeyId = this.currentKeyIds.get(purpose);
      if (oldKeyId && oldKeyId !== newKey.id) {
        await storage.updateEncryptionKeyStatus(oldKeyId, 'rotated');
        this.keyCache.delete(oldKeyId);
      }

      // Update current key reference
      this.currentKeyIds.set(purpose, newKey.id);

      console.log(`[Encryption] Key rotation completed for ${purpose}`);
    } catch (error) {
      console.error(`[Encryption] Key rotation failed for ${purpose}:`, error);
      throw error;
    }
  }

  private startKeyRotationScheduler(): void {
    // Check for key rotation every 24 hours
    setInterval(async () => {
      try {
        await this.performScheduledKeyRotation();
      } catch (error) {
        console.error('[Encryption] Scheduled key rotation failed:', error);
      }
    }, 24 * 60 * 60 * 1000);
  }

  private async performScheduledKeyRotation(): Promise<void> {
    if (!this.KEY_ROTATION_CONFIG.autoRotate) return;

    const purposes: EncryptionKey['purpose'][] = ['token_encryption', 'data_encryption', 'backup_encryption'];

    for (const purpose of purposes) {
      try {
        const currentKeyId = this.currentKeyIds.get(purpose);
        if (!currentKeyId) continue;

        const currentKey = await this.getKey(currentKeyId);
        const keyAge = (Date.now() - currentKey.createdAt.getTime()) / (24 * 60 * 60 * 1000);

        if (keyAge >= this.KEY_ROTATION_CONFIG.rotationIntervalDays) {
          await this.rotateKey(purpose);
        }
      } catch (error) {
        console.error(`[Encryption] Error during scheduled rotation for ${purpose}:`, error);
      }
    }
  }

  // Key Cleanup
  async cleanupExpiredKeys(): Promise<void> {
    try {
      const expiredKeys = await storage.getExpiredEncryptionKeys();
      
      for (const key of expiredKeys) {
        // Only delete keys that are past grace period
        const daysSinceExpiry = (Date.now() - (key.expiresAt?.getTime() || 0)) / (24 * 60 * 60 * 1000);
        
        if (daysSinceExpiry > this.KEY_ROTATION_CONFIG.gracePeriodDays) {
          await storage.deleteEncryptionKey(key.id);
          this.keyCache.delete(key.id);
          console.log(`[Encryption] Deleted expired key: ${key.id}`);
        }
      }
    } catch (error) {
      console.error('[Encryption] Error cleaning up expired keys:', error);
    }
  }

  // Backup Encryption
  async encryptBackup(data: Buffer): Promise<Buffer> {
    try {
      const encrypted = await this.encrypt(data.toString('base64'), 'backup_encryption');
      return Buffer.from(JSON.stringify(encrypted), 'utf8');
    } catch (error) {
      console.error('[Encryption] Backup encryption failed:', error);
      throw error;
    }
  }

  async decryptBackup(encryptedData: Buffer): Promise<Buffer> {
    try {
      const data = JSON.parse(encryptedData.toString('utf8')) as EncryptedData;
      const decrypted = await this.decrypt(data);
      return Buffer.from(decrypted, 'base64');
    } catch (error) {
      console.error('[Encryption] Backup decryption failed:', error);
      throw error;
    }
  }

  // Utility Methods
  async validateEncryptedData(encryptedData: string): Promise<boolean> {
    try {
      const data = JSON.parse(encryptedData) as EncryptedData;
      
      // Validate structure
      if (!data.encryptedData || !data.iv || !data.authTag || !data.keyId) {
        return false;
      }

      // Validate key exists
      const key = await storage.getEncryptionKey(data.keyId);
      return !!key && key.status === 'active';
    } catch (error) {
      return false;
    }
  }

  async getKeyInfo(keyId: string): Promise<Omit<EncryptionKey, 'keyData'> | null> {
    try {
      const key = await storage.getEncryptionKey(keyId);
      if (!key) return null;

      const { keyData, ...keyInfo } = key;
      return keyInfo;
    } catch (error) {
      console.error('[Encryption] Error getting key info:', error);
      return null;
    }
  }

  async generateSecureHash(data: string, salt?: string): Promise<string> {
    const saltBuffer = salt ? Buffer.from(salt, 'hex') : crypto.randomBytes(16);
    const hash = crypto.pbkdf2Sync(data, saltBuffer, 100000, 64, 'sha512');
    return saltBuffer.toString('hex') + ':' + hash.toString('hex');
  }

  async verifySecureHash(data: string, hash: string): Promise<boolean> {
    try {
      const [salt, originalHash] = hash.split(':');
      const newHash = crypto.pbkdf2Sync(data, Buffer.from(salt, 'hex'), 100000, 64, 'sha512');
      return newHash.toString('hex') === originalHash;
    } catch (error) {
      return false;
    }
  }

  // Health Check
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    activeKeys: number;
    expiredKeys: number;
    rotationStatus: string;
  }> {
    try {
      const allKeys = await storage.getAllEncryptionKeys();
      const activeKeys = allKeys.filter(k => k.status === 'active').length;
      const expiredKeys = allKeys.filter(k => k.status === 'expired').length;

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      let rotationStatus = 'normal';

      // Check if all purposes have active keys
      const purposes: EncryptionKey['purpose'][] = ['token_encryption', 'data_encryption', 'backup_encryption'];
      for (const purpose of purposes) {
        const keyId = this.currentKeyIds.get(purpose);
        if (!keyId) {
          status = 'unhealthy';
          rotationStatus = 'missing_keys';
          break;
        }

        const key = await storage.getEncryptionKey(keyId);
        if (!key || this.isKeyExpiringSoon(key)) {
          status = 'degraded';
          rotationStatus = 'rotation_needed';
        }
      }

      return {
        status,
        activeKeys,
        expiredKeys,
        rotationStatus
      };
    } catch (error) {
      console.error('[Encryption] Health check failed:', error);
      return {
        status: 'unhealthy',
        activeKeys: 0,
        expiredKeys: 0,
        rotationStatus: 'error'
      };
    }
  }
}

// Helper function for UUID generation
function uuidv4(): string {
  return crypto.randomUUID();
}

export const encryptionService = new EncryptionService(); 