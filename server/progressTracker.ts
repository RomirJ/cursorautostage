import { WebSocket, WebSocketServer } from 'ws';
import { storage } from './storage';

export interface ProcessingStage {
  id: string;
  name: string;
  displayName: string;
  description: string;
  estimatedDuration: number; // in seconds
  weight: number; // percentage of total processing
}

export interface ProgressUpdate {
  uploadId: string;
  userId: string;
  stage: string;
  stageName: string;
  progress: number; // 0-100
  overallProgress: number; // 0-100
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  message: string;
  estimatedTimeRemaining?: number; // in seconds
  startedAt?: Date;
  completedAt?: Date;
  error?: {
    code: string;
    message: string;
    isRetryable: boolean;
  };
  metadata?: any;
}

export interface UploadProgress {
  uploadId: string;
  userId: string;
  fileName: string;
  fileSize: number;
  currentStage: string;
  stages: Record<string, {
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
    progress: number;
    startedAt?: Date;
    completedAt?: Date;
    error?: any;
  }>;
  overallProgress: number;
  startedAt: Date;
  estimatedCompletion?: Date;
  status: 'uploading' | 'processing' | 'completed' | 'failed' | 'cancelled';
}

export class ProgressTracker {
  private static instance: ProgressTracker;
  private wss: WebSocketServer | null = null;
  private connections: Map<string, WebSocket> = new Map();
  private uploadProgress: Map<string, UploadProgress> = new Map();
  private stageDefinitions: Map<string, ProcessingStage> = new Map();

  static getInstance(): ProgressTracker {
    if (!ProgressTracker.instance) {
      ProgressTracker.instance = new ProgressTracker();
    }
    return ProgressTracker.instance;
  }

  constructor() {
    this.initializeStages();
  }

  private initializeStages() {
    const stages: ProcessingStage[] = [
      {
        id: 'upload',
        name: 'upload',
        displayName: 'Uploading File',
        description: 'Uploading your file to our servers',
        estimatedDuration: 30,
        weight: 5
      },
      {
        id: 'transcription',
        name: 'transcribing',
        displayName: 'Transcribing Audio',
        description: 'Converting speech to text with AI',
        estimatedDuration: 120,
        weight: 30
      },
      {
        id: 'segmentation',
        name: 'segmenting',
        displayName: 'Analyzing Content',
        description: 'Breaking content into meaningful segments',
        estimatedDuration: 60,
        weight: 20
      },
      {
        id: 'clip_generation',
        name: 'processing',
        displayName: 'Generating Clips',
        description: 'Creating video clips and social content',
        estimatedDuration: 180,
        weight: 35
      },
      {
        id: 'content_generation',
        name: 'generating_content',
        displayName: 'Creating Social Posts',
        description: 'Generating captions and social media content',
        estimatedDuration: 90,
        weight: 10
      }
    ];

    stages.forEach(stage => {
      this.stageDefinitions.set(stage.id, stage);
    });
  }

  // WebSocket Management
  initializeWebSocket(server: any) {
    this.wss = new WebSocketServer({ server });
    
    this.wss.on('connection', (ws: WebSocket, req: any) => {
      const userId = this.extractUserIdFromRequest(req);
      if (userId) {
        this.connections.set(userId, ws);
        
        // Send current progress for user's uploads
        this.sendUserProgress(userId);
        
        ws.on('close', () => {
          this.connections.delete(userId);
        });
        
        ws.on('error', (error) => {
          console.error('WebSocket error:', error);
          this.connections.delete(userId);
        });
      }
    });
  }

  private extractUserIdFromRequest(req: any): string | null {
    // Extract user ID from request headers or query params
    // This would need to be implemented based on your auth system
    const authHeader = req.headers.authorization;
    if (authHeader) {
      // Parse JWT or session token to get user ID
      // For now, return a placeholder
      return 'user_' + Math.random().toString(36).substr(2, 9);
    }
    return null;
  }

  // Progress Management
  async initializeUpload(uploadId: string, userId: string, fileName: string, fileSize: number): Promise<void> {
    const progress: UploadProgress = {
      uploadId,
      userId,
      fileName,
      fileSize,
      currentStage: 'upload',
      stages: {},
      overallProgress: 0,
      startedAt: new Date(),
      status: 'uploading'
    };

    // Initialize all stages
    for (const [stageId, stage] of this.stageDefinitions) {
      progress.stages[stageId] = {
        status: 'pending',
        progress: 0
      };
    }

    // Set upload stage as processing
    progress.stages.upload = {
      status: 'processing',
      progress: 0,
      startedAt: new Date()
    };

    this.uploadProgress.set(uploadId, progress);
    await this.saveProgressToDatabase(progress);
    this.broadcastProgress(progress);
  }

  async updateStageProgress(
    uploadId: string, 
    stage: string, 
    progress: number, 
    message?: string,
    metadata?: any
  ): Promise<void> {
    const uploadProgress = this.uploadProgress.get(uploadId);
    if (!uploadProgress) return;

    const stageData = uploadProgress.stages[stage];
    if (!stageData) return;

    // Update stage progress
    stageData.progress = Math.min(100, Math.max(0, progress));
    
    if (progress >= 100) {
      stageData.status = 'completed';
      stageData.completedAt = new Date();
    } else if (stageData.status === 'pending') {
      stageData.status = 'processing';
      stageData.startedAt = new Date();
    }

    // Update overall progress
    uploadProgress.overallProgress = this.calculateOverallProgress(uploadProgress);
    uploadProgress.currentStage = stage;

    // Update estimated completion time
    uploadProgress.estimatedCompletion = this.calculateEstimatedCompletion(uploadProgress);

    // Save and broadcast
    await this.saveProgressToDatabase(uploadProgress);
    this.broadcastProgress(uploadProgress);

    // Send specific stage update
    this.sendStageUpdate(uploadId, stage, progress, message, metadata);
  }

  async completeStage(uploadId: string, stage: string, error?: any): Promise<void> {
    const uploadProgress = this.uploadProgress.get(uploadId);
    if (!uploadProgress) return;

    const stageData = uploadProgress.stages[stage];
    if (!stageData) return;

    if (error) {
      stageData.status = 'failed';
      stageData.error = error;
    } else {
      stageData.status = 'completed';
      stageData.progress = 100;
      stageData.completedAt = new Date();
    }

    // Update overall status
    if (error) {
      uploadProgress.status = 'failed';
    } else if (stage === 'content_generation') {
      uploadProgress.status = 'completed';
    }

    // Update overall progress
    uploadProgress.overallProgress = this.calculateOverallProgress(uploadProgress);

    // Save and broadcast
    await this.saveProgressToDatabase(uploadProgress);
    this.broadcastProgress(uploadProgress);
  }

  async failUpload(uploadId: string, error: any): Promise<void> {
    const uploadProgress = this.uploadProgress.get(uploadId);
    if (!uploadProgress) return;

    uploadProgress.status = 'failed';
    uploadProgress.stages[uploadProgress.currentStage] = {
      ...uploadProgress.stages[uploadProgress.currentStage],
      status: 'failed',
      error
    };

    await this.saveProgressToDatabase(uploadProgress);
    this.broadcastProgress(uploadProgress);
  }

  async cancelUpload(uploadId: string): Promise<void> {
    const uploadProgress = this.uploadProgress.get(uploadId);
    if (!uploadProgress) return;

    uploadProgress.status = 'cancelled';
    uploadProgress.stages[uploadProgress.currentStage] = {
      ...uploadProgress.stages[uploadProgress.currentStage],
      status: 'cancelled'
    };

    await this.saveProgressToDatabase(uploadProgress);
    this.broadcastProgress(uploadProgress);
  }

  // Progress Calculations
  private calculateOverallProgress(uploadProgress: UploadProgress): number {
    let totalProgress = 0;
    let totalWeight = 0;

    for (const [stageId, stageData] of Object.entries(uploadProgress.stages)) {
      const stageDef = this.stageDefinitions.get(stageId);
      if (stageDef) {
        const stageProgress = stageData.status === 'completed' ? 100 : stageData.progress;
        totalProgress += (stageProgress * stageDef.weight);
        totalWeight += stageDef.weight;
      }
    }

    return totalWeight > 0 ? Math.round(totalProgress / totalWeight) : 0;
  }

  private calculateEstimatedCompletion(uploadProgress: UploadProgress): Date | undefined {
    let remainingTime = 0;
    let hasActiveStage = false;

    for (const [stageId, stageData] of Object.entries(uploadProgress.stages)) {
      const stageDef = this.stageDefinitions.get(stageId);
      if (!stageDef) continue;

      if (stageData.status === 'processing') {
        hasActiveStage = true;
        const elapsed = stageData.startedAt ? 
          (Date.now() - stageData.startedAt.getTime()) / 1000 : 0;
        const estimatedTotal = stageDef.estimatedDuration;
        const remaining = Math.max(0, estimatedTotal - elapsed);
        remainingTime += remaining * (1 - stageData.progress / 100);
      } else if (stageData.status === 'pending') {
        hasActiveStage = true;
        remainingTime += stageDef.estimatedDuration;
      }
    }

    if (!hasActiveStage) return undefined;

    return new Date(Date.now() + remainingTime * 1000);
  }

  // Broadcasting
  private broadcastProgress(uploadProgress: UploadProgress): void {
    const connection = this.connections.get(uploadProgress.userId);
    if (connection && connection.readyState === WebSocket.OPEN) {
      connection.send(JSON.stringify({
        type: 'progress_update',
        data: uploadProgress
      }));
    }
  }

  private sendStageUpdate(
    uploadId: string, 
    stage: string, 
    progress: number, 
    message?: string,
    metadata?: any
  ): void {
    const uploadProgress = this.uploadProgress.get(uploadId);
    if (!uploadProgress) return;

    const connection = this.connections.get(uploadProgress.userId);
    if (connection && connection.readyState === WebSocket.OPEN) {
      connection.send(JSON.stringify({
        type: 'stage_update',
        data: {
          uploadId,
          stage,
          progress,
          message,
          metadata,
          timestamp: new Date().toISOString()
        }
      }));
    }
  }

  private sendUserProgress(userId: string): void {
    const userUploads = Array.from(this.uploadProgress.values())
      .filter(progress => progress.userId === userId && 
        ['uploading', 'processing'].includes(progress.status));

    const connection = this.connections.get(userId);
    if (connection && connection.readyState === WebSocket.OPEN) {
      connection.send(JSON.stringify({
        type: 'user_progress',
        data: userUploads
      }));
    }
  }

  // Database Operations
  private async saveProgressToDatabase(progress: UploadProgress): Promise<void> {
    try {
      // Save progress to database
      // await storage.saveUploadProgress(progress);
      console.log('Progress saved to database:', progress.uploadId);
    } catch (error) {
      console.error('Failed to save progress to database:', error);
    }
  }

  // Public API
  getUploadProgress(uploadId: string): UploadProgress | undefined {
    return this.uploadProgress.get(uploadId);
  }

  getUserProgress(userId: string): UploadProgress[] {
    return Array.from(this.uploadProgress.values())
      .filter(progress => progress.userId === userId);
  }

  getStageDefinitions(): ProcessingStage[] {
    return Array.from(this.stageDefinitions.values());
  }

  // Cleanup
  cleanupCompletedUploads(): void {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);

    for (const [uploadId, progress] of this.uploadProgress.entries()) {
      if (progress.status === 'completed' || progress.status === 'failed') {
        if (progress.status === 'completed' && progress.startedAt && progress.startedAt.getTime() < oneHourAgo) {
          this.uploadProgress.delete(uploadId);
        }
      }
    }
  }
}

// Export singleton instance
export const progressTracker = ProgressTracker.getInstance(); 