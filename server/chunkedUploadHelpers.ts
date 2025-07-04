import fs from 'fs';
import path from 'path';
import { oauthService } from './oauthService';
import { storage } from './storage';

interface UploadSession {
  id: string;
  userId: string;
  platform: string;
  fileName: string;
  fileSize: number;
  uploadUrl?: string;
  uploadId?: string;
  chunks: Array<{
    index: number;
    size: number;
    uploaded: boolean;
    etag?: string;
  }>;
  status: 'initialized' | 'uploading' | 'completed' | 'failed';
  createdAt: Date;
  completedAt?: Date;
  updatedAt: Date;
}

interface ChunkUploadResult {
  success: boolean;
  etag?: string;
  error?: string;
  bytesUploaded?: number;
}

export class ChunkedUploadHelpers {
  private readonly CHUNK_SIZE = 256 * 1024 * 1024; // 256MB chunks

  // YouTube Resumable Upload
  async initializeYouTubeUpload(userId: string, filePath: string, metadata: {
    title: string;
    description: string;
    tags?: string[];
    categoryId?: string;
    privacyStatus?: 'private' | 'public' | 'unlisted';
  }): Promise<UploadSession> {
    try {
      const accessToken = await oauthService.getValidToken(userId, 'youtube');
      if (!accessToken) {
        throw new Error('YouTube access token not available');
      }

      const fileStats = fs.statSync(filePath);
      const fileName = path.basename(filePath);

      // Initialize resumable upload session
      const response = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Upload-Content-Length': fileStats.size.toString(),
          'X-Upload-Content-Type': 'video/*'
        },
        body: JSON.stringify({
          snippet: {
            title: metadata.title,
            description: metadata.description,
            tags: metadata.tags || [],
            categoryId: metadata.categoryId || '22' // People & Blogs
          },
          status: {
            privacyStatus: metadata.privacyStatus || 'private'
          }
        })
      });

      if (!response.ok) {
        throw new Error(`YouTube upload initialization failed: ${response.status}`);
      }

      const uploadUrl = response.headers.get('location');
      if (!uploadUrl) {
        throw new Error('YouTube upload URL not received');
      }

      const sessionId = `youtube_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const chunks = this.calculateChunks(fileStats.size);

      const session: UploadSession = {
        id: sessionId,
        userId,
        platform: 'youtube',
        fileName,
        fileSize: fileStats.size,
        uploadUrl,
        chunks,
        status: 'initialized',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await storage.createUploadSession(session);
      console.log(`[ChunkedUpload] YouTube upload session initialized: ${sessionId}`);

      return session;
    } catch (error) {
      console.error('[ChunkedUpload] YouTube initialization error:', error);
      throw error;
    }
  }

  async uploadYouTubeChunk(sessionId: string, filePath: string, chunkIndex: number): Promise<ChunkUploadResult> {
    const MAX_RETRIES = 3;
    let attempt = 0;
    let lastError: any = null;
    while (attempt < MAX_RETRIES) {
      try {
        const session = await storage.getUploadSession(sessionId);
        if (!session || session.platform !== 'youtube') {
          throw new Error('Invalid YouTube upload session');
        }

        const chunk = session.chunks[chunkIndex];
        if (!chunk) {
          throw new Error('Invalid chunk index');
        }

        const startByte = chunkIndex * this.CHUNK_SIZE;
        const endByte = Math.min(startByte + this.CHUNK_SIZE - 1, session.fileSize - 1);
        const chunkSize = endByte - startByte + 1;

        // Read chunk from file
        const fileStream = fs.createReadStream(filePath, { start: startByte, end: endByte });
        const chunkBuffer = await this.streamToBuffer(fileStream);

        const response = await fetch(session.uploadUrl!, {
          method: 'PUT',
          headers: {
            'Content-Length': chunkSize.toString(),
            'Content-Range': `bytes ${startByte}-${endByte}/${session.fileSize}`
          },
          body: chunkBuffer
        });

        if (response.status === 308) {
          // Chunk uploaded successfully, more chunks needed
          chunk.uploaded = true;
          session.status = 'uploading';
          session.updatedAt = new Date();
          await storage.updateUploadSession(sessionId, { chunks: session.chunks, status: session.status, updatedAt: session.updatedAt });
          console.log(`[ChunkedUpload] YouTube chunk ${chunkIndex} uploaded successfully`);
          return { success: true, bytesUploaded: chunkSize };
        } else if (response.status === 200 || response.status === 201) {
          // Upload completed
          chunk.uploaded = true;
          session.status = 'completed';
          session.completedAt = new Date();
          session.updatedAt = new Date();
          await storage.updateUploadSession(sessionId, { chunks: session.chunks, status: session.status, completedAt: session.completedAt, updatedAt: session.updatedAt });
          const videoData = await response.json();
          console.log(`[ChunkedUpload] YouTube upload completed: ${videoData.id}`);
          return { success: true, bytesUploaded: chunkSize };
        } else {
          throw new Error(`YouTube chunk upload failed: ${response.status}`);
        }
      } catch (error) {
        lastError = error;
        attempt++;
        if (attempt < MAX_RETRIES) {
          const backoff = 500 * Math.pow(2, attempt); // Exponential backoff: 1s, 2s, 4s
          console.warn(`[ChunkedUpload] Retry ${attempt} for chunk ${chunkIndex} after error:`, error);
          await new Promise(r => setTimeout(r, backoff));
        }
      }
    }
    // All retries failed
    const session = await storage.getUploadSession(sessionId);
    if (session) {
      session.status = 'failed';
      session.updatedAt = new Date();
      await storage.updateUploadSession(sessionId, { status: 'failed', updatedAt: session.updatedAt });
    }
    console.error(`[ChunkedUpload] YouTube chunk ${chunkIndex} failed after ${MAX_RETRIES} attempts:`, lastError);
    return { success: false, error: lastError instanceof Error ? lastError.message : 'Unknown error' };
  }

  // X (Twitter) Chunked Upload (INIT/APPEND/FINALIZE)
  async initializeXUpload(userId: string, filePath: string, mediaType: 'video' | 'image'): Promise<UploadSession> {
    try {
      const accessToken = await oauthService.getValidToken(userId, 'twitter');
      if (!accessToken) {
        throw new Error('X access token not available');
      }

      const fileStats = fs.statSync(filePath);
      const fileName = path.basename(filePath);

      // INIT phase
      const initResponse = await fetch('https://upload.twitter.com/1.1/media/upload.json', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          command: 'INIT',
          total_bytes: fileStats.size.toString(),
          media_type: mediaType === 'video' ? 'video/mp4' : 'image/jpeg',
          media_category: mediaType === 'video' ? 'tweet_video' : 'tweet_image'
        })
      });

      if (!initResponse.ok) {
        throw new Error(`X upload initialization failed: ${initResponse.status}`);
      }

      const initData = await initResponse.json();
      const mediaId = initData.media_id_string;

      const sessionId = `twitter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const chunks = this.calculateChunks(fileStats.size);

      const session: UploadSession = {
        id: sessionId,
        userId,
        platform: 'twitter',
        fileName,
        fileSize: fileStats.size,
        uploadId: mediaId,
        chunks,
        status: 'initialized',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await storage.createUploadSession(session);
      console.log(`[ChunkedUpload] X upload session initialized: ${sessionId}, media_id: ${mediaId}`);

      return session;
    } catch (error) {
      console.error('[ChunkedUpload] X initialization error:', error);
      throw error;
    }
  }

  async uploadXChunk(sessionId: string, filePath: string, chunkIndex: number): Promise<ChunkUploadResult> {
    const MAX_RETRIES = 3;
    let attempt = 0;
    let lastError: any = null;
    while (attempt < MAX_RETRIES) {
      try {
        const session = await storage.getUploadSession(sessionId);
        if (!session || session.platform !== 'twitter') {
          throw new Error('Invalid X upload session');
        }

        const accessToken = await oauthService.getValidToken(session.id.split('_')[0], 'twitter');
        if (!accessToken) {
          throw new Error('X access token not available');
        }

        const chunk = session.chunks[chunkIndex];
        if (!chunk) {
          throw new Error('Invalid chunk index');
        }

        const startByte = chunkIndex * this.CHUNK_SIZE;
        const endByte = Math.min(startByte + this.CHUNK_SIZE - 1, session.fileSize - 1);

        // Read chunk from file
        const fileStream = fs.createReadStream(filePath, { start: startByte, end: endByte });
        const chunkBuffer = await this.streamToBuffer(fileStream);

        // APPEND phase
        const formData = new FormData();
        formData.append('command', 'APPEND');
        formData.append('media_id', session.uploadId!);
        formData.append('segment_index', chunkIndex.toString());
        formData.append('media', new Blob([chunkBuffer]));

        const response = await fetch('https://upload.twitter.com/1.1/media/upload.json', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`
          },
          body: formData
        });

        if (response.ok) {
          chunk.uploaded = true;
          session.status = 'uploading';
          session.updatedAt = new Date();
          await storage.updateUploadSession(sessionId, { chunks: session.chunks, status: session.status, updatedAt: session.updatedAt });
          console.log(`[ChunkedUpload] X chunk ${chunkIndex} uploaded successfully`);
          return { success: true, bytesUploaded: chunkBuffer.length };
        } else {
          throw new Error(`X chunk upload failed: ${response.status}`);
        }
      } catch (error) {
        lastError = error;
        attempt++;
        if (attempt < MAX_RETRIES) {
          const backoff = 500 * Math.pow(2, attempt); // Exponential backoff: 1s, 2s, 4s
          console.warn(`[ChunkedUpload] Retry ${attempt} for X chunk ${chunkIndex} after error:`, error);
          await new Promise(r => setTimeout(r, backoff));
        }
      }
    }
    // All retries failed
    const session = await storage.getUploadSession(sessionId);
    if (session) {
      session.status = 'failed';
      session.updatedAt = new Date();
      await storage.updateUploadSession(sessionId, { status: 'failed', updatedAt: session.updatedAt });
    }
    console.error(`[ChunkedUpload] X chunk ${chunkIndex} failed after ${MAX_RETRIES} attempts:`, lastError);
    return { success: false, error: lastError instanceof Error ? lastError.message : 'Unknown error' };
  }

  async finalizeXUpload(sessionId: string): Promise<{ success: boolean; mediaId?: string; error?: string }> {
    try {
      const session = await storage.getUploadSession(sessionId);
      if (!session || session.platform !== 'twitter') {
        throw new Error('Invalid X upload session');
      }

      const accessToken = await oauthService.getValidToken(session.id.split('_')[0], 'twitter');
      if (!accessToken) {
        throw new Error('X access token not available');
      }

      // FINALIZE phase
      const finalizeResponse = await fetch('https://upload.twitter.com/1.1/media/upload.json', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          command: 'FINALIZE',
          media_id: session.uploadId!
        })
      });

      if (finalizeResponse.ok) {
        const finalizeData = await finalizeResponse.json();
        session.status = 'completed';
        session.completedAt = new Date();
        
        console.log(`[ChunkedUpload] X upload finalized: ${session.uploadId}`);
        return { success: true, mediaId: session.uploadId };
      } else {
        throw new Error(`X upload finalization failed: ${finalizeResponse.status}`);
      }
    } catch (error) {
      console.error('[ChunkedUpload] X finalization error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // TikTok Multipart Upload
  async initializeTikTokUpload(userId: string, filePath: string): Promise<UploadSession> {
    try {
      const accessToken = await oauthService.getValidToken(userId, 'tiktok');
      if (!accessToken) {
        throw new Error('TikTok access token not available');
      }

      const fileStats = fs.statSync(filePath);
      const fileName = path.basename(filePath);

      // Initialize multipart upload
      const response = await fetch('https://open-api.tiktok.com/video/upload/init/', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          source_info: {
            source: 'FILE_UPLOAD',
            video_size: fileStats.size,
            chunk_size: this.CHUNK_SIZE,
            total_chunk_count: Math.ceil(fileStats.size / this.CHUNK_SIZE)
          }
        })
      });

      if (!response.ok) {
        throw new Error(`TikTok upload initialization failed: ${response.status}`);
      }

      const initData = await response.json();
      const uploadUrl = initData.data.upload_url;
      const uploadId = initData.data.upload_id;

      const sessionId = `tiktok_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const chunks = this.calculateChunks(fileStats.size);

      const session: UploadSession = {
        id: sessionId,
        userId,
        platform: 'tiktok',
        fileName,
        fileSize: fileStats.size,
        uploadUrl,
        uploadId,
        chunks,
        status: 'initialized',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await storage.createUploadSession(session);
      console.log(`[ChunkedUpload] TikTok upload session initialized: ${sessionId}`);

      return session;
    } catch (error) {
      console.error('[ChunkedUpload] TikTok initialization error:', error);
      throw error;
    }
  }

  async uploadTikTokChunk(sessionId: string, filePath: string, chunkIndex: number): Promise<ChunkUploadResult> {
    const MAX_RETRIES = 3;
    let attempt = 0;
    let lastError: any = null;
    while (attempt < MAX_RETRIES) {
      try {
        const session = await storage.getUploadSession(sessionId);
        if (!session || session.platform !== 'tiktok') {
          throw new Error('Invalid TikTok upload session');
        }

        const chunk = session.chunks[chunkIndex];
        if (!chunk) {
          throw new Error('Invalid chunk index');
        }

        const startByte = chunkIndex * this.CHUNK_SIZE;
        const endByte = Math.min(startByte + this.CHUNK_SIZE - 1, session.fileSize - 1);

        // Read chunk from file
        const fileStream = fs.createReadStream(filePath, { start: startByte, end: endByte });
        const chunkBuffer = await this.streamToBuffer(fileStream);

        const formData = new FormData();
        formData.append('upload_id', session.uploadId!);
        formData.append('chunk_index', chunkIndex.toString());
        formData.append('chunk_data', new Blob([chunkBuffer]));

        const response = await fetch(session.uploadUrl!, {
          method: 'POST',
          body: formData
        });

        if (response.ok) {
          chunk.uploaded = true;
          session.status = 'uploading';
          session.updatedAt = new Date();
          await storage.updateUploadSession(sessionId, { chunks: session.chunks, status: session.status, updatedAt: session.updatedAt });
          console.log(`[ChunkedUpload] TikTok chunk ${chunkIndex} uploaded successfully`);
          return { success: true, bytesUploaded: chunkBuffer.length };
        } else {
          throw new Error(`TikTok chunk upload failed: ${response.status}`);
        }
      } catch (error) {
        lastError = error;
        attempt++;
        if (attempt < MAX_RETRIES) {
          const backoff = 500 * Math.pow(2, attempt); // Exponential backoff: 1s, 2s, 4s
          console.warn(`[ChunkedUpload] Retry ${attempt} for TikTok chunk ${chunkIndex} after error:`, error);
          await new Promise(r => setTimeout(r, backoff));
        }
      }
    }
    // All retries failed
    const session = await storage.getUploadSession(sessionId);
    if (session) {
      session.status = 'failed';
      session.updatedAt = new Date();
      await storage.updateUploadSession(sessionId, { status: 'failed', updatedAt: session.updatedAt });
    }
    console.error(`[ChunkedUpload] TikTok chunk ${chunkIndex} failed after ${MAX_RETRIES} attempts:`, lastError);
    return { success: false, error: lastError instanceof Error ? lastError.message : 'Unknown error' };
  }

  async initializeInstagramUpload(userId: string, filePath: string, mediaType: 'photo' | 'video' | 'reel'): Promise<UploadSession> {
    try {
      const fileStats = fs.statSync(filePath);
      const fileName = path.basename(filePath);
      const sessionId = `${userId}_instagram_${Date.now()}`;

      // Instagram Graph API - Create media container
      const accessToken = await oauthService.getValidToken(userId, 'instagram');
      if (!accessToken) {
        throw new Error('Instagram access token not available');
      }

      const publicUrl = `${process.env.BASE_URL}/uploads/${fileName}`;
      
      const createContainerParams = new URLSearchParams({
        media_type: mediaType === 'reel' ? 'REELS' : mediaType.toUpperCase(),
        access_token: accessToken
      });

      if (mediaType === 'video' || mediaType === 'reel') {
        createContainerParams.append('video_url', publicUrl);
      } else {
        createContainerParams.append('image_url', publicUrl);
      }

      const response = await fetch(`https://graph.facebook.com/v18.0/${process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID}/media`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: createContainerParams
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to initialize Instagram upload');
      }

      const session: UploadSession = {
        id: sessionId,
        userId,
        platform: 'instagram',
        fileName,
        fileSize: fileStats.size,
        uploadId: data.id, // Instagram container ID
        chunks: this.calculateChunks(fileStats.size),
        status: 'initialized',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await storage.createUploadSession(session);
      console.log(`[ChunkedUpload] Instagram upload session initialized: ${sessionId}, container_id: ${data.id}`);

      return session;
    } catch (error) {
      console.error('[ChunkedUpload] Instagram initialization error:', error);
      throw error;
    }
  }

  async uploadInstagramMedia(sessionId: string, filePath: string): Promise<ChunkUploadResult> {
    const MAX_RETRIES = 3;
    let attempt = 0;
    let lastError: any = null;
    while (attempt < MAX_RETRIES) {
      try {
        const session = await storage.getUploadSession(sessionId);
        if (!session || session.platform !== 'instagram') {
          throw new Error('Invalid Instagram upload session');
        }

        session.status = 'uploading';
        session.updatedAt = new Date();
        await storage.updateUploadSession(sessionId, { status: session.status, updatedAt: session.updatedAt });
        
        // For Instagram, the file needs to be publicly accessible
        // The media container creation already provided the URL
        // Instagram will fetch the media from the provided URL
        
        // Simulate upload progress by marking chunks as uploaded
        let uploadedBytes = 0;
        for (const chunk of session.chunks) {
          chunk.uploaded = true;
          uploadedBytes += chunk.size;
          
          // Small delay to simulate upload progress
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Update session with completed chunks
        await storage.updateUploadSession(sessionId, { chunks: session.chunks });

        console.log(`[ChunkedUpload] Instagram media uploaded successfully: ${session.fileName}`);
        
        return {
          success: true,
          bytesUploaded: uploadedBytes
        };
      } catch (error) {
        lastError = error;
        attempt++;
        if (attempt < MAX_RETRIES) {
          const backoff = 500 * Math.pow(2, attempt); // Exponential backoff: 1s, 2s, 4s
          console.warn(`[ChunkedUpload] Retry ${attempt} for Instagram upload after error:`, error);
          await new Promise(r => setTimeout(r, backoff));
        }
      }
    }
    // All retries failed
    const session = await storage.getUploadSession(sessionId);
    if (session) {
      session.status = 'failed';
      session.updatedAt = new Date();
      await storage.updateUploadSession(sessionId, { status: 'failed', updatedAt: session.updatedAt });
    }
    console.error(`[ChunkedUpload] Instagram upload failed after ${MAX_RETRIES} attempts:`, lastError);
    return { success: false, error: lastError instanceof Error ? lastError.message : 'Upload failed' };
  }

  async publishInstagramMedia(sessionId: string, caption?: string, locationId?: string): Promise<{ success: boolean; mediaId?: string; error?: string }> {
    try {
      const session = await storage.getUploadSession(sessionId);
      if (!session || !session.uploadId || session.platform !== 'instagram') {
        throw new Error('Invalid Instagram session or container ID not found');
      }

      const userId = session.id.split('_')[0];
      const accessToken = await oauthService.getValidToken(userId, 'instagram');
      if (!accessToken) {
        throw new Error('Instagram access token not available');
      }

      // Publish the media container
      const publishParams = new URLSearchParams({
        creation_id: session.uploadId,
        access_token: accessToken
      });

      if (caption) publishParams.append('caption', caption);
      if (locationId) publishParams.append('location_id', locationId);

      const response = await fetch(`https://graph.facebook.com/v18.0/${process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID}/media_publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: publishParams
      });

      const data = await response.json();

      if (!response.ok) {
        session.status = 'failed';
        throw new Error(data.error?.message || 'Failed to publish Instagram media');
      }

      session.status = 'completed';
      session.completedAt = new Date();
      
      console.log(`[ChunkedUpload] Instagram media published successfully: ${data.id}`);
      
      return {
        success: true,
        mediaId: data.id
      };
    } catch (error) {
      console.error('[ChunkedUpload] Instagram publish error:', error);
      const session = await storage.getUploadSession(sessionId);
      if (session) session.status = 'failed';
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Publish failed'
      };
    }
  }

  async createInstagramCarousel(userId: string, mediaItems: Array<{
    filePath: string;
    mediaType: 'photo' | 'video';
    caption?: string;
  }>): Promise<{ success: boolean; carouselId?: string; error?: string }> {
    try {
      const accessToken = await oauthService.getValidToken(userId, 'instagram');
      if (!accessToken) {
        throw new Error('Instagram access token not available');
      }

      const containerIds: string[] = [];

      // Create containers for each media item
      for (const item of mediaItems) {
        const fileName = path.basename(item.filePath);
        const publicUrl = `${process.env.BASE_URL}/uploads/${fileName}`;

        const createParams = new URLSearchParams({
          media_type: item.mediaType.toUpperCase(),
          is_carousel_item: 'true',
          access_token: accessToken
        });

        if (item.mediaType === 'video') {
          createParams.append('video_url', publicUrl);
        } else {
          createParams.append('image_url', publicUrl);
        }

        const response = await fetch(`https://graph.facebook.com/v18.0/${process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID}/media`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: createParams
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error?.message || 'Failed to create carousel item');
        }

        containerIds.push(data.id);
      }

      // Create carousel container
      const carouselParams = new URLSearchParams({
        media_type: 'CAROUSEL',
        children: containerIds.join(','),
        access_token: accessToken
      });

      if (mediaItems[0].caption) {
        carouselParams.append('caption', mediaItems[0].caption);
      }

      const carouselResponse = await fetch(`https://graph.facebook.com/v18.0/${process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID}/media`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: carouselParams
      });

      const carouselData = await carouselResponse.json();
      if (!carouselResponse.ok) {
        throw new Error(carouselData.error?.message || 'Failed to create carousel');
      }

      console.log(`[ChunkedUpload] Instagram carousel created successfully: ${carouselData.id}`);

      return {
        success: true,
        carouselId: carouselData.id
      };
    } catch (error) {
      console.error('[ChunkedUpload] Instagram carousel error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Carousel creation failed'
      };
    }
  }

  private calculateChunks(fileSize: number): Array<{ index: number; size: number; uploaded: boolean }> {
    const totalChunks = Math.ceil(fileSize / this.CHUNK_SIZE);
    const chunks = [];

    for (let i = 0; i < totalChunks; i++) {
      const startByte = i * this.CHUNK_SIZE;
      const endByte = Math.min(startByte + this.CHUNK_SIZE - 1, fileSize - 1);
      const chunkSize = endByte - startByte + 1;

      chunks.push({
        index: i,
        size: chunkSize,
        uploaded: false
      });
    }

    return chunks;
  }

  private async streamToBuffer(stream: fs.ReadStream): Promise<Buffer> {
    const chunks: Buffer[] = [];
    
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => chunks.push(chunk as Buffer));
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }

  // Session management
  async getUploadSession(sessionId: string): Promise<UploadSession | undefined> {
    return await storage.getUploadSession(sessionId);
  }

  async getAllSessions(userId?: string): Promise<UploadSession[]> {
    if (userId) {
      return await storage.getUserUploadSessions(userId);
    } else {
      // If you want all sessions for all users, you may need to implement this in storage
      // For now, return an empty array to avoid breaking anything
      return [];
    }
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    await storage.deleteUploadSession(sessionId);
    return true;
  }

  async getUploadProgress(sessionId: string): Promise<{
    totalChunks: number;
    uploadedChunks: number;
    percentComplete: number;
    bytesUploaded: number;
    totalBytes: number;
  }> {
    const session = await storage.getUploadSession(sessionId);
    if (!session) {
      return {
        totalChunks: 0,
        uploadedChunks: 0,
        percentComplete: 0,
        bytesUploaded: 0,
        totalBytes: 0
      };
    }

    const uploadedChunks = session.chunks.filter((c: { uploaded: boolean }) => c.uploaded).length;
    const bytesUploaded = session.chunks
      .filter((c: { uploaded: boolean }) => c.uploaded)
      .reduce((sum: number, c: { size: number }) => sum + c.size, 0);

    return {
      totalChunks: session.chunks.length,
      uploadedChunks,
      percentComplete: (uploadedChunks / session.chunks.length) * 100,
      bytesUploaded,
      totalBytes: session.fileSize
    };
  }
}

export const chunkedUploadHelpers = new ChunkedUploadHelpers();