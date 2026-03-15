import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { MongoClient, Db } from 'mongodb';
import { createClient } from 'redis';
import {
  generateInstanceId,
  generateSecureToken,
} from '@hospital-cms/crypto';
import { generateRsaKeyPair, saveKeyPair } from "@hospital-cms/crypto-vendor";
import {
  connectDatabase,
  ensureIndexes,
  HospitalRepository,
  UserRepository,
} from '@hospital-cms/database';
import { hashPassword } from '@hospital-cms/auth';
import { UserRole } from '@hospital-cms/shared-types';
import { getDefaultPermissionsForRole } from '@hospital-cms/rbac';
import {
  InstallerAlreadyCompleteError,
  DatabaseError,
  ServiceUnavailableError,
} from '@hospital-cms/errors';

const log = {
  info: (obj: unknown, msg?: string) => console.log('[installer]', msg ?? obj, msg ? obj : ''),
  error: (obj: unknown, msg?: string) => console.error('[installer]', msg ?? obj, msg ? obj : ''),
  warn: (obj: unknown, msg?: string) => console.warn('[installer]', msg ?? obj, msg ? obj : ''),
};

export interface InstallationConfig {
  mongoUri: string;
  redisUrl: string;
  controlPanelUrl: string;
  registrationToken: string;
  hospitalName: string;
  hospitalSlug: string;
  address: {
    line1: string;
    city: string;
    state: string;
    country: string;
    postalCode: string;
  };
  contact: {
    email: string;
    phone: string;
  };
  settings: {
    timezone: string;
    currency: string;
    dateFormat: string;
    defaultLanguage: string;
  };
  adminUser: {
    firstName: string;
    lastName: string;
    email: string;
    username: string;
    password: string;
  };
  privateKeyPath: string;
  publicKeyPath: string;
  lockFilePath: string;
}

export interface ConnectivityTestResult {
  mongodb: { ok: boolean; error?: string };
  redis: { ok: boolean; error?: string };
}

export class InstallerService {
  async isAlreadyInstalled(lockFilePath: string): Promise<boolean> {
    return existsSync(lockFilePath);
  }

  async testConnectivity(
    mongoUri: string,
    redisUrl: string
  ): Promise<ConnectivityTestResult> {
    const result: ConnectivityTestResult = {
      mongodb: { ok: false },
      redis: { ok: false },
    };

    // Test MongoDB
    let mongoClient: MongoClient | null = null;
    try {
      mongoClient = new MongoClient(mongoUri, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000,
      });
      await mongoClient.connect();
      await mongoClient.db('admin').command({ ping: 1 });

      // Test write capability
      const testDb = mongoClient.db('hospital_cms_install_test');
      await testDb.collection('_test').insertOne({ ts: new Date() });
      await testDb.collection('_test').deleteMany({});

      result.mongodb = { ok: true };
    } catch (err) {
      result.mongodb = {
        ok: false,
        error: err instanceof Error ? err.message : 'Unknown MongoDB error',
      };
    } finally {
      await mongoClient?.close();
    }

    // Test Redis
    let redisClient: ReturnType<typeof createClient> | null = null;
    try {
      redisClient = createClient({ url: redisUrl });
      await redisClient.connect();
      await redisClient.ping();
      result.redis = { ok: true };
    } catch (err) {
      result.redis = {
        ok: false,
        error: err instanceof Error ? err.message : 'Unknown Redis error',
      };
    } finally {
      await redisClient?.disconnect();
    }

    return result;
  }

  async runInstallation(config: InstallationConfig): Promise<{
    instanceId: string;
    publicKey: string;
  }> {
    if (await this.isAlreadyInstalled(config.lockFilePath)) {
      throw new InstallerAlreadyCompleteError();
    }

    log.info('Starting installation');

    // 1. Connect and validate MongoDB
    const mongoClient = new MongoClient(config.mongoUri, {
      serverSelectionTimeoutMS: 10000,
    });

    let db: Db;
    try {
      await mongoClient.connect();
      db = mongoClient.db();
    } catch (err) {
      throw new DatabaseError('Cannot connect to MongoDB', {
        cause: err instanceof Error ? err.message : String(err),
      });
    }

    try {
      // 2. Ensure all indexes
      log.info('Creating database indexes');
      await ensureIndexes(db);

      // 3. Generate instance ID
      const instanceId = generateInstanceId();
      log.info({ instanceId }, 'Generated instance ID');

      // 4. Generate RSA key pair
      log.info('Generating RSA key pair');
      const keyDir = config.privateKeyPath.substring(
        0,
        config.privateKeyPath.lastIndexOf('/')
      );
      mkdirSync(keyDir, { recursive: true });
      const keyPair = generateRsaKeyPair();
      saveKeyPair(
        config.privateKeyPath,
        config.publicKeyPath,
        keyPair
      );
      log.info({ dir: keyDir }, 'RSA key pair saved');

      // 5. Create hospital instance document
      const hospitalRepo = new HospitalRepository(db);
      await hospitalRepo.insertOne({
        instanceId,
        name: config.hospitalName,
        slug: config.hospitalSlug,
        address: {
          ...config.address,
        },
        contact: {
          ...config.contact,
        },
        settings: {
          ...config.settings,
          appointmentDurationMinutes: 30,
          enablePatientPortal: false,
        },
        publicKey: keyPair.publicKey,
        licenseId: '',
        isInstalled: true,
        installedAt: new Date(),
        appVersion: '1.0.0',
      });
      log.info('Hospital instance created');

      // 6. Create SUPER_ADMIN user
      const userRepo = new UserRepository(db);
      const passwordHash = await hashPassword(config.adminUser.password);
      await userRepo.insertOne({
        hospitalId: instanceId,
        username: config.adminUser.username.toLowerCase(),
        email: config.adminUser.email.toLowerCase(),
        passwordHash,
        role: UserRole.SUPER_ADMIN,
        permissions: [],
        isActive: true,
        isLocked: false,
        failedLoginAttempts: 0,
        mfaEnabled: false,
        passwordChangedAt: new Date(),
        mustChangePassword: true, // Force password change on first login
        profile: {
          firstName: config.adminUser.firstName,
          lastName: config.adminUser.lastName,
        },
      });
      log.info({ username: config.adminUser.username }, 'SUPER_ADMIN created');

      // 7. Write lock file (prevents re-installation)
      const lockDir = config.lockFilePath.substring(
        0,
        config.lockFilePath.lastIndexOf('/')
      );
      mkdirSync(lockDir, { recursive: true });
      writeFileSync(
        config.lockFilePath,
        JSON.stringify({
          instanceId,
          installedAt: new Date().toISOString(),
          version: '1.0.0',
        }),
        { mode: 0o600 }
      );
      log.info({ path: config.lockFilePath }, 'Installer locked');

      log.info({ instanceId }, 'Installation completed successfully');

      // 8. Register with vendor control panel
      log.info({ url: config.controlPanelUrl }, 'Registering with control panel');
      try {
        const regRes = await fetch(
          `${config.controlPanelUrl.replace(/\/$/, '')}/api/instances/register`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Registration-Token': config.registrationToken,
            },
            body: JSON.stringify({
              hospitalName: config.hospitalName,
              hospitalSlug: config.hospitalSlug,
              publicKey: keyPair.publicKey,
              agentVersion: '1.0.0',
            }),
            signal: AbortSignal.timeout(15000),
          },
        );
        if (!regRes.ok) {
          const errBody = await regRes.json().catch(() => ({}));
          log.warn({ status: regRes.status, err: errBody }, 'Control panel registration failed — installation completed locally');
        } else {
          const regBody = await regRes.json();
          log.info({ instanceId: regBody.data?.instance?.instanceId }, 'Registered with control panel');
        }
      } catch (err) {
        log.warn({ err: String(err) }, 'Could not reach control panel — installation completed locally');
      }

      return { instanceId, publicKey: keyPair.publicKey };
    } finally {
      await mongoClient.close();
    }
  }
}
