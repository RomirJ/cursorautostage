import { useState, useCallback } from 'react';

interface PreviewOptions {
  duration?: number;
  quality?: 'low' | 'medium' | 'high';
  format?: 'mp4' | 'webm';
  includeAudio?: boolean;
  thumbnail?: boolean;
}

interface PreviewMetadata {
  width: number;
  height: number;
  fps: number;
  bitrate: number;
}

interface PreviewData {
  previewId: string;
  previewUrl: string;
  thumbnailUrl?: string;
  duration: number;
  fileSize: number;
  format: string;
  metadata: PreviewMetadata;
}

interface UsePreviewReturn {
  preview: PreviewData | null;
  isLoading: boolean;
  error: string | null;
  generatePreview: (uploadId: string, options?: PreviewOptions) => Promise<void>;
  clearPreview: () => void;
  regeneratePreview: (options?: PreviewOptions) => Promise<void>;
}

export const usePreview = (): UsePreviewReturn => {
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentUploadId, setCurrentUploadId] = useState<string | null>(null);

  const generatePreview = useCallback(async (
    uploadId: string, 
    options: PreviewOptions = {}
  ) => {
    setIsLoading(true);
    setError(null);
    setCurrentUploadId(uploadId);

    try {
      const response = await fetch(`/api/preview/generate/${uploadId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(options),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate preview');
      }

      const data = await response.json();
      setPreview(data.preview);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error('Error generating preview:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const regeneratePreview = useCallback(async (options?: PreviewOptions) => {
    if (!currentUploadId) {
      setError('No upload ID available for regeneration');
      return;
    }

    await generatePreview(currentUploadId, options);
  }, [currentUploadId, generatePreview]);

  const clearPreview = useCallback(() => {
    setPreview(null);
    setError(null);
    setCurrentUploadId(null);
  }, []);

  return {
    preview,
    isLoading,
    error,
    generatePreview,
    clearPreview,
    regeneratePreview,
  };
}; 