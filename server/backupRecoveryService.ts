import { storage } from './storage';
import { encryptionService } from './encryptionService';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface BackupConfig {
  id: string;
  name: string;
  type: 'full' | 'incremental' | 'differential' | 'snapshot';
  schedule: {
    frequency: 'hourly' | 'daily' | 'weekly' | 'monthly';
    time?: string; // HH:MM format
    dayOfWeek?: number; // 0-6 (Sunday-Saturday)
    dayOfMonth?: number; // 1-31
  };
  retention: {
    count: number; // Number of backups to keep
    duration: number; // Days to keep backups
    strategy: 'count_based' | 'time_based' | 'hybrid';
  };
  targets: {
    databases: string[];
    fileStorages: string[];
    configurations: string[];
    userUploads: boolean;
    systemLogs: boolean;
  };
  destinations: Array<{
    type: 'local' | 's3' | 'gcs' | 'azure' | 'ftp';
    config: Record<string, any>;
    encryption: boolean;
    compression: boolean;
  }>;
  notifications: {
    onSuccess: string[];
    onFailure: string[];
    onWarning: string[];
  };
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface BackupJob {
  id: string;
  configId: string;
  type: BackupConfig['type'];
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startTime: Date;
  endTime?: Date;
  duration?: number; // milliseconds
  size: number; // bytes
  filesCount: number;
  checksum: string;
  metadata: {
    version: string;
    baseBackupId?: string; // For incremental backups
    changedFiles: string[];
    deletedFiles: string[];
    compressionRatio: number;
    encryptionUsed: boolean;
  };
  destinations: Array<{
    type: string;
    path: string;
    uploaded: boolean;
    uploadTime?: Date;
    error?: string;
  }>;
  error?: {
    message: string;
    stack: string;
    code: string;
  };
  logs: string[];
}

interface RecoveryPoint {
  id: string;
  backupJobId: string;
  timestamp: Date;
  type: 'full' | 'incremental';
  size: number;
  checksum: string;
  dependencies: string[]; // Other recovery points needed for full restore
  metadata: {
    databaseVersion: string;
    applicationVersion: string;
    contentVersion: string;
  };
  verified: boolean;
  verificationDate?: Date;
}

interface RestoreJob {
  id: string;
  recoveryPointId: string;
  type: 'full' | 'partial' | 'point_in_time';
  status: 'pending' | 'running' | 'completed' | 'failed';
  targetEnvironment: 'production' | 'staging' | 'development' | 'custom';
  restoreTargets: {
    databases: string[];
    fileStorages: string[];
    configurations: string[];
    targetPath?: string;
  };
  options: {
    overwriteExisting: boolean;
    validateIntegrity: boolean;
    createBackupBeforeRestore: boolean;
    skipUserData: boolean;
  };
  progress: {
    totalItems: number;
    completedItems: number;
    currentItem: string;
    percentage: number;
  };
  startTime: Date;
  endTime?: Date;
  error?: {
    message: string;
    failedAt: string;
  };
  logs: string[];
}

export class BackupRecoveryService {
  private backupConfigs = new Map<string, BackupConfig>();
  private activeJobs = new Map<string, BackupJob>();
  private scheduledJobs = new Map<string, NodeJS.Timeout>();
  private readonly BACKUP_BASE_PATH = path.join(process.cwd(), 'backups');

  constructor() {
    this.initializeService();
  }

  private async initializeService(): Promise<void> {
    try {
      // Ensure backup directory exists
      await fs.mkdir(this.BACKUP_BASE_PATH, { recursive: true });

      // Load existing backup configurations
      await this.loadBackupConfigs();

      // Schedule existing backup jobs
      await this.scheduleAllBackups();

      // Start cleanup scheduler
      this.startCleanupScheduler();

      console.log('[BackupRecovery] Service initialized');
    } catch (error) {
      console.error('[BackupRecovery] Failed to initialize service:', error);
      throw error;
    }
  }

  // Backup Configuration Management
  async createBackupConfig(config: Omit<BackupConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    try {
      const backupConfig: BackupConfig = {
        id: uuidv4(),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...config
      };

      this.backupConfigs.set(backupConfig.id, backupConfig);
      await storage.createBackupConfig(backupConfig);

      if (backupConfig.enabled) {
        await this.scheduleBackup(backupConfig);
      }

      console.log(`[BackupRecovery] Created backup config: ${backupConfig.name}`);
      return backupConfig.id;
    } catch (error) {
      console.error('[BackupRecovery] Error creating backup config:', error);
      throw error;
    }
  }

  async updateBackupConfig(configId: string, updates: Partial<BackupConfig>): Promise<void> {
    try {
      const config = this.backupConfigs.get(configId);
      if (!config) throw new Error('Backup config not found');

      const updatedConfig = {
        ...config,
        ...updates,
        updatedAt: new Date()
      };

      this.backupConfigs.set(configId, updatedConfig);
      await storage.updateBackupConfig(configId, updatedConfig);

      // Reschedule if needed
      if (this.scheduledJobs.has(configId)) {
        clearTimeout(this.scheduledJobs.get(configId)!);
        this.scheduledJobs.delete(configId);
      }

      if (updatedConfig.enabled) {
        await this.scheduleBackup(updatedConfig);
      }

      console.log(`[BackupRecovery] Updated backup config: ${configId}`);
    } catch (error) {
      console.error('[BackupRecovery] Error updating backup config:', error);
      throw error;
    }
  }

  private async loadBackupConfigs(): Promise<void> {
    try {
      const configs = await storage.getAllBackupConfigs();
      
      for (const config of configs) {
        this.backupConfigs.set(config.id, config);
      }

      console.log(`[BackupRecovery] Loaded ${configs.length} backup configurations`);
    } catch (error) {
      console.error('[BackupRecovery] Error loading backup configs:', error);
    }
  }

  // Backup Scheduling
  private async scheduleAllBackups(): Promise<void> {
    for (const config of this.backupConfigs.values()) {
      if (config.enabled) {
        await this.scheduleBackup(config);
      }
    }
  }

  private async scheduleBackup(config: BackupConfig): Promise<void> {
    const nextRunTime = this.calculateNextRunTime(config.schedule);
    const delay = nextRunTime.getTime() - Date.now();

    if (delay > 0) {
      const timeoutId = setTimeout(async () => {
        await this.executeBackup(config.id);
        // Reschedule for next run
        await this.scheduleBackup(config);
      }, delay);

      this.scheduledJobs.set(config.id, timeoutId);
      
      console.log(`[BackupRecovery] Scheduled backup '${config.name}' for ${nextRunTime.toISOString()}`);
    }
  }

  private calculateNextRunTime(schedule: BackupConfig['schedule']): Date {
    const now = new Date();
    const next = new Date(now);

    switch (schedule.frequency) {
      case 'hourly':
        next.setHours(next.getHours() + 1, 0, 0, 0);
        break;

      case 'daily':
        if (schedule.time) {
          const [hours, minutes] = schedule.time.split(':').map(Number);
          next.setHours(hours, minutes, 0, 0);
          if (next <= now) {
            next.setDate(next.getDate() + 1);
          }
        } else {
          next.setDate(next.getDate() + 1);
          next.setHours(0, 0, 0, 0);
        }
        break;

      case 'weekly':
        const targetDay = schedule.dayOfWeek || 0;
        const daysUntilTarget = (targetDay - next.getDay() + 7) % 7;
        next.setDate(next.getDate() + (daysUntilTarget || 7));
        if (schedule.time) {
          const [hours, minutes] = schedule.time.split(':').map(Number);
          next.setHours(hours, minutes, 0, 0);
        } else {
          next.setHours(0, 0, 0, 0);
        }
        break;

      case 'monthly':
        const targetDate = schedule.dayOfMonth || 1;
        next.setDate(targetDate);
        if (next <= now) {
          next.setMonth(next.getMonth() + 1);
        }
        if (schedule.time) {
          const [hours, minutes] = schedule.time.split(':').map(Number);
          next.setHours(hours, minutes, 0, 0);
        } else {
          next.setHours(0, 0, 0, 0);
        }
        break;
    }

    return next;
  }

  // Backup Execution
  async executeBackup(configId: string): Promise<string> {
    try {
      const config = this.backupConfigs.get(configId);
      if (!config) throw new Error('Backup config not found');

      const job: BackupJob = {
        id: uuidv4(),
        configId,
        type: config.type,
        status: 'pending',
        startTime: new Date(),
        size: 0,
        filesCount: 0,
        checksum: '',
        metadata: {
          version: '1.0',
          changedFiles: [],
          deletedFiles: [],
          compressionRatio: 0,
          encryptionUsed: false
        },
        destinations: [],
        logs: []
      };

      this.activeJobs.set(job.id, job);
      await storage.createBackupJob(job);

      // Execute backup asynchronously
      this.performBackup(job, config).catch(error => {
        console.error(`[BackupRecovery] Backup job ${job.id} failed:`, error);
      });

      return job.id;
    } catch (error) {
      console.error('[BackupRecovery] Error starting backup:', error);
      throw error;
    }
  }

  private async performBackup(job: BackupJob, config: BackupConfig): Promise<void> {
    try {
      job.status = 'running';
      job.logs.push(`[${new Date().toISOString()}] Starting backup: ${config.name}`);
      await storage.updateBackupJob(job.id, job);

      // Create backup directory
      const backupDir = path.join(this.BACKUP_BASE_PATH, job.id);
      await fs.mkdir(backupDir, { recursive: true });

      // Determine backup type and base backup
      let baseBackupId: string | undefined;
      if (config.type === 'incremental') {
        const lastFullBackup = await storage.getLastFullBackup(config.id);
        baseBackupId = lastFullBackup?.id;
        job.metadata.baseBackupId = baseBackupId;
      }

      // Backup databases
      if (config.targets.databases.length > 0) {
        await this.backupDatabases(job, config, backupDir, baseBackupId);
      }

      // Backup file storages
      if (config.targets.fileStorages.length > 0) {
        await this.backupFileStorages(job, config, backupDir, baseBackupId);
      }

      // Backup user uploads
      if (config.targets.userUploads) {
        await this.backupUserUploads(job, config, backupDir, baseBackupId);
      }

      // Backup configurations
      if (config.targets.configurations.length > 0) {
        await this.backupConfigurations(job, config, backupDir);
      }

      // Backup system logs
      if (config.targets.systemLogs) {
        await this.backupSystemLogs(job, config, backupDir);
      }

      // Calculate backup size and checksum
      const backupStats = await this.calculateBackupStats(backupDir);
      job.size = backupStats.size;
      job.filesCount = backupStats.filesCount;
      job.checksum = backupStats.checksum;

      // Compress backup if configured
      const shouldCompress = config.destinations.some(dest => dest.compression);
      if (shouldCompress) {
        await this.compressBackup(job, backupDir);
      }

      // Encrypt backup if configured
      const shouldEncrypt = config.destinations.some(dest => dest.encryption);
      if (shouldEncrypt) {
        await this.encryptBackup(job, backupDir);
        job.metadata.encryptionUsed = true;
      }

      // Upload to destinations
      await this.uploadToDestinations(job, config, backupDir);

      // Create recovery point
      await this.createRecoveryPoint(job);

      // Complete backup
      job.status = 'completed';
      job.endTime = new Date();
      job.duration = job.endTime.getTime() - job.startTime.getTime();
      job.logs.push(`[${new Date().toISOString()}] Backup completed successfully`);

      await storage.updateBackupJob(job.id, job);
      this.activeJobs.delete(job.id);

      // Send success notification
      await this.sendNotification(config, 'success', job);

      console.log(`[BackupRecovery] Backup completed: ${job.id}`);

    } catch (error) {
      job.status = 'failed';
      job.endTime = new Date();
      job.error = {
        message: error.message,
        stack: error.stack,
        code: error.code || 'UNKNOWN'
      };
      job.logs.push(`[${new Date().toISOString()}] Backup failed: ${error.message}`);

      await storage.updateBackupJob(job.id, job);
      this.activeJobs.delete(job.id);

      // Send failure notification
      await this.sendNotification(config, 'failure', job);

      console.error(`[BackupRecovery] Backup failed: ${job.id}`, error);
    }
  }

  private async backupDatabases(job: BackupJob, config: BackupConfig, backupDir: string, baseBackupId?: string): Promise<void> {
    const dbBackupDir = path.join(backupDir, 'databases');
    await fs.mkdir(dbBackupDir, { recursive: true });

    for (const dbName of config.targets.databases) {
      job.logs.push(`[${new Date().toISOString()}] Backing up database: ${dbName}`);

      const dumpFile = path.join(dbBackupDir, `${dbName}.sql`);
      
      if (config.type === 'incremental' && baseBackupId) {
        // Incremental database backup (changes since last backup)
        await this.createIncrementalDatabaseBackup(dbName, dumpFile, baseBackupId);
      } else {
        // Full database backup
        await this.createFullDatabaseBackup(dbName, dumpFile);
      }

      job.metadata.changedFiles.push(dumpFile);
    }
  }

  private async createFullDatabaseBackup(dbName: string, outputFile: string): Promise<void> {
    // Use pg_dump for PostgreSQL backup
    const command = `pg_dump ${dbName} > "${outputFile}"`;
    await execAsync(command);
  }

  private async createIncrementalDatabaseBackup(dbName: string, outputFile: string, baseBackupId: string): Promise<void> {
    // Create incremental backup using WAL files or change tracking
    // This is a simplified implementation - in production, use proper incremental backup strategies
    const command = `pg_dump ${dbName} --incremental-base=${baseBackupId} > "${outputFile}"`;
    await execAsync(command);
  }

  private async backupFileStorages(job: BackupJob, config: BackupConfig, backupDir: string, baseBackupId?: string): Promise<void> {
    const storageBackupDir = path.join(backupDir, 'storage');
    await fs.mkdir(storageBackupDir, { recursive: true });

    for (const storagePath of config.targets.fileStorages) {
      job.logs.push(`[${new Date().toISOString()}] Backing up storage: ${storagePath}`);

      const targetPath = path.join(storageBackupDir, path.basename(storagePath));
      
      if (config.type === 'incremental' && baseBackupId) {
        await this.createIncrementalFileBackup(storagePath, targetPath, baseBackupId);
      } else {
        await this.createFullFileBackup(storagePath, targetPath);
      }
    }
  }

  private async createFullFileBackup(sourcePath: string, targetPath: string): Promise<void> {
    // Use rsync for efficient file copying
    const command = `rsync -av "${sourcePath}/" "${targetPath}/"`;
    await execAsync(command);
  }

  private async createIncrementalFileBackup(sourcePath: string, targetPath: string, baseBackupId: string): Promise<void> {
    // Use rsync with --link-dest for incremental backups
    const baseBackupPath = path.join(this.BACKUP_BASE_PATH, baseBackupId, 'storage', path.basename(sourcePath));
    const command = `rsync -av --link-dest="${baseBackupPath}" "${sourcePath}/" "${targetPath}/"`;
    await execAsync(command);
  }

  private async backupUserUploads(job: BackupJob, config: BackupConfig, backupDir: string, baseBackupId?: string): Promise<void> {
    const uploadsPath = path.join(process.cwd(), 'uploads');
    const uploadsBackupDir = path.join(backupDir, 'uploads');

    if (config.type === 'incremental' && baseBackupId) {
      await this.createIncrementalFileBackup(uploadsPath, uploadsBackupDir, baseBackupId);
    } else {
      await this.createFullFileBackup(uploadsPath, uploadsBackupDir);
    }

    job.logs.push(`[${new Date().toISOString()}] Backed up user uploads`);
  }

  private async backupConfigurations(job: BackupJob, config: BackupConfig, backupDir: string): Promise<void> {
    const configBackupDir = path.join(backupDir, 'config');
    await fs.mkdir(configBackupDir, { recursive: true });

    for (const configFile of config.targets.configurations) {
      const targetFile = path.join(configBackupDir, path.basename(configFile));
      await fs.copyFile(configFile, targetFile);
      job.metadata.changedFiles.push(targetFile);
    }

    job.logs.push(`[${new Date().toISOString()}] Backed up configurations`);
  }

  private async backupSystemLogs(job: BackupJob, config: BackupConfig, backupDir: string): Promise<void> {
    const logsBackupDir = path.join(backupDir, 'logs');
    await fs.mkdir(logsBackupDir, { recursive: true });

    const logsPath = path.join(process.cwd(), 'logs');
    await this.createFullFileBackup(logsPath, logsBackupDir);

    job.logs.push(`[${new Date().toISOString()}] Backed up system logs`);
  }

  private async calculateBackupStats(backupDir: string): Promise<{
    size: number;
    filesCount: number;
    checksum: string;
  }> {
    const stats = await this.getDirectoryStats(backupDir);
    const checksum = await this.calculateDirectoryChecksum(backupDir);

    return {
      size: stats.size,
      filesCount: stats.filesCount,
      checksum
    };
  }

  private async getDirectoryStats(dirPath: string): Promise<{ size: number; filesCount: number }> {
    let totalSize = 0;
    let filesCount = 0;

    const items = await fs.readdir(dirPath, { withFileTypes: true });

    for (const item of items) {
      const itemPath = path.join(dirPath, item.name);
      
      if (item.isDirectory()) {
        const subStats = await this.getDirectoryStats(itemPath);
        totalSize += subStats.size;
        filesCount += subStats.filesCount;
      } else {
        const stat = await fs.stat(itemPath);
        totalSize += stat.size;
        filesCount++;
      }
    }

    return { size: totalSize, filesCount };
  }

  private async calculateDirectoryChecksum(dirPath: string): Promise<string> {
    // Calculate SHA-256 checksum of all files in directory
    const command = `find "${dirPath}" -type f -exec sha256sum {} + | sha256sum`;
    const { stdout } = await execAsync(command);
    return stdout.split(' ')[0];
  }

  private async compressBackup(job: BackupJob, backupDir: string): Promise<void> {
    job.logs.push(`[${new Date().toISOString()}] Compressing backup`);

    const archivePath = `${backupDir}.tar.gz`;
    const command = `tar -czf "${archivePath}" -C "${path.dirname(backupDir)}" "${path.basename(backupDir)}"`;
    
    await execAsync(command);

    // Calculate compression ratio
    const originalStats = await fs.stat(backupDir);
    const compressedStats = await fs.stat(archivePath);
    job.metadata.compressionRatio = compressedStats.size / originalStats.size;

    // Remove uncompressed directory
    await fs.rm(backupDir, { recursive: true });
  }

  private async encryptBackup(job: BackupJob, backupDir: string): Promise<void> {
    job.logs.push(`[${new Date().toISOString()}] Encrypting backup`);

    // Encrypt using the encryption service
    const archivePath = `${backupDir}.tar.gz`;
    const encryptedPath = `${archivePath}.enc`;

    const data = await fs.readFile(archivePath);
    const encryptedData = await encryptionService.encryptBackup(data);
    await fs.writeFile(encryptedPath, encryptedData);

    // Remove unencrypted archive
    await fs.unlink(archivePath);
  }

  private async uploadToDestinations(job: BackupJob, config: BackupConfig, backupDir: string): Promise<void> {
    for (const destination of config.destinations) {
      try {
        job.logs.push(`[${new Date().toISOString()}] Uploading to ${destination.type}`);

        const uploadResult = await this.uploadToDestination(backupDir, destination);
        
        job.destinations.push({
          type: destination.type,
          path: uploadResult.path,
          uploaded: true,
          uploadTime: new Date()
        });

      } catch (error) {
        job.destinations.push({
          type: destination.type,
          path: '',
          uploaded: false,
          error: error.message
        });

        job.logs.push(`[${new Date().toISOString()}] Upload to ${destination.type} failed: ${error.message}`);
      }
    }
  }

  private async uploadToDestination(backupDir: string, destination: any): Promise<{ path: string }> {
    switch (destination.type) {
      case 'local':
        return this.uploadToLocal(backupDir, destination.config);
      case 's3':
        return this.uploadToS3(backupDir, destination.config);
      case 'gcs':
        return this.uploadToGCS(backupDir, destination.config);
      case 'azure':
        return this.uploadToAzure(backupDir, destination.config);
      case 'ftp':
        return this.uploadToFTP(backupDir, destination.config);
      default:
        throw new Error(`Unsupported destination type: ${destination.type}`);
    }
  }

  private async uploadToLocal(backupDir: string, config: any): Promise<{ path: string }> {
    const targetPath = path.join(config.path, path.basename(backupDir));
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.cp(backupDir, targetPath, { recursive: true });
    return { path: targetPath };
  }

  private async uploadToS3(backupDir: string, config: any): Promise<{ path: string }> {
    // In production, use AWS SDK to upload to S3
    const s3Path = `s3://${config.bucket}/${path.basename(backupDir)}`;
    console.log(`[BackupRecovery] Would upload to S3: ${s3Path}`);
    return { path: s3Path };
  }

  private async uploadToGCS(backupDir: string, config: any): Promise<{ path: string }> {
    // In production, use Google Cloud SDK to upload to GCS
    const gcsPath = `gs://${config.bucket}/${path.basename(backupDir)}`;
    console.log(`[BackupRecovery] Would upload to GCS: ${gcsPath}`);
    return { path: gcsPath };
  }

  private async uploadToAzure(backupDir: string, config: any): Promise<{ path: string }> {
    // In production, use Azure SDK to upload to Azure Blob Storage
    const azurePath = `https://${config.account}.blob.core.windows.net/${config.container}/${path.basename(backupDir)}`;
    console.log(`[BackupRecovery] Would upload to Azure: ${azurePath}`);
    return { path: azurePath };
  }

  private async uploadToFTP(backupDir: string, config: any): Promise<{ path: string }> {
    // In production, use FTP client to upload
    const ftpPath = `ftp://${config.host}/${config.path}/${path.basename(backupDir)}`;
    console.log(`[BackupRecovery] Would upload to FTP: ${ftpPath}`);
    return { path: ftpPath };
  }

  private async createRecoveryPoint(job: BackupJob): Promise<void> {
    const recoveryPoint: RecoveryPoint = {
      id: uuidv4(),
      backupJobId: job.id,
      timestamp: job.startTime,
      type: job.type === 'full' ? 'full' : 'incremental',
      size: job.size,
      checksum: job.checksum,
      dependencies: job.metadata.baseBackupId ? [job.metadata.baseBackupId] : [],
      metadata: {
        databaseVersion: '1.0',
        applicationVersion: '1.0',
        contentVersion: '1.0'
      },
      verified: false
    };

    await storage.createRecoveryPoint(recoveryPoint);
    job.logs.push(`[${new Date().toISOString()}] Created recovery point: ${recoveryPoint.id}`);
  }

  // Recovery Operations
  async createRestoreJob(options: {
    recoveryPointId: string;
    type: RestoreJob['type'];
    targetEnvironment: RestoreJob['targetEnvironment'];
    restoreTargets: RestoreJob['restoreTargets'];
    options: RestoreJob['options'];
  }): Promise<string> {
    try {
      const restoreJob: RestoreJob = {
        id: uuidv4(),
        status: 'pending',
        startTime: new Date(),
        progress: {
          totalItems: 0,
          completedItems: 0,
          currentItem: '',
          percentage: 0
        },
        logs: [],
        ...options
      };

      await storage.createRestoreJob(restoreJob);

      // Start restore process
      this.performRestore(restoreJob).catch(error => {
        console.error(`[BackupRecovery] Restore job ${restoreJob.id} failed:`, error);
      });

      return restoreJob.id;
    } catch (error) {
      console.error('[BackupRecovery] Error creating restore job:', error);
      throw error;
    }
  }

  private async performRestore(job: RestoreJob): Promise<void> {
    try {
      job.status = 'running';
      job.logs.push(`[${new Date().toISOString()}] Starting restore from recovery point: ${job.recoveryPointId}`);
      await storage.updateRestoreJob(job.id, job);

      // Get recovery point and dependencies
      const recoveryPoint = await storage.getRecoveryPoint(job.recoveryPointId);
      if (!recoveryPoint) throw new Error('Recovery point not found');

      // Verify recovery point
      if (!recoveryPoint.verified) {
        await this.verifyRecoveryPoint(recoveryPoint.id);
      }

      // Download backup files
      const backupPath = await this.downloadBackupFiles(recoveryPoint);

      // Create backup before restore if requested
      if (job.options.createBackupBeforeRestore) {
        await this.createPreRestoreBackup(job);
      }

      // Perform restore operations
      if (job.restoreTargets.databases.length > 0) {
        await this.restoreDatabases(job, backupPath);
      }

      if (job.restoreTargets.fileStorages.length > 0) {
        await this.restoreFileStorages(job, backupPath);
      }

      // Validate integrity if requested
      if (job.options.validateIntegrity) {
        await this.validateRestoredData(job);
      }

      // Complete restore
      job.status = 'completed';
      job.endTime = new Date();
      job.progress.percentage = 100;
      job.logs.push(`[${new Date().toISOString()}] Restore completed successfully`);

      await storage.updateRestoreJob(job.id, job);

    } catch (error) {
      job.status = 'failed';
      job.endTime = new Date();
      job.error = {
        message: error.message,
        failedAt: job.progress.currentItem
      };
      job.logs.push(`[${new Date().toISOString()}] Restore failed: ${error.message}`);

      await storage.updateRestoreJob(job.id, job);
    }
  }

  private async downloadBackupFiles(recoveryPoint: RecoveryPoint): Promise<string> {
    // Download backup files from storage destinations
    const backupJob = await storage.getBackupJob(recoveryPoint.backupJobId);
    if (!backupJob) throw new Error('Backup job not found');

    const downloadPath = path.join(this.BACKUP_BASE_PATH, 'restore', recoveryPoint.id);
    await fs.mkdir(downloadPath, { recursive: true });

    // Download from first available destination
    for (const destination of backupJob.destinations) {
      if (destination.uploaded) {
        try {
          await this.downloadFromDestination(destination, downloadPath);
          return downloadPath;
        } catch (error) {
          console.warn(`[BackupRecovery] Failed to download from ${destination.type}:`, error);
          continue;
        }
      }
    }

    throw new Error('No backup files could be downloaded');
  }

  private async downloadFromDestination(destination: any, downloadPath: string): Promise<void> {
    // Implementation depends on destination type
    console.log(`[BackupRecovery] Downloading from ${destination.type}: ${destination.path}`);
    
    // For local destinations, just copy the files
    if (destination.type === 'local') {
      await fs.cp(destination.path, downloadPath, { recursive: true });
    }
    
    // For cloud destinations, implement appropriate download logic
  }

  private async restoreDatabases(job: RestoreJob, backupPath: string): Promise<void> {
    const dbBackupPath = path.join(backupPath, 'databases');
    
    for (const dbName of job.restoreTargets.databases) {
      job.progress.currentItem = `Restoring database: ${dbName}`;
      job.logs.push(`[${new Date().toISOString()}] ${job.progress.currentItem}`);

      const dumpFile = path.join(dbBackupPath, `${dbName}.sql`);
      
      if (job.options.overwriteExisting) {
        // Drop and recreate database
        await execAsync(`dropdb ${dbName} || true`);
        await execAsync(`createdb ${dbName}`);
      }

      // Restore database
      await execAsync(`psql ${dbName} < "${dumpFile}"`);
      
      job.progress.completedItems++;
      job.progress.percentage = (job.progress.completedItems / job.progress.totalItems) * 100;
      await storage.updateRestoreJob(job.id, job);
    }
  }

  private async restoreFileStorages(job: RestoreJob, backupPath: string): Promise<void> {
    const storageBackupPath = path.join(backupPath, 'storage');
    
    for (const storagePath of job.restoreTargets.fileStorages) {
      job.progress.currentItem = `Restoring storage: ${storagePath}`;
      job.logs.push(`[${new Date().toISOString()}] ${job.progress.currentItem}`);

      const sourcePath = path.join(storageBackupPath, path.basename(storagePath));
      const targetPath = job.restoreTargets.targetPath || storagePath;

      if (job.options.overwriteExisting) {
        await fs.rm(targetPath, { recursive: true, force: true });
      }

      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.cp(sourcePath, targetPath, { recursive: true });
      
      job.progress.completedItems++;
      job.progress.percentage = (job.progress.completedItems / job.progress.totalItems) * 100;
      await storage.updateRestoreJob(job.id, job);
    }
  }

  private async createPreRestoreBackup(job: RestoreJob): Promise<void> {
    job.logs.push(`[${new Date().toISOString()}] Creating pre-restore backup`);
    
    // Create a quick backup before restore
    const preRestoreConfig: Omit<BackupConfig, 'id' | 'createdAt' | 'updatedAt'> = {
      name: `Pre-restore backup for ${job.id}`,
      type: 'full',
      schedule: { frequency: 'daily' },
      retention: { count: 1, duration: 7, strategy: 'time_based' },
      targets: {
        databases: job.restoreTargets.databases,
        fileStorages: job.restoreTargets.fileStorages,
        configurations: [],
        userUploads: false,
        systemLogs: false
      },
      destinations: [{
        type: 'local',
        config: { path: path.join(this.BACKUP_BASE_PATH, 'pre-restore') },
        encryption: false,
        compression: true
      }],
      notifications: { onSuccess: [], onFailure: [], onWarning: [] },
      enabled: false
    };

    await this.createBackupConfig(preRestoreConfig);
  }

  private async validateRestoredData(job: RestoreJob): Promise<void> {
    job.logs.push(`[${new Date().toISOString()}] Validating restored data integrity`);
    
    // Perform integrity checks on restored databases and files
    for (const dbName of job.restoreTargets.databases) {
      // Check database connectivity and basic queries
      try {
        await execAsync(`psql ${dbName} -c "SELECT 1;"`);
        job.logs.push(`[${new Date().toISOString()}] Database ${dbName} validation passed`);
      } catch (error) {
        throw new Error(`Database ${dbName} validation failed: ${error.message}`);
      }
    }
  }

  // Recovery Point Verification
  async verifyRecoveryPoint(recoveryPointId: string): Promise<boolean> {
    try {
      const recoveryPoint = await storage.getRecoveryPoint(recoveryPointId);
      if (!recoveryPoint) throw new Error('Recovery point not found');

      // Download and verify backup integrity
      const backupPath = await this.downloadBackupFiles(recoveryPoint);
      const actualChecksum = await this.calculateDirectoryChecksum(backupPath);

      const isValid = actualChecksum === recoveryPoint.checksum;
      
      // Update verification status
      recoveryPoint.verified = isValid;
      recoveryPoint.verificationDate = new Date();
      await storage.updateRecoveryPoint(recoveryPointId, recoveryPoint);

      console.log(`[BackupRecovery] Recovery point ${recoveryPointId} verification: ${isValid ? 'PASSED' : 'FAILED'}`);
      return isValid;

    } catch (error) {
      console.error(`[BackupRecovery] Error verifying recovery point ${recoveryPointId}:`, error);
      return false;
    }
  }

  // Cleanup and Maintenance
  private startCleanupScheduler(): void {
    // Run cleanup every 24 hours
    setInterval(async () => {
      await this.performCleanup();
    }, 24 * 60 * 60 * 1000);
  }

  private async performCleanup(): Promise<void> {
    try {
      console.log('[BackupRecovery] Starting cleanup process');

      for (const config of this.backupConfigs.values()) {
        await this.cleanupOldBackups(config);
      }

      console.log('[BackupRecovery] Cleanup process completed');
    } catch (error) {
      console.error('[BackupRecovery] Error during cleanup:', error);
    }
  }

  private async cleanupOldBackups(config: BackupConfig): Promise<void> {
    const backupJobs = await storage.getBackupJobsByConfig(config.id);
    const sortedJobs = backupJobs.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());

    let jobsToDelete: BackupJob[] = [];

    if (config.retention.strategy === 'count_based') {
      jobsToDelete = sortedJobs.slice(config.retention.count);
    } else if (config.retention.strategy === 'time_based') {
      const cutoffDate = new Date(Date.now() - config.retention.duration * 24 * 60 * 60 * 1000);
      jobsToDelete = sortedJobs.filter(job => job.startTime < cutoffDate);
    } else {
      // Hybrid strategy
      const countBasedJobs = sortedJobs.slice(config.retention.count);
      const cutoffDate = new Date(Date.now() - config.retention.duration * 24 * 60 * 60 * 1000);
      const timeBasedJobs = sortedJobs.filter(job => job.startTime < cutoffDate);
      
      jobsToDelete = [...new Set([...countBasedJobs, ...timeBasedJobs])];
    }

    for (const job of jobsToDelete) {
      await this.deleteBackupJob(job.id);
    }

    if (jobsToDelete.length > 0) {
      console.log(`[BackupRecovery] Cleaned up ${jobsToDelete.length} old backups for config: ${config.name}`);
    }
  }

  private async deleteBackupJob(jobId: string): Promise<void> {
    try {
      // Delete backup files
      const backupPath = path.join(this.BACKUP_BASE_PATH, jobId);
      await fs.rm(backupPath, { recursive: true, force: true });

      // Delete from database
      await storage.deleteBackupJob(jobId);

      console.log(`[BackupRecovery] Deleted backup job: ${jobId}`);
    } catch (error) {
      console.error(`[BackupRecovery] Error deleting backup job ${jobId}:`, error);
    }
  }

  // Notifications
  private async sendNotification(config: BackupConfig, type: 'success' | 'failure' | 'warning', job: BackupJob): Promise<void> {
    const recipients = config.notifications[`on${type.charAt(0).toUpperCase() + type.slice(1)}` as keyof typeof config.notifications];
    
    if (recipients.length === 0) return;

    const subject = `Backup ${type.toUpperCase()}: ${config.name}`;
    const message = this.formatNotificationMessage(type, config, job);

    // Send notifications (email, Slack, etc.)
    console.log(`[BackupRecovery] Sending ${type} notification for backup: ${config.name}`);
    console.log(`Recipients: ${recipients.join(', ')}`);
    console.log(`Message: ${message}`);
  }

  private formatNotificationMessage(type: string, config: BackupConfig, job: BackupJob): string {
    if (type === 'success') {
      return `Backup "${config.name}" completed successfully.\n` +
             `Duration: ${job.duration ? Math.round(job.duration / 1000) : 0} seconds\n` +
             `Size: ${this.formatBytes(job.size)}\n` +
             `Files: ${job.filesCount}`;
    } else {
      return `Backup "${config.name}" failed.\n` +
             `Error: ${job.error?.message || 'Unknown error'}\n` +
             `Started: ${job.startTime.toISOString()}`;
    }
  }

  private formatBytes(bytes: number): string {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  // Status and Monitoring
  async getBackupStatus(): Promise<{
    activeJobs: number;
    scheduledJobs: number;
    totalConfigs: number;
    lastBackupTime?: Date;
    nextBackupTime?: Date;
  }> {
    const nextBackups = Array.from(this.backupConfigs.values())
      .filter(config => config.enabled)
      .map(config => this.calculateNextRunTime(config.schedule))
      .sort((a, b) => a.getTime() - b.getTime());

    const lastBackupJob = await storage.getLastBackupJob();

    return {
      activeJobs: this.activeJobs.size,
      scheduledJobs: this.scheduledJobs.size,
      totalConfigs: this.backupConfigs.size,
      lastBackupTime: lastBackupJob?.startTime,
      nextBackupTime: nextBackups[0]
    };
  }

  async getRecoveryPoints(): Promise<RecoveryPoint[]> {
    return await storage.getAllRecoveryPoints();
  }

  // Cleanup
  destroy(): void {
    // Clear all scheduled jobs
    for (const timeoutId of this.scheduledJobs.values()) {
      clearTimeout(timeoutId);
    }
    this.scheduledJobs.clear();
  }
}

export const backupRecoveryService = new BackupRecoveryService(); 