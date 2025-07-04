import { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { storage } from './storage';
import { storageService } from './supabaseStorage';
import { previewPlayer } from './previewPlayer';

interface ChunkInfo {
  uploadId: string;
  filename: string;
  totalChunks: number;
  totalSize: number;
  uploadedChunks: Set<number>;
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
const ALLOWED_FORMATS = {
  video: ['.mp4', '.mov', '.avi', '.mkv', '.webm'],
  audio: ['.mp3', '.wav', '.m4a', '.aac', '.flac'],
  text: ['.txt', '.rtf', '.md', '.docx']
};

class UploadService {
  private activeUploads: Map<string, ChunkInfo> = new Map();
  private uploadProgress: Map<string, UploadProgress> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up stale uploads every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleUploads();
    }, 5 * 60 * 1000);
  }

  private async cleanupStaleUploads() {
    const now = new Date();
    const staleCutoff = new Date(now.getTime() - UPLOAD_TIMEOUT);

    for (const [uploadId, chunkInfo] of this.activeUploads) {
      if (chunkInfo.lastActivity < staleCutoff) {
        await this.cancelUpload(uploadId);
      }
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

  async initializeUpload(req: Request, res: Response) {
    try {
      const { filename, totalSize, totalChunks } = req.body;

      if (!filename || !totalSize || !totalChunks) {
        return res.status(400).json({ 
          error: 'Missing required fields: filename, totalSize, totalChunks' 
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
      const chunkInfo: ChunkInfo = {
        uploadId,
        filename,
        totalChunks: parseInt(totalChunks),
        totalSize: parseInt(totalSize),
        uploadedChunks: new Set(),
        createdAt: new Date(),
        lastActivity: new Date()
      };

      this.activeUploads.set(uploadId, chunkInfo);
      
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

      // Create temporary local directory for chunks (will be cleaned up after upload)
      const uploadDir = path.join(process.cwd(), 'uploads', uploadId);
      await fs.mkdir(uploadDir, { recursive: true });

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

      const chunkInfo = this.activeUploads.get(uploadId);
      if (!chunkInfo) {
        return res.status(404).json({ error: 'Upload session not found or expired' });
      }

      // Update last activity
      chunkInfo.lastActivity = new Date();

      // Save chunk to temporary local storage
      const uploadDir = path.join(process.cwd(), 'uploads', uploadId);
      const chunkPath = path.join(uploadDir, `chunk_${chunkNumber}`);
      await fs.writeFile(chunkPath, file.buffer);

      // Mark chunk as uploaded
      chunkInfo.uploadedChunks.add(chunkNumber);

      // Update progress
      const progress = this.uploadProgress.get(uploadId)!;
      progress.bytesUploaded += file.buffer.length;
      progress.progress = (progress.bytesUploaded / progress.totalBytes) * 100;
      
      // Calculate ETA
      const elapsed = Date.now() - progress.startTime.getTime();
      const rate = progress.bytesUploaded / elapsed; // bytes per ms
      const remaining = progress.totalBytes - progress.bytesUploaded;
      progress.eta = rate > 0 ? Math.round(remaining / rate) : 0;

      // Check if upload is complete
      if (chunkInfo.uploadedChunks.size === chunkInfo.totalChunks) {
        await this.finalizeUpload(uploadId);
      }

      res.json({
        success: true,
        uploadedChunks: chunkInfo.uploadedChunks.size,
        totalChunks: chunkInfo.totalChunks,
        progress: progress.progress,
        eta: progress.eta
      });
    } catch (error) {
      console.error('Error uploading chunk:', error);
      res.status(500).json({ error: 'Failed to upload chunk' });
    }
  }

  private async finalizeUpload(uploadId: string) {
    try {
      const chunkInfo = this.activeUploads.get(uploadId);
      if (!chunkInfo) return;

      const progress = this.uploadProgress.get(uploadId);
      if (!progress) return;

      progress.status = 'processing';

      // Combine chunks into final file
      const uploadDir = path.join(process.cwd(), 'uploads', uploadId);
      const finalFilePath = path.join(uploadDir, chunkInfo.filename);
      
      const writeStream = fs.createWriteStream(finalFilePath);
      
      for (let i = 0; i < chunkInfo.totalChunks; i++) {
        const chunkPath = path.join(uploadDir, `chunk_${i}`);
        const chunkData = await fs.readFile(chunkPath);
        writeStream.write(chunkData);
      }
      
      writeStream.end();

      // Wait for file to be written
      await new Promise((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

      // Upload to Supabase Storage
      const fileBuffer = await fs.readFile(finalFilePath);
      const storageFile = await storageService.uploadFile(
        fileBuffer,
        chunkInfo.filename,
        {
          path: uploadId,
          contentType: this.getMimeType(chunkInfo.filename),
          upsert: true
        }
      );

      // Create upload record in database
      const uploadRecord = await storage.createUpload({
        id: uploadId,
        userId: 'temp-user-id', // Will be set from auth context
        filename: chunkInfo.filename,
        originalName: chunkInfo.filename,
        filePath: storageFile.path,
        fileSize: chunkInfo.totalSize,
        mimeType: this.getMimeType(chunkInfo.filename),
        status: 'uploaded'
      });

      // Update progress
      progress.status = 'completed';

      // Generate preview for supported media types
      try {
        const fileType = this.validateFileType(chunkInfo.filename);
        if (fileType.isValid && (fileType.type === 'video' || fileType.type === 'audio')) {
          console.log(`Generating preview for ${uploadId}...`);
          
          // Generate preview from Supabase Storage
          const preview = await previewPlayer.generatePreview(uploadId, {
            duration: 10,
            quality: 'medium',
            format: 'mp4',
            includeAudio: true,
            thumbnail: true
          });
          
          console.log(`Preview generated: ${preview.previewId}`);
        }
      } catch (previewError) {
        console.error('Error generating preview:', previewError);
        // Don't fail the upload if preview generation fails
      }

      // Clean up temporary files
      await this.cleanupUploadFiles(uploadId);

      // Remove from active uploads
      this.activeUploads.delete(uploadId);

      console.log(`Upload completed: ${uploadId} -> ${storageFile.url}`);
    } catch (error) {
      console.error('Error finalizing upload:', error);
      
      const progress = this.uploadProgress.get(uploadId);
      if (progress) {
        progress.status = 'error';
        progress.error = error.message;
      }
    }
  }

  private async cleanupUploadFiles(uploadId: string) {
    try {
      const uploadDir = path.join(process.cwd(), 'uploads', uploadId);
      await fs.rm(uploadDir, { recursive: true, force: true });
    } catch (error) {
      console.error('Error cleaning up upload files:', error);
    }
  }

  private getMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: { [key: string]: string } = {
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

  async getUploadProgress(req: Request, res: Response) {
    try {
      const { uploadId } = req.params;
      const progress = this.uploadProgress.get(uploadId);
      
      if (!progress) {
        return res.status(404).json({ error: 'Upload not found' });
      }
      
      res.json(progress);
    } catch (error) {
      console.error('Error getting upload progress:', error);
      res.status(500).json({ error: 'Failed to get upload progress' });
    }
  }

  async cancelUpload(uploadId: string) {
    try {
      // Clean up files
      await this.cleanupUploadFiles(uploadId);
      
      // Update progress
      const progress = this.uploadProgress.get(uploadId);
      if (progress) {
        progress.status = 'cancelled';
      }
      
      // Remove from active uploads
      this.activeUploads.delete(uploadId);
      
      console.log(`Upload cancelled: ${uploadId}`);
    } catch (error) {
      console.error('Error cancelling upload:', error);
    }
  }

  async handleCancelUpload(req: Request, res: Response) {
    try {
      const { uploadId } = req.params;
      await this.cancelUpload(uploadId);
      res.json({ message: 'Upload cancelled successfully' });
    } catch (error) {
      console.error('Error handling cancel upload:', error);
      res.status(500).json({ error: 'Failed to cancel upload' });
    }
  }

  async resumeUpload(req: Request, res: Response) {
    try {
      const { uploadId } = req.params;
      const chunkInfo = this.activeUploads.get(uploadId);
      
      if (!chunkInfo) {
        return res.status(404).json({ error: 'Upload session not found' });
      }
      
      const nextChunk = this.getNextChunkNumber(chunkInfo);
      
      res.json({
        uploadId,
        nextChunk,
        uploadedChunks: Array.from(chunkInfo.uploadedChunks),
        totalChunks: chunkInfo.totalChunks
      });
    } catch (error) {
      console.error('Error resuming upload:', error);
      res.status(500).json({ error: 'Failed to resume upload' });
    }
  }

  private getNextChunkNumber(chunkInfo: ChunkInfo): number {
    for (let i = 0; i < chunkInfo.totalChunks; i++) {
      if (!chunkInfo.uploadedChunks.has(i)) {
        return i;
      }
    }
    return chunkInfo.totalChunks;
  }

  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

// Configure multer for chunk uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: CHUNK_SIZE * 2 // Allow some buffer
  }
});

export const uploadService = new UploadService();
export const uploadChunkMiddleware = upload.single('chunk');