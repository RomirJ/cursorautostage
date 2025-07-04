import { Router } from 'express';
import { enhancedUploadService } from './enhancedUploadService';
import * as enhancedAudioService from './enhancedAudioService';
import { abTestingService } from './abTestingService';
import { db } from './db';
import { uploads, transcripts, segments } from '../shared/schema';
import { eq } from 'drizzle-orm';
import multer from 'multer';

const router = Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB per chunk
  },
});

// Enhanced Upload Routes
router.post('/upload/initialize', enhancedUploadService.initializeUpload.bind(enhancedUploadService));
router.post('/upload/:uploadId/chunk', upload.single('chunk'), enhancedUploadService.uploadChunk.bind(enhancedUploadService));
router.get('/upload/:uploadId/progress', enhancedUploadService.getUploadProgress.bind(enhancedUploadService));
router.post('/upload/:uploadId/resume', enhancedUploadService.resumeUpload.bind(enhancedUploadService));
router.delete('/upload/:uploadId/cancel', enhancedUploadService.handleCancelUpload.bind(enhancedUploadService));

// Enhanced Audio Processing Routes
router.post('/audio/process', async (req, res) => {
  try {
    const { filePath, config } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }

    const result = await enhancedAudioService.processAudio(filePath, config);
    
    res.json({
      success: true,
      result
    });
  } catch (error) {
    console.error('Audio processing error:', error);
    res.status(500).json({ error: 'Audio processing failed' });
  }
});

router.post('/audio/analyze-quality', async (req, res) => {
  try {
    const { filePath } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }

    const analysis = await enhancedAudioService.analyzeAudioQuality(filePath);
    
    res.json({
      success: true,
      analysis
    });
  } catch (error) {
    console.error('Audio quality analysis error:', error);
    res.status(500).json({ error: 'Audio quality analysis failed' });
  }
});

router.post('/audio/batch-process', async (req, res) => {
  try {
    const { files } = req.body;
    
    if (!files || !Array.isArray(files)) {
      return res.status(400).json({ error: 'Files array is required' });
    }

    const results = await enhancedAudioService.batchProcessAudio(files);
    
    res.json({
      success: true,
      results
    });
  } catch (error) {
    console.error('Batch audio processing error:', error);
    res.status(500).json({ error: 'Batch audio processing failed' });
  }
});

// A/B Testing Routes
router.post('/ab-test/start', async (req, res) => {
  try {
    const config = req.body;
    
    // Validate required fields
    if (!config.userId || !config.contentId || !config.variations || config.variations.length < 2) {
      return res.status(400).json({ 
        error: 'userId, contentId, and at least 2 variations are required' 
      });
    }

    const result = await abTestingService.runTest(config);
    
    res.json({
      success: true,
      testId: result.testId,
      message: 'A/B test started successfully'
    });
  } catch (error) {
    console.error('A/B test start error:', error);
    res.status(500).json({ error: 'Failed to start A/B test' });
  }
});

router.get('/ab-test/:testId/results', async (req, res) => {
  try {
    const { testId } = req.params;
    
    const results = await abTestingService.getTestResults(testId);
    
    if (!results) {
      return res.status(404).json({ error: 'Test not found' });
    }
    
    res.json({
      success: true,
      results
    });
  } catch (error) {
    console.error('A/B test results error:', error);
    res.status(500).json({ error: 'Failed to get A/B test results' });
  }
});

router.get('/ab-test/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const tests = await abTestingService.listUserTests(userId);
    
    res.json({
      success: true,
      tests
    });
  } catch (error) {
    console.error('User A/B tests error:', error);
    res.status(500).json({ error: 'Failed to get user A/B tests' });
  }
});

// Enhanced Content Processing Pipeline
router.post('/content/process', async (req, res) => {
  try {
    const { uploadId, options } = req.body;
    
    if (!uploadId) {
      return res.status(400).json({ error: 'Upload ID is required' });
    }

    // Get upload record
    const upload = await db.select()
      .from(uploads)
      .where(eq(uploads.id, uploadId))
      .limit(1);

    if (upload.length === 0) {
      return res.status(404).json({ error: 'Upload not found' });
    }

    const uploadRecord = upload[0];
    const filePath = uploadRecord.filePath;

    // Process audio if it's an audio file
    if (uploadRecord.mimeType.startsWith('audio/')) {
      const audioConfig = {
        enableSpeakerDiarization: options?.enableSpeakerDiarization || false,
        noiseReductionLevel: options?.noiseReductionLevel || 'medium',
        loudnessTarget: options?.loudnessTarget || -16,
        enableTranscription: true,
        language: options?.language,
        customVocabulary: options?.customVocabulary,
        useAssemblyAI: options?.useAssemblyAI || false
      };

      const audioResult = await enhancedAudioService.processAudio(filePath, audioConfig);
      
      // Save transcript to database
      await db.insert(transcripts).values({
        uploadId,
        text: audioResult.transcript.text,
        wordTimestamps: audioResult.transcript.wordTimestamps,
        language: audioResult.transcript.language,
        confidence: audioResult.transcript.confidence
      });

      res.json({
        success: true,
        message: 'Content processed successfully',
        audioResult,
        cost: (audioResult as any).cost || 0
      });
    } else {
      res.json({
        success: true,
        message: 'Content processing completed (non-audio file)'
      });
    }

  } catch (error) {
    console.error('Content processing error:', error);
    res.status(500).json({ error: 'Content processing failed' });
  }
});

// Analytics and Insights Routes
router.get('/analytics/upload/:uploadId', async (req, res) => {
  try {
    const { uploadId } = req.params;
    
    // Get upload with related data
    const upload = await db.select()
      .from(uploads)
      .where(eq(uploads.id, uploadId))
      .limit(1);

    if (upload.length === 0) {
      return res.status(404).json({ error: 'Upload not found' });
    }

    const uploadRecord = upload[0];
    
    // Get transcript if exists
    const transcript = await db.select()
      .from(transcripts)
      .where(eq(transcripts.uploadId, uploadId))
      .limit(1);

    // Get segments if exist
    const segmentsList = await db.select()
      .from(segments)
      .where(eq(segments.uploadId, uploadId))
      .orderBy(segments.order);

    res.json({
      success: true,
      upload: uploadRecord,
      transcript: transcript[0] || null,
      segments: segmentsList,
      processingStatus: uploadRecord.status
    });

  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Failed to get analytics' });
  }
});

// Health Check Route
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    services: {
      upload: 'operational',
      audio: 'operational',
      abTesting: 'operational'
    },
    timestamp: new Date().toISOString()
  });
});

export default router; 