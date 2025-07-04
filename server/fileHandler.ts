import path from "path";
import fs from "fs";
import { storage } from "./storage";
import type { InsertUpload } from "@shared/schema";
import { processTranscription } from "./processors/transcription";
import { processSegmentation } from "./processors/segmentation";
import { processClipGeneration } from "./processors/clipGeneration";

export interface FileUploadResult {
  success: boolean;
  uploadId?: string;
  error?: string;
}

import { errorHandler } from './errorHandler';
import { progressTracker } from './progressTracker';

export async function processFile(uploadId: string): Promise<void> {
  let transcript: any;
  let segments: any;
  try {
    console.log(`Starting processing for upload ${uploadId}`);
    
    const upload = await storage.getUpload(uploadId);
    if (!upload) {
      throw new Error('Upload not found');
    }

    // Initialize progress tracking
    await progressTracker.initializeUpload(
      uploadId, 
      upload.userId, 
      upload.originalName, 
      upload.fileSize
    );

    // Step 1: Transcription
    await storage.updateUploadStatus(uploadId, 'transcribing');
    await progressTracker.updateStageProgress(uploadId, 'transcription', 0, 'Starting transcription...');
    console.log(`Transcribing upload ${uploadId}`);
    
    try {
      transcript = await processTranscription(upload);
      await progressTracker.completeStage(uploadId, 'transcription');
      console.log(`Transcription completed for upload ${uploadId}`);
    } catch (error) {
      const processedError = await errorHandler.processProcessingError(
        error, 
        uploadId, 
        upload.userId, 
        'transcription'
      );
      await progressTracker.failUpload(uploadId, processedError);
      throw processedError;
    }

    // Step 2: Segmentation
    await storage.updateUploadStatus(uploadId, 'segmenting');
    await progressTracker.updateStageProgress(uploadId, 'segmentation', 0, 'Analyzing content structure...');
    console.log(`Segmenting upload ${uploadId}`);
    
    try {
      segments = await processSegmentation(uploadId, transcript.text);
      await progressTracker.completeStage(uploadId, 'segmentation');
      console.log(`Segmentation completed for upload ${uploadId}, created ${segments.length} segments`);
    } catch (error) {
      const processedError = await errorHandler.processProcessingError(
        error, 
        uploadId, 
        upload.userId, 
        'segmentation'
      );
      await progressTracker.failUpload(uploadId, processedError);
      throw processedError;
    }

    // Step 3: Clip Generation
    await storage.updateUploadStatus(uploadId, 'processing');
    await progressTracker.updateStageProgress(uploadId, 'clip_generation', 0, 'Generating video clips...');
    console.log(`Processing clips for upload ${uploadId}`);
    
    try {
      await processClipGeneration(segments);
      await progressTracker.completeStage(uploadId, 'clip_generation');
      console.log(`Clip generation completed for upload ${uploadId}`);
    } catch (error) {
      const processedError = await errorHandler.processProcessingError(
        error, 
        uploadId, 
        upload.userId, 
        'clip_generation'
      );
      await progressTracker.failUpload(uploadId, processedError);
      throw processedError;
    }

    // Step 4: Social Content Generation
    await storage.updateUploadStatus(uploadId, 'generating_content');
    await progressTracker.updateStageProgress(uploadId, 'content_generation', 0, 'Creating social media content...');
    console.log(`Generating social content for upload ${uploadId}`);
    
    try {
      const { processSocialContent } = await import('./processors/socialContent');
      await processSocialContent(uploadId);
      await progressTracker.completeStage(uploadId, 'content_generation');
      console.log(`Social content generation completed for upload ${uploadId}`);
    } catch (error) {
      const processedError = await errorHandler.processProcessingError(
        error, 
        uploadId, 
        upload.userId, 
        'content_generation'
      );
      await progressTracker.failUpload(uploadId, processedError);
      throw processedError;
    }

    // Mark as completed
    await storage.updateUploadStatus(uploadId, 'completed');
    console.log(`Processing completed for upload ${uploadId}`);

  } catch (error) {
    // If it's already a processed error, re-throw it
    if (typeof error === 'object' && error !== null && 'errorInfo' in error) {
      // @ts-ignore
      console.error(`Processing failed for upload ${uploadId}:`, error.userResponse?.message);
      throw error;
    }
    // Otherwise, process it as a generic processing error
    const upload = await storage.getUpload(uploadId);
    const processedError = await errorHandler.processProcessingError(
      error, 
      uploadId, 
      upload?.userId || 'unknown', 
      'general'
    );
    await progressTracker.failUpload(uploadId, processedError);
    throw processedError;
  }
}

export function getFileExtension(mimeType: string): string {
  const mimeMap: Record<string, string> = {
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'audio/mpeg': '.mp3',
    'audio/wav': '.wav',
  };
  return mimeMap[mimeType] || '.unknown';
}

export function validateFileType(mimeType: string): boolean {
  const allowedTypes = [
    'video/mp4',
    'video/quicktime',
    'audio/mpeg',
    'audio/wav',
    'audio/mp3',
    'application/octet-stream' // For files that aren't properly detected
  ];
  return allowedTypes.includes(mimeType);
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  } else {
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
}

// Cleanup function to remove old files
export async function cleanupOldFiles(maxAgeHours: number = 24 * 7): Promise<void> {
  try {
    const uploadsDir = path.join(process.cwd(), 'uploads');
    const clipsDir = path.join(process.cwd(), 'clips');
    
    const maxAge = maxAgeHours * 60 * 60 * 1000; // Convert to milliseconds
    const now = Date.now();

    for (const dir of [uploadsDir, clipsDir]) {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        
        for (const file of files) {
          const filePath = path.join(dir, file);
          const stats = fs.statSync(filePath);
          
          if (now - stats.mtime.getTime() > maxAge) {
            fs.unlinkSync(filePath);
            console.log(`Cleaned up old file: ${filePath}`);
          }
        }
      }
    }
  } catch (error) {
    console.error('Cleanup error:', error);
  }
}

async function handleUpload(file: any, userId: string): Promise<FileUploadResult> {
  try {
    if (!validateFileType(file.mimetype)) {
      return {
        success: false,
        error: 'Invalid file type. Only MP4, MOV, MP3, and WAV files are allowed.'
      };
    }

    const uploadData = {
      userId: String(userId),
      filename: String(file.filename),
      originalName: String(file.originalname),
      filePath: String(file.path),
      fileSize: Number(file.size),
      mimeType: String(file.mimetype),
      duration: null,
    };
    const upload = await storage.createUpload(uploadData);

    // Start processing the file asynchronously
    processFile(upload.id).catch(error => {
      console.error('File processing error:', error);
      storage.updateUploadStatus(upload.id, 'failed');
    });

    return {
      success: true,
      uploadId: upload.id
    };
  } catch (error) {
    console.error('Upload handling error:', error);
    return {
      success: false,
      error: 'Upload failed'
    };
  }
}

export const fileUpload = {
  handleUpload,
  validateFileType,
  getFileExtension,
  formatFileSize,
  formatDuration,
};
