import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
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
  Share2,
  Upload,
  TrendingUp,
  Activity,
  RefreshCw
} from "lucide-react";
import { format } from "date-fns";

interface UploadProgress {
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

interface StageProgress {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  startedAt?: Date;
  completedAt?: Date;
  error?: any;
}

interface ProcessingStage {
  id: string;
  name: string;
  displayName: string;
  description: string;
  estimatedDuration: number;
  weight: number;
}

interface ProgressStats {
  totalUploads: number;
  completedUploads: number;
  failedUploads: number;
  processingUploads: number;
  averageProcessingTime: number;
  successRate: number;
}

export function ProgressDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedUpload, setSelectedUpload] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Fetch all user progress
  const { data: userProgress, isLoading: progressLoading } = useQuery({
    queryKey: ['userProgress'],
    queryFn: () => apiRequest('/api/progress/user'),
    refetchInterval: autoRefresh ? 5000 : false,
  });

  // Fetch progress statistics
  const { data: progressStats, isLoading: statsLoading } = useQuery({
    queryKey: ['progressStats'],
    queryFn: () => apiRequest('/api/progress/stats'),
    refetchInterval: autoRefresh ? 30000 : false,
  });

  // Fetch processing stages
  const { data: stages } = useQuery({
    queryKey: ['processingStages'],
    queryFn: () => apiRequest('/api/progress/stages'),
  });

  // Cancel upload mutation
  const cancelUploadMutation = useMutation({
    mutationFn: (uploadId: string) => apiRequest(`/api/progress/${uploadId}/cancel`, { method: 'POST' }),
    onSuccess: () => {
      toast({
        title: "Upload Cancelled",
        description: "The upload has been cancelled successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['userProgress'] });
    },
    onError: (error: any) => {
      toast({
        title: "Cancellation Failed",
        description: error.message || "Failed to cancel the upload.",
        variant: "destructive",
      });
    },
  });

  // Retry upload mutation
  const retryUploadMutation = useMutation({
    mutationFn: (uploadId: string) => apiRequest(`/api/progress/${uploadId}/retry`, { method: 'POST' }),
    onSuccess: () => {
      toast({
        title: "Upload Retried",
        description: "The upload has been restarted successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['userProgress'] });
    },
    onError: (error: any) => {
      toast({
        title: "Retry Failed",
        description: error.message || "Failed to retry the upload.",
        variant: "destructive",
      });
    },
  });

  const getStageIcon = (stageId: string) => {
    switch (stageId) {
      case 'upload':
        return <Upload className="w-4 h-4" />;
      case 'transcription':
        return <Mic className="w-4 h-4" />;
      case 'segmentation':
        return <Brain className="w-4 h-4" />;
      case 'clip_generation':
        return <Scissors className="w-4 h-4" />;
      case 'content_generation':
        return <Share2 className="w-4 h-4" />;
      default:
        return <Activity className="w-4 h-4" />;
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

  const stats = progressStats as ProgressStats;
  const uploads = (userProgress as UploadProgress[]) || [];
  const processingStages = (stages as ProcessingStage[]) || [];

  if (progressLoading || statsLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
                <div className="h-8 bg-gray-200 rounded w-3/4"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Progress Dashboard</h2>
          <p className="text-muted-foreground">
            Track your content processing pipeline and upload progress
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={autoRefresh ? 'bg-blue-50 text-blue-600' : ''}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${autoRefresh ? 'animate-spin' : ''}`} />
            Auto Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['userProgress'] })}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Uploads</p>
                  <p className="text-2xl font-bold">{stats.totalUploads}</p>
                </div>
                <Upload className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Completed</p>
                  <p className="text-2xl font-bold text-green-600">{stats.completedUploads}</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Processing</p>
                  <p className="text-2xl font-bold text-blue-600">{stats.processingUploads}</p>
                </div>
                <Activity className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Success Rate</p>
                  <p className="text-2xl font-bold text-green-600">{stats.successRate}%</p>
                </div>
                <TrendingUp className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Active Uploads */}
      <Card>
        <CardHeader>
          <CardTitle>Active Uploads</CardTitle>
        </CardHeader>
        <CardContent>
          {uploads.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Upload className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No active uploads</p>
              <p className="text-sm">Upload content to see progress here</p>
            </div>
          ) : (
            <div className="space-y-4">
              {uploads.map((upload) => (
                <div key={upload.uploadId} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <div className="flex items-center space-x-2">
                        {getStageStatusIcon(upload.status)}
                        <span className="font-medium">{upload.fileName}</span>
                      </div>
                      <Badge className={getStatusColor(upload.status)}>
                        {upload.status.charAt(0).toUpperCase() + upload.status.slice(1)}
                      </Badge>
                    </div>
                    <div className="flex items-center space-x-2">
                      {(upload.status === 'uploading' || upload.status === 'processing') && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => cancelUploadMutation.mutate(upload.uploadId)}
                          disabled={cancelUploadMutation.isPending}
                          className="text-red-600 hover:text-red-700"
                        >
                          <X className="w-4 h-4 mr-1" />
                          Cancel
                        </Button>
                      )}
                      {upload.status === 'failed' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => retryUploadMutation.mutate(upload.uploadId)}
                          disabled={retryUploadMutation.isPending}
                        >
                          <RotateCw className="w-4 h-4 mr-1" />
                          Retry
                        </Button>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between text-sm text-muted-foreground mb-3">
                    <span>{formatFileSize(upload.fileSize)}</span>
                    <span>{upload.overallProgress}% complete</span>
                    {formatTimeRemaining(upload.estimatedCompletion) && (
                      <span>{formatTimeRemaining(upload.estimatedCompletion)}</span>
                    )}
                  </div>

                  {/* Overall Progress */}
                  <div className="mb-4">
                    <div className="flex justify-between text-sm mb-2">
                      <span>Overall Progress</span>
                      <span>{upload.overallProgress}%</span>
                    </div>
                    <Progress value={upload.overallProgress} className="h-2" />
                  </div>

                  {/* Stage Progress */}
                  {selectedUpload === upload.uploadId && (
                    <div className="space-y-3 mt-4 pt-4 border-t">
                      {processingStages.map((stage) => {
                        const stageProgress = upload.stages[stage.id];
                        if (!stageProgress) return null;

                        return (
                          <div key={stage.id} className="flex items-center justify-between">
                            <div className="flex items-center space-x-2 flex-1">
                              {getStageIcon(stage.id)}
                              <span className="text-sm font-medium">{stage.displayName}</span>
                              {getStageStatusIcon(stageProgress.status)}
                            </div>
                            <div className="flex items-center space-x-2">
                              <span className="text-sm text-muted-foreground w-12 text-right">
                                {stageProgress.progress}%
                              </span>
                              <Progress 
                                value={stageProgress.progress} 
                                className="h-1.5 w-24"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Toggle Details */}
                  <div className="mt-3 pt-3 border-t">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedUpload(
                        selectedUpload === upload.uploadId ? null : upload.uploadId
                      )}
                      className="text-sm"
                    >
                      {selectedUpload === upload.uploadId ? 'Hide' : 'Show'} Stage Details
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 