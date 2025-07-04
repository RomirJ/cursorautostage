import React, { useState } from 'react';
import { Upload, Play, Download, RotateCcw } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { PreviewPlayer } from './PreviewPlayer';
import { usePreview } from '../hooks/usePreview';

interface UploadWithPreviewProps {
  uploadId: string;
  filename: string;
  fileSize: number;
  status: string;
  onRegeneratePreview?: () => void;
}

export const UploadWithPreview: React.FC<UploadWithPreviewProps> = ({
  uploadId,
  filename,
  fileSize,
  status,
  onRegeneratePreview
}) => {
  const { preview, isLoading, error, generatePreview, regeneratePreview } = usePreview();
  const [showPreview, setShowPreview] = useState(false);

  const handleGeneratePreview = async () => {
    await generatePreview(uploadId, {
      duration: 10,
      quality: 'medium',
      format: 'mp4',
      includeAudio: true,
      thumbnail: true
    });
    setShowPreview(true);
  };

  const handleRegeneratePreview = async () => {
    await regeneratePreview({
      duration: 15,
      quality: 'high',
      format: 'mp4',
      includeAudio: true,
      thumbnail: true
    });
  };

  const formatFileSize = (bytes: number) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <Card className="w-full max-w-4xl">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Upload className="w-5 h-5" />
            <span>{filename}</span>
          </div>
          <Badge variant={status === 'completed' ? 'default' : 'secondary'}>
            {status}
          </Badge>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* File Info */}
        <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
          <div>
            <span className="font-medium">File Size:</span> {formatFileSize(fileSize)}
          </div>
          <div>
            <span className="font-medium">Upload ID:</span> {uploadId}
          </div>
        </div>

        {/* Preview Controls */}
        <div className="flex items-center space-x-2">
          {!preview && !isLoading && (
            <Button onClick={handleGeneratePreview} className="flex items-center space-x-2">
              <Play className="w-4 h-4" />
              <span>Generate Preview</span>
            </Button>
          )}
          
          {preview && (
            <Button 
              onClick={() => setShowPreview(!showPreview)} 
              variant="outline"
              className="flex items-center space-x-2"
            >
              <Play className="w-4 h-4" />
              <span>{showPreview ? 'Hide' : 'Show'} Preview</span>
            </Button>
          )}
          
          {preview && onRegeneratePreview && (
            <Button 
              onClick={handleRegeneratePreview} 
              variant="outline"
              size="sm"
              className="flex items-center space-x-2"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Regenerate</span>
            </Button>
          )}
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              <span className="text-sm text-gray-600">Generating preview...</span>
            </div>
            <Progress value={undefined} className="w-full" />
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center space-x-2 text-red-600">
              <span className="text-sm font-medium">Preview Generation Failed:</span>
              <span className="text-sm">{error}</span>
            </div>
            <Button 
              onClick={handleGeneratePreview} 
              variant="outline" 
              size="sm" 
              className="mt-2"
            >
              Retry
            </Button>
          </div>
        )}

        {/* Preview Player */}
        {preview && showPreview && (
          <div className="mt-4">
            <PreviewPlayer 
              preview={preview}
              onRegenerate={handleRegeneratePreview}
            />
          </div>
        )}

        {/* Preview Info (when hidden) */}
        {preview && !showPreview && (
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Play className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium">Preview Available</span>
              </div>
              <div className="flex space-x-2">
                <Badge variant="secondary">{preview.format.toUpperCase()}</Badge>
                <Badge variant="outline">{formatFileSize(preview.fileSize)}</Badge>
              </div>
            </div>
            <div className="mt-2 text-sm text-gray-600">
              Duration: {Math.round(preview.duration)}s | 
              Quality: {preview.metadata.width}x{preview.metadata.height} | 
              FPS: {preview.metadata.fps.toFixed(1)}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}; 