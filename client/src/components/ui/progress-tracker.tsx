import React, { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './card';
import { Progress } from './progress';
import { Badge } from './badge';
import { Button } from './button';
import { 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  Play, 
  Pause, 
  X,
  RotateCw,
  FileVideo,
  Mic,
  Brain,
  Scissors,
  Share2
} from 'lucide-react';

export interface ProcessingStage {
  id: string;
  name: string;
  displayName: string;
  description: string;
  estimatedDuration: number;
  weight: number;
}

export interface StageProgress {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  startedAt?: Date;
  completedAt?: Date;
  error?: any;
}

export interface UploadProgress {
  uploadId: string;
  userId: string;
  fileName: string;
  fileSize: number;
  currentStage: string;
  stages: Record<string, StageProgress>;
  overallProgress: number;
  startedAt: Date;
  estimatedCompletion?: Date;
  status: 'uploading' | 'processing' | 'completed' | 'failed' | 'cancelled';
}

interface ProgressTrackerProps {
  uploadId: string;
  onComplete?: (progress: UploadProgress) => void;
  onError?: (error: any) => void;
  onCancel?: () => void;
  className?: string;
}

export function ProgressTracker({ 
  uploadId, 
  onComplete, 
  onError, 
  onCancel,
  className = '' 
}: ProgressTrackerProps) {
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [stages, setStages] = useState<ProcessingStage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize WebSocket connection
  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [uploadId]);

  const connectWebSocket = () => {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}`;
      
      wsRef.current = new WebSocket(wsUrl);
      
      wsRef.current.onopen = () => {
        setIsConnected(true);
        console.log('WebSocket connected for progress tracking');
      };
      
      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleWebSocketMessage(data);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };
      
      wsRef.current.onclose = () => {
        setIsConnected(false);
        console.log('WebSocket disconnected');
        
        // Attempt to reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          if (progress?.status === 'processing' || progress?.status === 'uploading') {
            connectWebSocket();
          }
        }, 3000);
      };
      
      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setIsConnected(false);
      };
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
      setIsConnected(false);
    }
  };

  const handleWebSocketMessage = (data: any) => {
    switch (data.type) {
      case 'progress_update':
        setProgress(data.data);
        if (data.data.status === 'completed' && onComplete) {
          onComplete(data.data);
        } else if (data.data.status === 'failed' && onError) {
          onError(data.data);
        }
        break;
      case 'stage_update':
        // Update specific stage progress
        if (progress) {
          setProgress(prev => {
            if (!prev) return prev;
            const updated = { ...prev };
            if (updated.stages[data.data.stage]) {
              updated.stages[data.data.stage] = {
                ...updated.stages[data.data.stage],
                progress: data.data.progress
              };
            }
            return updated;
          });
        }
        break;
      case 'user_progress':
        // Handle user progress updates
        const userProgress = data.data.find((p: UploadProgress) => p.uploadId === uploadId);
        if (userProgress) {
          setProgress(userProgress);
        }
        break;
    }
  };

  // Fetch initial progress and stages
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        // Fetch stages
        const stagesResponse = await fetch('/api/progress/stages');
        if (stagesResponse.ok) {
          const stagesData = await stagesResponse.json();
          setStages(stagesData);
        }

        // Fetch current progress
        const progressResponse = await fetch(`/api/progress/${uploadId}`);
        if (progressResponse.ok) {
          const progressData = await progressResponse.json();
          setProgress(progressData);
        }
      } catch (error) {
        console.error('Failed to fetch initial progress data:', error);
      }
    };

    fetchInitialData();
  }, [uploadId]);

  const getStageIcon = (stageId: string) => {
    switch (stageId) {
      case 'upload':
        return <FileVideo className="w-4 h-4" />;
      case 'transcription':
        return <Mic className="w-4 h-4" />;
      case 'segmentation':
        return <Brain className="w-4 h-4" />;
      case 'clip_generation':
        return <Scissors className="w-4 h-4" />;
      case 'content_generation':
        return <Share2 className="w-4 h-4" />;
      default:
        return <Play className="w-4 h-4" />;
    }
  };

  const getStageStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'processing':
        return <RotateCw className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-gray-400" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'processing':
      case 'uploading':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'failed':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'cancelled':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatTimeRemaining = (estimatedCompletion?: Date) => {
    if (!estimatedCompletion) return null;
    
    const now = new Date();
    const remaining = estimatedCompletion.getTime() - now.getTime();
    
    if (remaining <= 0) return 'Completing...';
    
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    
    if (minutes > 0) {
      return `${minutes}m ${seconds}s remaining`;
    } else {
      return `${seconds}s remaining`;
    }
  };

  if (!progress) {
    return (
      <Card className={`animate-pulse ${className}`}>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-32"></div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="h-2 bg-gray-200 rounded"></div>
            <div className="h-2 bg-gray-200 rounded w-3/4"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              {getStageStatusIcon(progress.status)}
              <CardTitle className="text-lg">{progress.fileName}</CardTitle>
            </div>
            <Badge className={getStatusColor(progress.status)}>
              {progress.status.charAt(0).toUpperCase() + progress.status.slice(1)}
            </Badge>
          </div>
          <div className="flex items-center space-x-2">
            {!isConnected && (
              <Badge variant="outline" className="text-orange-600 border-orange-300">
                Reconnecting...
              </Badge>
            )}
            {onCancel && (progress.status === 'uploading' || progress.status === 'processing') && (
              <Button
                variant="outline"
                size="sm"
                onClick={onCancel}
                className="text-red-600 hover:text-red-700"
              >
                <X className="w-4 h-4 mr-1" />
                Cancel
              </Button>
            )}
          </div>
        </div>
        
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>{formatFileSize(progress.fileSize)}</span>
          <span>{progress.overallProgress}% complete</span>
          {formatTimeRemaining(progress.estimatedCompletion) && (
            <span>{formatTimeRemaining(progress.estimatedCompletion)}</span>
          )}
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="space-y-4">
          {/* Overall Progress */}
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span>Overall Progress</span>
              <span>{progress.overallProgress}%</span>
            </div>
            <Progress value={progress.overallProgress} className="h-2" />
          </div>

          {/* Stage Progress */}
          <div className="space-y-3">
            {stages.map((stage) => {
              const stageProgress = progress.stages[stage.id];
              if (!stageProgress) return null;

              return (
                <div key={stage.id} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      {getStageIcon(stage.id)}
                      <span className="font-medium">{stage.displayName}</span>
                      {getStageStatusIcon(stageProgress.status)}
                    </div>
                    <span className="text-sm text-gray-600">
                      {stageProgress.progress}%
                    </span>
                  </div>
                  
                  <p className="text-sm text-gray-600 mb-2">{stage.description}</p>
                  
                  <Progress 
                    value={stageProgress.progress} 
                    className="h-1.5"
                  />
                  
                  {stageProgress.error && (
                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                      Error: {stageProgress.error.message || 'Stage failed'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Hook for managing progress state
export function useProgressTracker(uploadId: string) {
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const fetchProgress = async () => {
      try {
        const response = await fetch(`/api/progress/${uploadId}`);
        if (response.ok) {
          const data = await response.json();
          setProgress(data);
        }
      } catch (error) {
        console.error('Failed to fetch progress:', error);
      }
    };

    fetchProgress();
    const interval = setInterval(fetchProgress, 5000); // Poll every 5 seconds

    return () => clearInterval(interval);
  }, [uploadId]);

  return { progress, isConnected };
} 