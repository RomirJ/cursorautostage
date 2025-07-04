# 🎬 Instant Preview Player

The Instant Preview Player is a comprehensive feature that automatically generates video/audio previews immediately after upload and provides a full-featured player interface.

## ✨ Features

### 🚀 **Instant Generation**
- **Automatic**: Previews are generated automatically after upload completion
- **Fast**: Uses optimized FFmpeg settings for quick generation
- **Smart**: Starts from 10% into the video for better content preview
- **Configurable**: Customizable duration, quality, and format options

### 🎥 **Full-Featured Player**
- **Video/Audio Playback**: Supports MP4, WebM formats
- **Controls**: Play/pause, seek, volume, fullscreen
- **Thumbnails**: Auto-generated preview thumbnails
- **Streaming**: HTTP range requests for smooth playback
- **Responsive**: Works on desktop and mobile devices

### 🔧 **Advanced Options**
- **Quality Settings**: Low, Medium, High quality options
- **Duration Control**: Configurable preview length (default: 10 seconds)
- **Format Support**: MP4 and WebM output formats
- **Audio Control**: Option to include/exclude audio
- **Thumbnail Generation**: Automatic thumbnail creation

## 🏗️ Architecture

### Backend Components

#### 1. **PreviewPlayer Service** (`server/previewPlayer.ts`)
```typescript
// Core preview generation service
class PreviewPlayer {
  async generatePreview(uploadId: string, options?: PreviewOptions): Promise<PreviewResult>
  async getPreview(previewId: string): Promise<PreviewResult | null>
  async deletePreview(previewId: string): Promise<void>
}
```

#### 2. **API Routes** (`server/previewRoutes.ts`)
```typescript
// RESTful API endpoints
POST /api/preview/generate/:uploadId    // Generate preview
GET  /api/preview/stream/:previewId     // Stream preview
GET  /api/preview/thumbnail/:previewId  // Serve thumbnail
GET  /api/preview/:previewId            // Get preview metadata
DELETE /api/preview/:previewId          // Delete preview
```

#### 3. **Supabase Integration**
- **Storage**: Downloads files from Supabase Storage for processing
- **Temporary Processing**: Uses local temp directory for FFmpeg operations
- **Cleanup**: Automatically removes temporary files after processing

### Frontend Components

#### 1. **PreviewPlayer Component** (`client/src/components/PreviewPlayer.tsx`)
```typescript
// Full-featured video player component
<PreviewPlayer 
  preview={previewData}
  onRegenerate={handleRegenerate}
  className="custom-styles"
/>
```

#### 2. **usePreview Hook** (`client/src/hooks/usePreview.ts`)
```typescript
// React hook for preview management
const { preview, isLoading, error, generatePreview, regeneratePreview } = usePreview();
```

#### 3. **UploadWithPreview Component** (`client/src/components/UploadWithPreview.tsx`)
```typescript
// Complete upload + preview workflow
<UploadWithPreview 
  uploadId="upload-123"
  filename="video.mp4"
  fileSize={1024000}
  status="completed"
/>
```

## 🚀 Usage

### Basic Usage

```typescript
import { usePreview } from '../hooks/usePreview';
import { PreviewPlayer } from '../components/PreviewPlayer';

function MyComponent() {
  const { preview, isLoading, generatePreview } = usePreview();

  const handleGenerate = async () => {
    await generatePreview('upload-123', {
      duration: 10,
      quality: 'medium',
      format: 'mp4',
      includeAudio: true,
      thumbnail: true
    });
  };

  return (
    <div>
      <button onClick={handleGenerate}>Generate Preview</button>
      {preview && <PreviewPlayer preview={preview} />}
    </div>
  );
}
```

### Advanced Configuration

```typescript
// High-quality preview with custom settings
const previewOptions = {
  duration: 15,           // 15 seconds
  quality: 'high',        // High quality (2000kbps)
  format: 'webm',         // WebM format for better compression
  includeAudio: true,     // Include audio
  thumbnail: true         // Generate thumbnail
};

await generatePreview(uploadId, previewOptions);
```

### Integration with Upload Flow

```typescript
// Automatically triggered after upload completion
async function handleUploadComplete(uploadId: string) {
  try {
    // Upload is already completed, now generate preview
    const preview = await generatePreview(uploadId);
    console.log('Preview ready:', preview.previewUrl);
  } catch (error) {
    console.error('Preview generation failed:', error);
  }
}
```

## 📊 API Reference

### PreviewOptions Interface

```typescript
interface PreviewOptions {
  duration?: number;        // Preview duration in seconds (default: 10)
  quality?: 'low' | 'medium' | 'high';  // Quality setting
  format?: 'mp4' | 'webm';  // Output format
  includeAudio?: boolean;   // Include audio in preview
  thumbnail?: boolean;      // Generate thumbnail
}
```

### PreviewResult Interface

```typescript
interface PreviewResult {
  previewId: string;        // Unique preview identifier
  previewUrl: string;       // Streaming URL
  thumbnailUrl?: string;    // Thumbnail URL (if generated)
  duration: number;         // Preview duration
  fileSize: number;         // File size in bytes
  format: string;           // Output format
  metadata: {
    width: number;          // Video width
    height: number;         // Video height
    fps: number;           // Frame rate
    bitrate: number;       // Bitrate in bits per second
  };
}
```

## 🔧 Configuration

### Environment Variables

```bash
# Required for FFmpeg operations
FFMPEG_PATH=/usr/local/bin/ffmpeg  # Optional: Custom FFmpeg path

# Supabase Storage (already configured)
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-service-key
```

### Quality Settings

| Quality | Video Bitrate | Use Case |
|---------|---------------|----------|
| Low     | 500kbps       | Fast generation, mobile preview |
| Medium  | 1000kbps      | Balanced quality/speed (default) |
| High    | 2000kbps      | High quality, desktop preview |

### Directory Structure

```
project/
├── previews/          # Generated preview files
├── thumbnails/        # Generated thumbnails
├── temp/             # Temporary processing files
└── uploads/          # Original uploads (if local)
```

## 🎯 Performance Optimization

### 1. **Parallel Processing**
- Preview generation runs asynchronously after upload
- Doesn't block the upload completion
- Uses background processing

### 2. **Smart Caching**
- Previews are cached locally after generation
- Thumbnails are served with long cache headers
- Streaming supports range requests

### 3. **Resource Management**
- Temporary files are automatically cleaned up
- Configurable quality settings for different use cases
- Memory-efficient streaming

### 4. **Error Handling**
- Graceful fallback if preview generation fails
- Upload completion is not affected by preview errors
- Retry mechanisms for failed generations

## 🔒 Security Considerations

### 1. **File Access**
- Previews are served through authenticated API routes
- Temporary files are isolated in dedicated directories
- Automatic cleanup prevents disk space issues

### 2. **Input Validation**
- File type validation before processing
- Size limits and duration caps
- Sanitized file paths

### 3. **Rate Limiting**
- API endpoints can be rate-limited
- Processing queue management
- Resource usage monitoring

## 🧪 Testing

### Manual Testing

```bash
# Test preview generation
curl -X POST http://localhost:3000/api/preview/generate/upload-123 \
  -H "Content-Type: application/json" \
  -d '{"duration": 10, "quality": "medium"}'

# Test preview streaming
curl http://localhost:3000/api/preview/stream/preview-456

# Test thumbnail serving
curl http://localhost:3000/api/preview/thumbnail/preview-456
```

### Automated Testing

```typescript
// Test preview generation
describe('PreviewPlayer', () => {
  it('should generate preview from Supabase Storage', async () => {
    const preview = await previewPlayer.generatePreview('test-upload-id');
    expect(preview).toHaveProperty('previewId');
    expect(preview).toHaveProperty('previewUrl');
  });
});
```

## 🚀 Deployment

### Prerequisites

1. **FFmpeg Installation**
   ```bash
   # macOS
   brew install ffmpeg
   
   # Ubuntu
   sudo apt update && sudo apt install ffmpeg
   
   # Windows
   # Download from https://ffmpeg.org/download.html
   ```

2. **Node.js Dependencies**
   ```bash
   npm install fluent-ffmpeg @types/fluent-ffmpeg
   ```

3. **Supabase Storage**
   - Configure storage bucket
   - Set up proper permissions
   - Ensure service role key has access

### Production Considerations

1. **Resource Limits**
   - Monitor disk space for temp files
   - Set appropriate memory limits
   - Configure concurrent processing limits

2. **CDN Integration**
   - Serve previews through CDN
   - Configure proper cache headers
   - Optimize for global delivery

3. **Monitoring**
   - Track preview generation success rates
   - Monitor processing times
   - Alert on failures

## 🎉 Benefits

### For Users
- **Instant Feedback**: See content immediately after upload
- **Quality Assurance**: Verify content before processing
- **Better UX**: Professional video player interface
- **Mobile Friendly**: Works on all devices

### For Developers
- **Modular Design**: Easy to integrate and extend
- **Type Safety**: Full TypeScript support
- **Error Handling**: Robust error management
- **Performance**: Optimized for speed and efficiency

### For Business
- **User Retention**: Better upload experience
- **Content Quality**: Users can verify before publishing
- **Reduced Support**: Fewer upload-related issues
- **Professional Feel**: Enterprise-grade features

---

**The Instant Preview Player transforms the upload experience from a black box into an interactive, immediate feedback system that users love!** 🚀 