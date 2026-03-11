/**
 * CredentialsStore - Almacenamiento encriptado de credenciales de skills (API keys, tokens, etc.)
 * Usa AES-256-GCM para cifrado autenticado
 * Fase 9: Skills System
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { DB } from './db.js';
import { SkillCredential } from '../config/types.js';
import { logger } from '../utils/logger.js';
import { StorageError } from '../utils/errors.js';

export class CredentialsStore {
  private masterKey: Buffer;  // Master key para derivar claves por usuario

  constructor(encryptionKey: string) {
    // encryptionKey debe ser hex string de 32 bytes (64 caracteres)
    if (encryptionKey.length !== 64) {
      throw new StorageError(
        'STORAGE_ENCRYPTION_KEY must be 64 hex characters (32 bytes). ' +
        'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
      );
    }

    try {
      this.masterKey = Buffer.from(encryptionKey, 'hex');
    } catch {
      throw new StorageError('STORAGE_ENCRYPTION_KEY must be valid hex string');
    }
  }

  /**
   * Guardar una credencial encriptada para un skill
   */
  saveCredential(userId: string, skillName: string, key: string, value: string): SkillCredential {
    try {
      const store = DB.getInstance();

      // Derivar clave única por usuario + skill + key
      const salt = Buffer.from(`${userId}:${skillName}:${key}`);
      const derivedKey = scryptSync(this.masterKey, salt, 32);

      // Generar IV aleatorio de 12 bytes (recomendado para GCM)
      const iv = randomBytes(12);

      // Cifrar valor
      const cipher = createCipheriv('aes-256-gcm', derivedKey, iv);
      let encrypted = cipher.update(value, 'utf-8', 'hex');
      encrypted += cipher.final('hex');
      const authTag = cipher.getAuthTag();

      const credential: SkillCredential = {
        id: `${userId}:${skillName}:${key}`,  // Identificador único
        userId,
        skillName,
        key,
        encryptedValue: encrypted,
        encryptionIv: iv.toString('hex'),
        encryptionTag: authTag.toString('hex'),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Guardar en DB (simulated)
      store.addCredential(userId, credential);

      logger.debug('Credential saved for skill', {
        userId,
        skillName,
        key,
      });

      return credential;
    } catch (error) {
      logger.error('Failed to save credential', error);
      throw new StorageError(`Failed to save credential: ${error}`);
    }
  }

  /**
   * Obtener credenciales desencriptadas de un skill
   * Retorna un objeto Key/Value
   */
  getCredentials(userId: string, skillName: string): Record<string, string> {
    try {
      const store = DB.getInstance();
      const credentials = store.getCredentials(userId, skillName) || [];

      const result: Record<string, string> = {};

      for (const cred of credentials) {
        try {
          const decrypted = this.decryptCredential(cred);
          result[cred.key] = decrypted;
        } catch (error) {
          logger.warn(`Failed to decrypt credential ${cred.key} for skill ${skillName}`, error);
          // Skip this credential si falla decryption
        }
      }

      return result;
    } catch (error) {
      logger.error('Failed to get credentials', error);
      return {};
    }
  }

  /**
   * Obtener una credencial específica desencriptada
   */
  getCredential(userId: string, skillName: string, key: string): string | null {
    try {
      const credentials = this.getCredentials(userId, skillName);
      return credentials[key] || null;
    } catch (error) {
      logger.error('Failed to get credential', error);
      return null;
    }
  }

  /**
   * Verificar si existen credenciales para un skill
   */
  hasCredentials(userId: string, skillName: string, requiredKeys?: string[]): boolean {
    try {
      const credentials = this.getCredentials(userId, skillName);

      if (requiredKeys) {
        // Verificar que existan todas las claves requeridas
        return requiredKeys.every(key => key in credentials && credentials[key]);
      }

      // Solo verificar que exista al menos algo
      return Object.keys(credentials).length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Listar todas las credenciales de un usuario (sin valores)
   * Solo retorna metadatos (keys de credenciales disponibles)
   */
  listCredentials(userId: string): Array<{ skillName: string; keys: string[] }> {
    try {
      const store = DB.getInstance();
      const allCredentials = store.getAllCredentials(userId) || [];

      // Agrupar por skillName
      const grouped: Record<string, Set<string>> = {};

      for (const cred of allCredentials) {
        if (!grouped[cred.skillName]) {
          grouped[cred.skillName] = new Set();
        }
        grouped[cred.skillName].add(cred.key);
      }

      // Convertir a array de {skillName, keys}
      return Object.entries(grouped).map(([skillName, keys]) => ({
        skillName,
        keys: Array.from(keys),
      }));
    } catch (error) {
      logger.error('Failed to list credentials', error);
      return [];
    }
  }

  /**
   * Eliminar una credencial
   */
  deleteCredential(userId: string, skillName: string, key: string): void {
    try {
      const store = DB.getInstance();
      store.deleteCredential(userId, skillName, key);

      logger.debug('Credential deleted', {
        userId,
        skillName,
        key,
      });
    } catch (error) {
      logger.error('Failed to delete credential', error);
      throw new StorageError(`Failed to delete credential: ${error}`);
    }
  }

  /**
   * Eliminar todas las credenciales de un skill
   */
  deleteSkillCredentials(userId: string, skillName: string): void {
    try {
      const store = DB.getInstance();
      const credentials = store.getCredentials(userId, skillName) || [];

      for (const cred of credentials) {
        this.deleteCredential(userId, skillName, cred.key);
      }

      logger.info('All skill credentials deleted', {
        userId,
        skillName,
      });
    } catch (error) {
      logger.error('Failed to delete skill credentials', error);
      throw new StorageError(`Failed to delete skill credentials: ${error}`);
    }
  }

  /**
   * Desencriptar una credencial individual
   * (Método privado/interno)
   */
  private decryptCredential(credential: SkillCredential): string {
    try {
      const { userId, skillName, key, encryptedValue, encryptionIv, encryptionTag } = credential;

      // Derivar la misma clave
      const salt = Buffer.from(`${userId}:${skillName}:${key}`);
      const derivedKey = scryptSync(this.masterKey, salt, 32);

      // Recuperar IV y tag
      const iv = Buffer.from(encryptionIv, 'hex');
      const authTag = Buffer.from(encryptionTag, 'hex');

      // Desencriptar
      const decipher = createDecipheriv('aes-256-gcm', derivedKey, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encryptedValue, 'hex', 'utf-8');
      decrypted += decipher.final('utf-8');

      return decrypted;
    } catch (error) {
      logger.error('Failed to decrypt credential', error);
      throw new StorageError(`Failed to decrypt credential: ${error}`);
    }
  }

  /**
   * Obtener todas las credenciales de un usuario agrupadas por skill
   * Retorna { skillName: { key: value } }
   */
  getAllUserCredentials(userId: string): Record<string, Record<string, string>> {
    try {
      const store = DB.getInstance();
      const allCredentials = store.getAllCredentials(userId) || [];

      const result: Record<string, Record<string, string>> = {};

      for (const cred of allCredentials) {
        if (!result[cred.skillName]) {
          result[cred.skillName] = {};
        }
        
        try {
          const decrypted = this.decryptCredential(cred);
          result[cred.skillName][cred.key] = decrypted;
        } catch (error) {
          logger.warn(`Failed to decrypt credential ${cred.key} for skill ${cred.skillName}`, error);
          // Skip this credential if decryption fails
        }
      }

      return result;
    } catch (error) {
      logger.error('Failed to get all user credentials', error);
      return {};
    }
  }
}
