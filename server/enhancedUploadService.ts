import { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fsPromises from 'fs/promises';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';
import { storage } from './storage';

interface UploadSession {
  uploadId: string;
  userId: string;
  filename: string;
  totalChunks: number;
  totalSize: number;
  uploadedChunks: number[];
  status: 'uploading' | 'processing' | 'completed' | 'failed' | 'cancelled';
  metadata: {
    fileSize: number;
    mimeType: string;
    lastChunkTime: Date;
    fileType: string;
  };
  createdAt: Date;
  lastActivity: Date;
}

interface UploadProgress {
  uploadId: string;
  filename: string;
  bytesUploaded: number;
  totalBytes: number;
  progress: number;
  eta: number;
  status: 'uploading' | 'processing' | 'completed' | 'error' | 'cancelled';
  error?: string;
  startTime: Date;
}

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB max
const UPLOAD_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const SESSION_TTL = 3600; // 1 hour Redis TTL

const ALLOWED_FORMATS = {
  video: ['.mp4', '.mov', '.avi', '.mkv', '.webm'],
  audio: ['.mp3', '.wav', '.m4a', '.aac', '.flac'],
  text: ['.txt', '.rtf', '.md', '.docx']
};

class EnhancedUploadService {
  private redis: Redis;
  private uploadProgress: Map<string, UploadProgress> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    
    // Clean up stale uploads every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleUploads();
    }, 5 * 60 * 1000);
  }

  private async cleanupStaleUploads() {
    try {
      const now = new Date();
      const staleCutoff = new Date(now.getTime() - UPLOAD_TIMEOUT);
      
      // Get all upload keys from Redis
      const keys = await this.redis.keys('upload:*');
      
      for (const key of keys) {
        const sessionData = await this.redis.get(key);
        if (sessionData) {
          const session: UploadSession = JSON.parse(sessionData);
          if (new Date(session.lastActivity) < staleCutoff) {
            await this.cancelUpload(session.uploadId);
          }
        }
      }
    } catch (error) {
      console.error('Error cleaning up stale uploads:', error);
    }
  }

  validateFileType(filename: string): { isValid: boolean; type?: string; error?: string } {
    const ext = path.extname(filename).toLowerCase();
    
    for (const [type, extensions] of Object.entries(ALLOWED_FORMATS)) {
      if (extensions.includes(ext)) {
        return { isValid: true, type };
      }
    }
    
    return { 
      isValid: false, 
      error: `Unsupported file format. Allowed: ${Object.values(ALLOWED_FORMATS).flat().join(', ')}` 
    };
  }

  validateFileSize(size: number): { isValid: boolean; error?: string } {
    if (size > MAX_FILE_SIZE) {
      return { 
        isValid: false, 
        error: `File too large. Maximum size: ${Math.round(MAX_FILE_SIZE / (1024 * 1024 * 1024))}GB` 
      };
    }
    return { isValid: true };
  }

  async saveSession(session: UploadSession): Promise<void> {
    const key = `upload:${session.uploadId}`;
    const data = {
      ...session,
      uploadedChunks: Array.from(session.uploadedChunks),
      lastActivity: new Date().toISOString()
    };
    await this.redis.setex(key, SESSION_TTL, JSON.stringify(data));
  }

  async getSession(uploadId: string): Promise<UploadSession | null> {
    try {
      const key = `upload:${uploadId}`;
      const data = await this.redis.get(key);
      if (!data) return null;
      
      const session = JSON.parse(data);
      session.uploadedChunks = new Set(session.uploadedChunks);
      session.lastActivity = new Date(session.lastActivity);
      session.createdAt = new Date(session.createdAt);
      return session;
    } catch (error) {
      console.error('Error getting session:', error);
      return null;
    }
  }

  async initializeUpload(req: Request, res: Response) {
    try {
      const { filename, totalSize, totalChunks, userId } = req.body;

      if (!filename || !totalSize || !totalChunks || !userId) {
        return res.status(400).json({ 
          error: 'Missing required fields: filename, totalSize, totalChunks, userId' 
        });
      }

      // Validate file type
      const typeValidation = this.validateFileType(filename);
      if (!typeValidation.isValid) {
        return res.status(400).json({ error: typeValidation.error });
      }

      // Validate file size
      const sizeValidation = this.validateFileSize(totalSize);
      if (!sizeValidation.isValid) {
        return res.status(400).json({ error: sizeValidation.error });
      }

      const uploadId = uuidv4();
      const session: UploadSession = {
        uploadId,
        userId,
        filename,
        totalChunks: parseInt(totalChunks),
        totalSize: parseInt(totalSize),
        uploadedChunks: [],
        status: 'uploading',
        metadata: {
          fileSize: parseInt(totalSize),
          mimeType: this.getMimeType(filename),
          lastChunkTime: new Date(),
          fileType: typeValidation.type!
        },
        createdAt: new Date(),
        lastActivity: new Date()
      };

      // Save session to Redis
      await this.saveSession(session);
      
      const progress: UploadProgress = {
        uploadId,
        filename,
        bytesUploaded: 0,
        totalBytes: parseInt(totalSize),
        progress: 0,
        eta: 0,
        status: 'uploading',
        startTime: new Date()
      };
      
      this.uploadProgress.set(uploadId, progress);

      // Create upload directory
      const uploadDir = path.join(process.cwd(), 'uploads', uploadId);
      await fsPromises.mkdir(uploadDir, { recursive: true });

      res.json({
        uploadId,
        chunkSize: CHUNK_SIZE,
        message: 'Upload initialized successfully'
      });
    } catch (error) {
      console.error('Error initializing upload:', error);
      res.status(500).json({ error: 'Failed to initialize upload' });
    }
  }

  async uploadChunk(req: Request, res: Response) {
    try {
      const { uploadId } = req.params;
      const chunkNumber = parseInt(req.body.chunkNumber);
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: 'No chunk data received' });
      }

      // Get session from Redis
      const session = await this.getSession(uploadId);
      if (!session) {
        return res.status(404).json({ error: 'Upload session not found or expired' });
      }

      // Update last activity
      session.lastActivity = new Date();
      session.metadata.lastChunkTime = new Date();

      // Save chunk to disk
      const uploadDir = path.join(process.cwd(), 'uploads', uploadId);
      const chunkPath = path.join(uploadDir, `chunk_${chunkNumber}`);
      await fsPromises.writeFile(chunkPath, file.buffer);

      // Mark chunk as uploaded
      session.uploadedChunks.push(chunkNumber);

      // Save updated session to Redis
      await this.saveSession(session);

      // Update progress
      const progress = this.uploadProgress.get(uploadId);
      if (progress) {
        progress.bytesUploaded += file.buffer.length;
        progress.progress = (progress.bytesUploaded / progress.totalBytes) * 100;
        
        // Calculate ETA
        const elapsed = Date.now() - progress.startTime.getTime();
        const rate = progress.bytesUploaded / elapsed; // bytes per ms
        const remaining = progress.totalBytes - progress.bytesUploaded;
        progress.eta = rate > 0 ? Math.round(remaining / rate) : 0;
      }

      // Check if upload is complete
      if (session.uploadedChunks.length === session.totalChunks) {
        await this.finalizeUpload(uploadId);
      }

      res.json({
        success: true,
        uploadedChunks: session.uploadedChunks.length,
        totalChunks: session.totalChunks,
        progress: progress?.progress || 0,
        eta: progress?.eta || 0
      });
    } catch (error) {
      console.error('Error uploading chunk:', error);
      res.status(500).json({ error: 'Failed to upload chunk' });
    }
  }

  async resumeUpload(req: Request, res: Response) {
    try {
      const { uploadId } = req.params;
      
      const session = await this.getSession(uploadId);
      if (!session) {
        return res.status(404).json({ error: 'Upload session not found or expired' });
      }

      if (session.status === 'completed') {
        return res.status(400).json({ error: 'Upload already completed' });
      }

      if (session.status === 'cancelled') {
        return res.status(400).json({ error: 'Upload was cancelled' });
      }

      // Find missing chunks
      const missingChunks = [];
      for (let i = 0; i < session.totalChunks; i++) {
        if (!session.uploadedChunks.includes(i)) {
          missingChunks.push(i);
        }
      }

      res.json({
        uploadId,
        missingChunks,
        uploadedChunks: session.uploadedChunks.length,
        totalChunks: session.totalChunks,
        progress: (session.uploadedChunks.length / session.totalChunks) * 100,
        canResume: true
      });
    } catch (error) {
      console.error('Error resuming upload:', error);
      res.status(500).json({ error: 'Failed to resume upload' });
    }
  }

  async getUploadProgress(req: Request, res: Response) {
    try {
      const { uploadId } = req.params;
      
      const session = await this.getSession(uploadId);
      if (!session) {
        return res.status(404).json({ error: 'Upload session not found' });
      }

      const progress = this.uploadProgress.get(uploadId);
      
      res.json({
        uploadId,
        filename: session.filename,
        status: session.status,
        progress: progress?.progress || (session.uploadedChunks.length / session.totalChunks) * 100,
        uploadedChunks: session.uploadedChunks.length,
        totalChunks: session.totalChunks,
        eta: progress?.eta || 0
      });
    } catch (error) {
      console.error('Error getting upload progress:', error);
      res.status(500).json({ error: 'Failed to get upload progress' });
    }
  }

  async cancelUpload(uploadId: string) {
    try {
      const session = await this.getSession(uploadId);
      if (session) {
        session.status = 'cancelled';
        await this.saveSession(session);
        
        // Clean up files
        const uploadDir = path.join(process.cwd(), 'uploads', uploadId);
        await fsPromises.rm(uploadDir, { recursive: true, force: true });
        
        // Remove from Redis
        await this.redis.del(`upload:${uploadId}`);
      }
      
      // Remove from progress tracking
      this.uploadProgress.delete(uploadId);
    } catch (error) {
      console.error('Error cancelling upload:', error);
    }
  }

  async handleCancelUpload(req: Request, res: Response) {
    try {
      const { uploadId } = req.params;
      await this.cancelUpload(uploadId);
      res.json({ success: true, message: 'Upload cancelled successfully' });
    } catch (error) {
      console.error('Error handling cancel upload:', error);
      res.status(500).json({ error: 'Failed to cancel upload' });
    }
  }

  private async finalizeUpload(uploadId: string) {
    try {
      const session = await this.getSession(uploadId);
      if (!session) return;

      session.status = 'processing';
      await this.saveSession(session);

      // Combine chunks into final file
      const uploadDir = path.join(process.cwd(), 'uploads', uploadId);
      const finalPath = path.join(uploadDir, session.filename);
      
      const writeStream = fs.createWriteStream(finalPath);
      
      for (let i = 0; i < session.totalChunks; i++) {
        const chunkPath = path.join(uploadDir, `chunk_${i}`);
        const chunkData = await fsPromises.readFile(chunkPath);
        writeStream.write(chunkData);
      }
      
      writeStream.end();
      
      // Clean up chunks
      for (let i = 0; i < session.totalChunks; i++) {
        const chunkPath = path.join(uploadDir, `chunk_${i}`);
        await fsPromises.unlink(chunkPath).catch(() => {}); // Ignore errors if file doesn't exist
      }

      session.status = 'completed';
      await this.saveSession(session);

      // Update progress
      const progress = this.uploadProgress.get(uploadId);
      if (progress) {
        progress.status = 'completed';
        progress.progress = 100;
      }

      console.log(`Upload completed: ${uploadId}`);
    } catch (error) {
      console.error('Error finalizing upload:', error);
      
      const session = await this.getSession(uploadId);
      if (session) {
        session.status = 'failed';
        await this.saveSession(session);
      }
    }
  }

  private getMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.mp4': 'video/mp4',
      '.mov': 'video/quicktime',
      '.avi': 'video/x-msvideo',
      '.mkv': 'video/x-matroska',
      '.webm': 'video/webm',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.m4a': 'audio/mp4',
      '.aac': 'audio/aac',
      '.flac': 'audio/flac',
      '.txt': 'text/plain',
      '.rtf': 'application/rtf',
      '.md': 'text/markdown',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    if (this.redis) {
      this.redis.disconnect();
    }
  }
}

export const enhancedUploadService = new EnhancedUploadService(); 