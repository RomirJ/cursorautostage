import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { v4 as uuidv4 } from 'uuid';
import { storage } from './storage';
import { storageService } from './supabaseStorage';

interface PreviewOptions {
  duration?: number; // Preview duration in seconds (default: 10)
  quality?: 'low' | 'medium' | 'high'; // Preview quality
  format?: 'mp4' | 'webm'; // Output format
  includeAudio?: boolean; // Whether to include audio in preview
  thumbnail?: boolean; // Generate thumbnail
}

interface PreviewResult {
  previewId: string;
  previewUrl: string;
  thumbnailUrl?: string;
  duration: number;
  fileSize: number;
  format: string;
  metadata: {
    width: number;
    height: number;
    fps: number;
    bitrate: number;
  };
}

export class PreviewPlayer {
  private readonly PREVIEW_DIR = path.join(process.cwd(), 'previews');
  private readonly THUMBNAIL_DIR = path.join(process.cwd(), 'thumbnails');
  private readonly TEMP_DIR = path.join(process.cwd(), 'temp');

  constructor() {
    this.ensureDirectories();
  }

  private ensureDirectories() {
    if (!fs.existsSync(this.PREVIEW_DIR)) {
      fs.mkdirSync(this.PREVIEW_DIR, { recursive: true });
    }
    if (!fs.existsSync(this.THUMBNAIL_DIR)) {
      fs.mkdirSync(this.THUMBNAIL_DIR, { recursive: true });
    }
    if (!fs.existsSync(this.TEMP_DIR)) {
      fs.mkdirSync(this.TEMP_DIR, { recursive: true });
    }
  }

  /**
   * Generate instant preview for uploaded media
   */
  async generatePreview(
    uploadId: string, 
    options: PreviewOptions = {}
  ): Promise<PreviewResult> {
    try {
      // Get upload record from database
      const upload = await storage.getUpload(uploadId);
      if (!upload) {
        throw new Error('Upload not found');
      }

      // Download file from Supabase Storage to temporary location
      const tempDir = path.join(this.TEMP_DIR, uploadId);
      await fs.mkdir(tempDir, { recursive: true });
      
      const tempFilePath = path.join(tempDir, upload.filename);
      
      console.log(`Downloading file from Supabase Storage: ${upload.filePath}`);
      const fileBuffer = await storageService.downloadFile(upload.filePath);
      await fs.writeFile(tempFilePath, fileBuffer);
      
      console.log(`File downloaded to temp location: ${tempFilePath}`);

      const {
        duration = 10,
        quality = 'medium',
        format = 'mp4',
        includeAudio = true,
        thumbnail = true
      } = options;

      const previewId = uuidv4();
      const previewPath = path.join(this.PREVIEW_DIR, `${previewId}.${format}`);
      const thumbnailPath = thumbnail ? path.join(this.THUMBNAIL_DIR, `${previewId}.jpg`) : null;

      // Get media info first
      const mediaInfo = await this.getMediaInfo(tempFilePath);
      
      // Calculate preview start time (start from 10% into the video for better content)
      const startTime = Math.max(0, (mediaInfo.duration * 0.1));
      const previewDuration = Math.min(duration, mediaInfo.duration - startTime);

      // Generate preview
      await this.createPreview(
        tempFilePath,
        previewPath,
        startTime,
        previewDuration,
        quality,
        format,
        includeAudio
      );

      // Generate thumbnail if requested
      let thumbnailUrl: string | undefined;
      if (thumbnail && thumbnailPath) {
        await this.generateThumbnail(tempFilePath, thumbnailPath, startTime);
        thumbnailUrl = `/api/preview/thumbnail/${previewId}`;
      }

      // Clean up temporary file
      try {
        await fs.unlink(tempFilePath);
        await fs.rmdir(tempDir);
        console.log(`Cleaned up temp files for ${uploadId}`);
      } catch (cleanupError) {
        console.error('Error cleaning up temp files:', cleanupError);
      }

      // Get preview file info
      const previewStats = fs.statSync(previewPath);
      const previewInfo = await this.getMediaInfo(previewPath);

      const result: PreviewResult = {
        previewId,
        previewUrl: `/api/preview/stream/${previewId}`,
        thumbnailUrl,
        duration: previewDuration,
        fileSize: previewStats.size,
        format,
        metadata: {
          width: previewInfo.width,
          height: previewInfo.height,
          fps: previewInfo.fps,
          bitrate: previewInfo.bitrate
        }
      };

      // Store preview metadata
      await this.storePreviewMetadata(uploadId, result);

      return result;
    } catch (error) {
      console.error('Error generating preview:', error);
      throw error;
    }
  }

  /**
   * Create video/audio preview using FFmpeg
   */
  private async createPreview(
    inputPath: string,
    outputPath: string,
    startTime: number,
    duration: number,
    quality: string,
    format: string,
    includeAudio: boolean
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const command = ffmpeg(inputPath)
        .inputOptions([`-ss ${startTime}`])
        .duration(duration);

      // Set quality based on option
      switch (quality) {
        case 'low':
          command.videoCodec('libx264').videoBitrate('500k');
          break;
        case 'medium':
          command.videoCodec('libx264').videoBitrate('1000k');
          break;
        case 'high':
          command.videoCodec('libx264').videoBitrate('2000k');
          break;
      }

      // Handle audio
      if (includeAudio) {
        command.audioCodec('aac').audioBitrate('128k');
      } else {
        command.noAudio();
      }

      // Set output format and options
      if (format === 'webm') {
        command.videoCodec('libvpx-vp9');
      }

      command
        .outputOptions([
          '-movflags +faststart', // Optimize for streaming
          '-preset fast', // Faster encoding
          '-crf 23' // Good quality/size balance
        ])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });
  }

  /**
   * Generate thumbnail from video
   */
  private async generateThumbnail(
    inputPath: string,
    outputPath: string,
    time: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .inputOptions([`-ss ${time}`])
        .outputOptions([
          '-vframes 1',
          '-q:v 2' // High quality thumbnail
        ])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });
  }

  /**
   * Get media information using FFmpeg
   */
  private async getMediaInfo(filePath: string): Promise<{
    duration: number;
    width: number;
    height: number;
    fps: number;
    bitrate: number;
    format: string;
  }> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          reject(err);
          return;
        }

        const videoStream = metadata.streams.find((stream: any) => stream.codec_type === 'video');
        const audioStream = metadata.streams.find((stream: any) => stream.codec_type === 'audio');

        resolve({
          duration: metadata.format.duration || 0,
          width: videoStream?.width || 0,
          height: videoStream?.height || 0,
          fps: videoStream?.r_frame_rate ? this.parseFrameRate(videoStream.r_frame_rate) : 0,
          bitrate: metadata.format.bit_rate ? parseInt(metadata.format.bit_rate) : 0,
          format: metadata.format.format_name || 'unknown'
        });
      });
    });
  }

  /**
   * Parse frame rate string (e.g., "30/1" -> 30)
   */
  private parseFrameRate(frameRate: string): number {
    const parts = frameRate.split('/');
    if (parts.length === 2) {
      return parseInt(parts[0]) / parseInt(parts[1]);
    }
    return 0;
  }

  /**
   * Store preview metadata in database
   */
  private async storePreviewMetadata(uploadId: string, preview: PreviewResult): Promise<void> {
    try {
      // Store in database (you'll need to create this table)
      const previewData = {
        id: preview.previewId,
        uploadId,
        previewUrl: preview.previewUrl,
        thumbnailUrl: preview.thumbnailUrl,
        duration: preview.duration,
        fileSize: preview.fileSize,
        format: preview.format,
        metadata: preview.metadata,
        createdAt: new Date()
      };

      // For now, just log it
      console.log('Preview metadata stored:', previewData);
      
      // TODO: Add to database schema and storage
      // await storage.createPreview(previewData);
    } catch (error) {
      console.error('Error storing preview metadata:', error);
    }
  }

  /**
   * Get preview by ID
   */
  async getPreview(previewId: string): Promise<PreviewResult | null> {
    try {
      const previewPath = path.join(this.PREVIEW_DIR, `${previewId}.mp4`);
      const webmPath = path.join(this.PREVIEW_DIR, `${previewId}.webm`);

      let format = 'mp4';
      let filePath = previewPath;

      if (!fs.existsSync(previewPath) && fs.existsSync(webmPath)) {
        format = 'webm';
        filePath = webmPath;
      }

      if (!fs.existsSync(filePath)) {
        return null;
      }

      const stats = fs.statSync(filePath);
      const info = await this.getMediaInfo(filePath);

      return {
        previewId,
        previewUrl: `/api/preview/stream/${previewId}`,
        thumbnailUrl: fs.existsSync(path.join(this.THUMBNAIL_DIR, `${previewId}.jpg`)) 
          ? `/api/preview/thumbnail/${previewId}` 
          : undefined,
        duration: info.duration,
        fileSize: stats.size,
        format,
        metadata: {
          width: info.width,
          height: info.height,
          fps: info.fps,
          bitrate: info.bitrate
        }
      };
    } catch (error) {
      console.error('Error getting preview:', error);
      return null;
    }
  }

  /**
   * Delete preview files
   */
  async deletePreview(previewId: string): Promise<void> {
    try {
      const files = [
        path.join(this.PREVIEW_DIR, `${previewId}.mp4`),
        path.join(this.PREVIEW_DIR, `${previewId}.webm`),
        path.join(this.THUMBNAIL_DIR, `${previewId}.jpg`)
      ];

      for (const file of files) {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      }

      console.log(`Preview ${previewId} deleted`);
    } catch (error) {
      console.error('Error deleting preview:', error);
    }
  }
}

export const previewPlayer = new PreviewPlayer(); 