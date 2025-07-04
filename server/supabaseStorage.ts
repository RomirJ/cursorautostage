import { createClient } from '@supabase/supabase-js';
import { Readable } from 'stream';

// Initialize Supabase client for storage
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables for storage');
}

export const supabaseStorage = createClient(supabaseUrl, supabaseServiceKey);

export interface StorageFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  url: string;
  path: string;
  uploadedAt: Date;
}

export interface UploadOptions {
  bucket?: string;
  path?: string;
  contentType?: string;
  upsert?: boolean;
}

export class SupabaseStorageService {
  private bucket: string;

  constructor(bucket: string = 'uploads') {
    this.bucket = bucket;
  }

  /**
   * Upload a file to Supabase Storage
   */
  async uploadFile(
    file: Buffer | Readable | string,
    fileName: string,
    options: UploadOptions = {}
  ): Promise<StorageFile> {
    try {
      const {
        bucket = this.bucket,
        path = '',
        contentType = 'application/octet-stream',
        upsert = false
      } = options;

      const filePath = path ? `${path}/${fileName}` : fileName;

      // Upload file to Supabase Storage
      const { data, error } = await supabaseStorage.storage
        .from(bucket)
        .upload(filePath, file, {
          contentType,
          upsert
        });

      if (error) {
        throw new Error(`Upload failed: ${error.message}`);
      }

      // Get public URL
      const { data: urlData } = supabaseStorage.storage
        .from(bucket)
        .getPublicUrl(filePath);

      return {
        id: data.path,
        name: fileName,
        size: 0, // Supabase doesn't return size in upload response
        mimeType: contentType,
        url: urlData.publicUrl,
        path: filePath,
        uploadedAt: new Date()
      };
    } catch (error) {
      console.error('Supabase storage upload error:', error);
      throw error;
    }
  }

  /**
   * Download a file from Supabase Storage
   */
  async downloadFile(filePath: string, bucket: string = this.bucket): Promise<Buffer> {
    try {
      const { data, error } = await supabaseStorage.storage
        .from(bucket)
        .download(filePath);

      if (error) {
        throw new Error(`Download failed: ${error.message}`);
      }

      return Buffer.from(await data.arrayBuffer());
    } catch (error) {
      console.error('Supabase storage download error:', error);
      throw error;
    }
  }

  /**
   * Get public URL for a file
   */
  getPublicUrl(filePath: string, bucket: string = this.bucket): string {
    const { data } = supabaseStorage.storage
      .from(bucket)
      .getPublicUrl(filePath);

    return data.publicUrl;
  }

  /**
   * Delete a file from Supabase Storage
   */
  async deleteFile(filePath: string, bucket: string = this.bucket): Promise<void> {
    try {
      const { error } = await supabaseStorage.storage
        .from(bucket)
        .remove([filePath]);

      if (error) {
        throw new Error(`Delete failed: ${error.message}`);
      }
    } catch (error) {
      console.error('Supabase storage delete error:', error);
      throw error;
    }
  }

  /**
   * List files in a bucket
   */
  async listFiles(path: string = '', bucket: string = this.bucket): Promise<StorageFile[]> {
    try {
      const { data, error } = await supabaseStorage.storage
        .from(bucket)
        .list(path);

      if (error) {
        throw new Error(`List failed: ${error.message}`);
      }

      return data.map(file => ({
        id: file.id,
        name: file.name,
        size: file.metadata?.size || 0,
        mimeType: file.metadata?.mimetype || 'application/octet-stream',
        url: this.getPublicUrl(`${path}/${file.name}`, bucket),
        path: `${path}/${file.name}`,
        uploadedAt: new Date(file.updated_at)
      }));
    } catch (error) {
      console.error('Supabase storage list error:', error);
      throw error;
    }
  }

  /**
   * Move a file within the storage
   */
  async moveFile(
    fromPath: string,
    toPath: string,
    bucket: string = this.bucket
  ): Promise<void> {
    try {
      // Download the file
      const fileBuffer = await this.downloadFile(fromPath, bucket);
      
      // Upload to new location
      await this.uploadFile(fileBuffer, toPath.split('/').pop()!, {
        bucket,
        path: toPath.split('/').slice(0, -1).join('/'),
        upsert: true
      });
      
      // Delete from old location
      await this.deleteFile(fromPath, bucket);
    } catch (error) {
      console.error('Supabase storage move error:', error);
      throw error;
    }
  }

  /**
   * Copy a file within the storage
   */
  async copyFile(
    fromPath: string,
    toPath: string,
    bucket: string = this.bucket
  ): Promise<void> {
    try {
      // Download the file
      const fileBuffer = await this.downloadFile(fromPath, bucket);
      
      // Upload to new location
      await this.uploadFile(fileBuffer, toPath.split('/').pop()!, {
        bucket,
        path: toPath.split('/').slice(0, -1).join('/'),
        upsert: true
      });
    } catch (error) {
      console.error('Supabase storage copy error:', error);
      throw error;
    }
  }

  /**
   * Check if a file exists
   */
  async fileExists(filePath: string, bucket: string = this.bucket): Promise<boolean> {
    try {
      const { data, error } = await supabaseStorage.storage
        .from(bucket)
        .list(filePath.split('/').slice(0, -1).join('/'));

      if (error) {
        return false;
      }

      const fileName = filePath.split('/').pop();
      return data.some(file => file.name === fileName);
    } catch (error) {
      return false;
    }
  }

  /**
   * Get file metadata
   */
  async getFileMetadata(filePath: string, bucket: string = this.bucket): Promise<any> {
    try {
      const { data, error } = await supabaseStorage.storage
        .from(bucket)
        .list(filePath.split('/').slice(0, -1).join('/'));

      if (error) {
        throw new Error(`Get metadata failed: ${error.message}`);
      }

      const fileName = filePath.split('/').pop();
      const file = data.find(f => f.name === fileName);
      
      return file?.metadata || null;
    } catch (error) {
      console.error('Supabase storage get metadata error:', error);
      throw error;
    }
  }
}

// Export default instance
export const storageService = new SupabaseStorageService(); 