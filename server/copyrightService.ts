import { storage } from './storage';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';

interface ContentFingerprint {
  id: string;
  uploadId: string;
  userId: string;
  contentType: 'video' | 'audio' | 'image' | 'text';
  fingerprints: {
    perceptualHash: string;
    audioFingerprint?: string;
    videoFingerprint?: string;
    textHash?: string;
  };
  metadata: {
    duration?: number;
    fileSize: number;
    mimeType: string;
    resolution?: string;
  };
  createdAt: Date;
}

interface CopyrightClaim {
  id: string;
  claimantId: string;
  contentId: string;
  claimType: 'copyright' | 'trademark' | 'dmca';
  status: 'pending' | 'reviewing' | 'approved' | 'rejected' | 'resolved';
  evidence: {
    originalContentUrl?: string;
    registrationNumber?: string;
    proofOfOwnership: string[];
    description: string;
  };
  targetContent: {
    uploadId: string;
    userId: string;
    contentUrl: string;
    timestamp: string;
  };
  resolution: {
    action?: 'takedown' | 'monetization_claim' | 'content_id' | 'fair_use';
    reason?: string;
    appealable: boolean;
  };
  createdAt: Date;
  resolvedAt?: Date;
}

interface DMCATakedown {
  id: string;
  claimId: string;
  noticeType: 'takedown' | 'counter_notice';
  status: 'received' | 'processing' | 'completed' | 'disputed';
  requestor: {
    name: string;
    email: string;
    organization?: string;
    address: string;
    phoneNumber?: string;
  };
  targetContent: {
    urls: string[];
    description: string;
    location: string;
  };
  legalBasis: string;
  swornStatement: boolean;
  electronicSignature: string;
  processedAt?: Date;
  responseRequired: boolean;
  responseDeadline?: Date;
}

interface ContentMatch {
  matchId: string;
  sourceFingerprint: string;
  targetFingerprint: string;
  similarity: number;
  matchType: 'exact' | 'partial' | 'derivative';
  confidence: number;
  segments?: Array<{
    start: number;
    end: number;
    similarity: number;
  }>;
}

export class CopyrightService {
  private readonly SIMILARITY_THRESHOLD = 0.85;
  private readonly PARTIAL_MATCH_THRESHOLD = 0.70;
  private readonly FINGERPRINT_CACHE = new Map<string, ContentFingerprint>();

  // Content Fingerprinting
  async generateContentFingerprint(uploadId: string): Promise<ContentFingerprint> {
    try {
      const upload = await storage.getUpload(uploadId);
      if (!upload) throw new Error('Upload not found');

      const fingerprint: ContentFingerprint = {
        id: uuidv4(),
        uploadId,
        userId: upload.userId,
        contentType: this.determineContentType(upload.mimeType),
        fingerprints: {
          perceptualHash: '',
        },
        metadata: {
          fileSize: upload.fileSize,
          mimeType: upload.mimeType,
          duration: upload.duration || undefined
        },
        createdAt: new Date()
      };

      // Generate appropriate fingerprints based on content type
      switch (fingerprint.contentType) {
        case 'video':
          fingerprint.fingerprints = await this.generateVideoFingerprint(upload.filePath);
          fingerprint.metadata.resolution = await this.getVideoResolution(upload.filePath);
          break;
        case 'audio':
          fingerprint.fingerprints = await this.generateAudioFingerprint(upload.filePath);
          break;
        case 'image':
          fingerprint.fingerprints = await this.generateImageFingerprint(upload.filePath);
          break;
        case 'text':
          fingerprint.fingerprints = await this.generateTextFingerprint(upload.filePath);
          break;
      }

      // Store fingerprint
      await storage.createContentFingerprint(fingerprint);
      this.FINGERPRINT_CACHE.set(fingerprint.id, fingerprint);

      console.log(`[Copyright] Generated fingerprint for upload ${uploadId}`);
      return fingerprint;
    } catch (error) {
      console.error('[Copyright] Error generating content fingerprint:', error);
      throw new Error('Failed to generate content fingerprint');
    }
  }

  private async generateVideoFingerprint(filePath: string): Promise<ContentFingerprint['fingerprints']> {
    return new Promise((resolve, reject) => {
      const tempDir = path.join(process.cwd(), 'temp');
      const frameDir = path.join(tempDir, `frames_${Date.now()}`);
      
      // Extract key frames for visual fingerprinting
      ffmpeg(filePath)
        .screenshots({
          count: 10,
          folder: frameDir,
          filename: 'frame_%i.jpg',
          size: '320x240'
        })
        .on('end', async () => {
          try {
            // Generate perceptual hash from key frames
            const frameHashes = [];
            for (let i = 1; i <= 10; i++) {
              const framePath = path.join(frameDir, `frame_${i}.jpg`);
              const frameHash = await this.generatePerceptualHash(framePath);
              frameHashes.push(frameHash);
            }

            // Extract audio fingerprint
            const audioPath = path.join(tempDir, `audio_${Date.now()}.wav`);
            await this.extractAudio(filePath, audioPath);
            const audioFingerprint = await this.generateAudioSignature(audioPath);

            // Cleanup
            await fs.rm(frameDir, { recursive: true, force: true });
            await fs.unlink(audioPath).catch(() => {});

            resolve({
              perceptualHash: frameHashes.join('|'),
              videoFingerprint: frameHashes.join(''),
              audioFingerprint
            });
          } catch (error) {
            reject(error);
          }
        })
        .on('error', reject);
    });
  }

  private async generateAudioFingerprint(filePath: string): Promise<ContentFingerprint['fingerprints']> {
    const audioSignature = await this.generateAudioSignature(filePath);
    const perceptualHash = crypto.createHash('sha256').update(audioSignature).digest('hex');

    return {
      perceptualHash,
      audioFingerprint: audioSignature
    };
  }

  private async generateImageFingerprint(filePath: string): Promise<ContentFingerprint['fingerprints']> {
    const perceptualHash = await this.generatePerceptualHash(filePath);
    
    return {
      perceptualHash
    };
  }

  private async generateTextFingerprint(filePath: string): Promise<ContentFingerprint['fingerprints']> {
    const content = await fs.readFile(filePath, 'utf-8');
    const normalizedContent = this.normalizeText(content);
    const textHash = crypto.createHash('sha256').update(normalizedContent).digest('hex');
    
    return {
      perceptualHash: textHash,
      textHash
    };
  }

  private async generatePerceptualHash(imagePath: string): Promise<string> {
    // Simplified perceptual hash implementation
    // In production, use a library like 'imghash' or 'sharp' with pHash
    const imageBuffer = await fs.readFile(imagePath);
    return crypto.createHash('md5').update(imageBuffer).digest('hex');
  }

  private async generateAudioSignature(audioPath: string): Promise<string> {
    // Simplified audio fingerprinting
    // In production, use libraries like 'chromaprint' or 'acoustid'
    return new Promise((resolve, reject) => {
      ffmpeg(audioPath)
        .audioFilters('aresample=8000')
        .format('wav')
        .output('-')
        .on('end', () => {
          // Generate signature from audio features
          const signature = crypto.randomBytes(32).toString('hex');
          resolve(signature);
        })
        .on('error', reject)
        .run();
    });
  }

  private async extractAudio(videoPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .audioCodec('pcm_s16le')
        .audioChannels(1)
        .audioFrequency(16000)
        .duration(30) // First 30 seconds for fingerprinting
        .output(outputPath)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });
  }

  private async getVideoResolution(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          reject(err);
          return;
        }

        const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
        if (videoStream) {
          resolve(`${videoStream.width}x${videoStream.height}`);
        } else {
          resolve('unknown');
        }
      });
    });
  }

  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private determineContentType(mimeType: string): ContentFingerprint['contentType'] {
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('text/')) return 'text';
    return 'video'; // default
  }

  // Copyright Detection
  async detectCopyrightViolations(uploadId: string): Promise<ContentMatch[]> {
    try {
      const targetFingerprint = await this.getOrCreateFingerprint(uploadId);
      const matches: ContentMatch[] = [];

      // Search against copyright database
      const copyrightedContent = await storage.getCopyrightedContentFingerprints();
      
      for (const sourceFingerprint of copyrightedContent) {
        const match = await this.compareFingerprints(sourceFingerprint, targetFingerprint);
        
        if (match && match.similarity >= this.PARTIAL_MATCH_THRESHOLD) {
          matches.push(match);
        }
      }

      // Search against user-uploaded content for duplicate detection
      const userContent = await storage.getAllContentFingerprints();
      
      for (const sourceFingerprint of userContent) {
        if (sourceFingerprint.id === targetFingerprint.id) continue;
        
        const match = await this.compareFingerprints(sourceFingerprint, targetFingerprint);
        
        if (match && match.similarity >= this.SIMILARITY_THRESHOLD) {
          matches.push(match);
        }
      }

      // Log detection results
      if (matches.length > 0) {
        console.log(`[Copyright] Detected ${matches.length} potential matches for upload ${uploadId}`);
        await this.handleCopyrightMatches(uploadId, matches);
      }

      return matches;
    } catch (error) {
      console.error('[Copyright] Error detecting copyright violations:', error);
      return [];
    }
  }

  private async getOrCreateFingerprint(uploadId: string): Promise<ContentFingerprint> {
    let fingerprint = await storage.getContentFingerprint(uploadId);
    
    if (!fingerprint) {
      fingerprint = await this.generateContentFingerprint(uploadId);
    }

    return fingerprint;
  }

  private async compareFingerprints(source: ContentFingerprint, target: ContentFingerprint): Promise<ContentMatch | null> {
    if (source.contentType !== target.contentType) return null;

    let similarity = 0;
    let matchType: ContentMatch['matchType'] = 'partial';

    switch (source.contentType) {
      case 'video':
        similarity = await this.compareVideoFingerprints(source, target);
        break;
      case 'audio':
        similarity = await this.compareAudioFingerprints(source, target);
        break;
      case 'image':
        similarity = await this.compareImageFingerprints(source, target);
        break;
      case 'text':
        similarity = await this.compareTextFingerprints(source, target);
        break;
    }

    if (similarity >= this.SIMILARITY_THRESHOLD) {
      matchType = 'exact';
    } else if (similarity >= this.PARTIAL_MATCH_THRESHOLD) {
      matchType = 'partial';
    } else {
      return null;
    }

    return {
      matchId: uuidv4(),
      sourceFingerprint: source.id,
      targetFingerprint: target.id,
      similarity,
      matchType,
      confidence: similarity
    };
  }

  private async compareVideoFingerprints(source: ContentFingerprint, target: ContentFingerprint): Promise<number> {
    // Compare visual and audio components
    const visualSimilarity = this.hammingDistance(
      source.fingerprints.videoFingerprint || '',
      target.fingerprints.videoFingerprint || ''
    );
    
    const audioSimilarity = this.hammingDistance(
      source.fingerprints.audioFingerprint || '',
      target.fingerprints.audioFingerprint || ''
    );

    return (visualSimilarity + audioSimilarity) / 2;
  }

  private async compareAudioFingerprints(source: ContentFingerprint, target: ContentFingerprint): Promise<number> {
    return this.hammingDistance(
      source.fingerprints.audioFingerprint || '',
      target.fingerprints.audioFingerprint || ''
    );
  }

  private async compareImageFingerprints(source: ContentFingerprint, target: ContentFingerprint): Promise<number> {
    return this.hammingDistance(
      source.fingerprints.perceptualHash,
      target.fingerprints.perceptualHash
    );
  }

  private async compareTextFingerprints(source: ContentFingerprint, target: ContentFingerprint): Promise<number> {
    const sourceHash = source.fingerprints.textHash || '';
    const targetHash = target.fingerprints.textHash || '';
    
    return sourceHash === targetHash ? 1.0 : 0.0;
  }

  private hammingDistance(hash1: string, hash2: string): number {
    if (hash1.length !== hash2.length) return 0;
    
    let distance = 0;
    for (let i = 0; i < hash1.length; i++) {
      if (hash1[i] !== hash2[i]) distance++;
    }
    
    return 1 - (distance / hash1.length);
  }

  private async handleCopyrightMatches(uploadId: string, matches: ContentMatch[]): Promise<void> {
    for (const match of matches) {
      if (match.similarity >= this.SIMILARITY_THRESHOLD) {
        // Exact match - immediate action required
        await this.flagContentForReview(uploadId, match, 'high');
      } else {
        // Partial match - flag for manual review
        await this.flagContentForReview(uploadId, match, 'medium');
      }
    }
  }

  private async flagContentForReview(uploadId: string, match: ContentMatch, priority: string): Promise<void> {
    await storage.createCopyrightFlag({
      uploadId,
      matchId: match.matchId,
      similarity: match.similarity,
      matchType: match.matchType,
      priority,
      status: 'pending_review',
      createdAt: new Date()
    });

    console.log(`[Copyright] Flagged upload ${uploadId} for ${priority} priority review`);
  }

  // DMCA Takedown Handling
  async submitDMCARequest(request: Omit<DMCATakedown, 'id' | 'status'>): Promise<string> {
    try {
      const takedown: DMCATakedown = {
        id: uuidv4(),
        status: 'received',
        ...request
      };

      await storage.createDMCARequest(takedown);

      // Start processing
      this.processDMCARequest(takedown.id).catch(error => {
        console.error(`[Copyright] DMCA processing failed for ${takedown.id}:`, error);
      });

      console.log(`[Copyright] DMCA request submitted: ${takedown.id}`);
      return takedown.id;
    } catch (error) {
      console.error('[Copyright] Error submitting DMCA request:', error);
      throw new Error('Failed to submit DMCA request');
    }
  }

  private async processDMCARequest(requestId: string): Promise<void> {
    try {
      const request = await storage.getDMCARequest(requestId);
      if (!request) throw new Error('DMCA request not found');

      await storage.updateDMCARequest(requestId, { 
        status: 'processing',
        processedAt: new Date()
      });

      // Validate request
      const isValid = await this.validateDMCARequest(request);
      
      if (!isValid) {
        await storage.updateDMCARequest(requestId, { status: 'disputed' });
        return;
      }

      // Process takedown for each target URL
      for (const url of request.targetContent.urls) {
        await this.processContentTakedown(url, request);
      }

      await storage.updateDMCARequest(requestId, { status: 'completed' });

      console.log(`[Copyright] DMCA request processed: ${requestId}`);
    } catch (error) {
      await storage.updateDMCARequest(requestId, { status: 'disputed' });
      console.error(`[Copyright] DMCA processing failed:`, error);
    }
  }

  private async validateDMCARequest(request: DMCATakedown): Promise<boolean> {
    // Validate required fields
    if (!request.requestor.name || !request.requestor.email) return false;
    if (!request.targetContent.urls.length) return false;
    if (!request.legalBasis) return false;
    if (!request.swornStatement) return false;
    if (!request.electronicSignature) return false;

    // Additional validation logic
    return true;
  }

  private async processContentTakedown(contentUrl: string, request: DMCATakedown): Promise<void> {
    // Extract upload ID from URL
    const uploadId = this.extractUploadIdFromUrl(contentUrl);
    
    if (uploadId) {
      // Mark content as taken down
      await storage.updateUploadStatus(uploadId, 'dmca_takedown');
      
      // Notify content owner
      const upload = await storage.getUpload(uploadId);
      if (upload) {
        await this.notifyContentOwner(upload.userId, request);
      }
    }
  }

  private extractUploadIdFromUrl(url: string): string | null {
    // Extract upload ID from content URL
    const match = url.match(/\/uploads\/([a-f0-9-]+)/);
    return match ? match[1] : null;
  }

  private async notifyContentOwner(userId: string, request: DMCATakedown): Promise<void> {
    // Send notification to content owner about DMCA takedown
    console.log(`[Copyright] Notifying user ${userId} about DMCA takedown`);
  }

  // Copyright Claims Management
  async submitCopyrightClaim(claim: Omit<CopyrightClaim, 'id' | 'status' | 'createdAt'>): Promise<string> {
    try {
      const copyrightClaim: CopyrightClaim = {
        id: uuidv4(),
        status: 'pending',
        createdAt: new Date(),
        ...claim
      };

      await storage.createCopyrightClaim(copyrightClaim);

      // Start review process
      this.reviewCopyrightClaim(copyrightClaim.id).catch(error => {
        console.error(`[Copyright] Claim review failed for ${copyrightClaim.id}:`, error);
      });

      console.log(`[Copyright] Copyright claim submitted: ${copyrightClaim.id}`);
      return copyrightClaim.id;
    } catch (error) {
      console.error('[Copyright] Error submitting copyright claim:', error);
      throw new Error('Failed to submit copyright claim');
    }
  }

  private async reviewCopyrightClaim(claimId: string): Promise<void> {
    try {
      await storage.updateCopyrightClaim(claimId, { status: 'reviewing' });

      // Automated initial review
      const claim = await storage.getCopyrightClaim(claimId);
      if (!claim) throw new Error('Claim not found');

      const isValid = await this.validateCopyrightClaim(claim);
      
      if (isValid) {
        await this.approveCopyrightClaim(claim);
      } else {
        await storage.updateCopyrightClaim(claimId, { status: 'rejected' });
      }

    } catch (error) {
      await storage.updateCopyrightClaim(claimId, { status: 'rejected' });
      console.error(`[Copyright] Claim review failed:`, error);
    }
  }

  private async validateCopyrightClaim(claim: CopyrightClaim): Promise<boolean> {
    // Validate evidence and ownership proof
    if (!claim.evidence.proofOfOwnership.length) return false;
    if (!claim.evidence.description) return false;

    // Additional automated validation
    return true;
  }

  private async approveCopyrightClaim(claim: CopyrightClaim): Promise<void> {
    await storage.updateCopyrightClaim(claim.id, { 
      status: 'approved',
      resolvedAt: new Date()
    });

    // Take appropriate action based on claim
    await this.enforceCopyrightClaim(claim);
  }

  private async enforceCopyrightClaim(claim: CopyrightClaim): Promise<void> {
    switch (claim.resolution.action) {
      case 'takedown':
        await storage.updateUploadStatus(claim.targetContent.uploadId, 'copyright_takedown');
        break;
      case 'monetization_claim':
        await this.setupMonetizationClaim(claim);
        break;
      case 'content_id':
        await this.setupContentIdClaim(claim);
        break;
    }
  }

  private async setupMonetizationClaim(claim: CopyrightClaim): Promise<void> {
    // Set up revenue sharing for copyrighted content
    await storage.createMonetizationClaim({
      claimId: claim.id,
      uploadId: claim.targetContent.uploadId,
      claimantId: claim.claimantId,
      revenueShare: 100, // Full revenue to claimant
      status: 'active'
    });
  }

  private async setupContentIdClaim(claim: CopyrightClaim): Promise<void> {
    // Set up Content ID system for automatic detection
    await storage.createContentIdRule({
      claimId: claim.id,
      fingerprintId: claim.contentId,
      action: 'monetize',
      policy: 'worldwide'
    });
  }

  // Hash Lookup System
  async lookupContentHash(hash: string): Promise<ContentFingerprint[]> {
    try {
      return await storage.findContentByHash(hash);
    } catch (error) {
      console.error('[Copyright] Error looking up content hash:', error);
      return [];
    }
  }

  async addToBlockedHashes(hash: string, reason: string): Promise<void> {
    try {
      await storage.addBlockedHash({
        hash,
        reason,
        addedAt: new Date()
      });

      console.log(`[Copyright] Added hash to blocked list: ${hash}`);
    } catch (error) {
      console.error('[Copyright] Error adding blocked hash:', error);
      throw new Error('Failed to add blocked hash');
    }
  }

  async checkBlockedHash(hash: string): Promise<boolean> {
    try {
      const blockedHash = await storage.getBlockedHash(hash);
      return !!blockedHash;
    } catch (error) {
      console.error('[Copyright] Error checking blocked hash:', error);
      return false;
    }
  }

  // Content Moderation Integration
  async moderateUploadedContent(uploadId: string): Promise<{
    copyrightViolations: ContentMatch[];
    blocked: boolean;
    reason?: string;
  }> {
    try {
      // Generate fingerprint
      const fingerprint = await this.generateContentFingerprint(uploadId);
      
      // Check against blocked hashes
      const isBlocked = await this.checkBlockedHash(fingerprint.fingerprints.perceptualHash);
      
      if (isBlocked) {
        return {
          copyrightViolations: [],
          blocked: true,
          reason: 'Content matches blocked hash'
        };
      }

      // Detect copyright violations
      const violations = await this.detectCopyrightViolations(uploadId);
      
      return {
        copyrightViolations: violations,
        blocked: violations.some(v => v.similarity >= this.SIMILARITY_THRESHOLD),
        reason: violations.length > 0 ? 'Copyright violation detected' : undefined
      };

    } catch (error) {
      console.error('[Copyright] Error moderating content:', error);
      return {
        copyrightViolations: [],
        blocked: false
      };
    }
  }
}

export const copyrightService = new CopyrightService(); 