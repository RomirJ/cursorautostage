import express from 'express';
import fs from 'fs';
import path from 'path';
import { previewPlayer } from './previewPlayer';
import { storage } from './storage';

const router = express.Router();

/**
 * Generate instant preview for uploaded media
 * POST /api/preview/generate/:uploadId
 */
router.post('/generate/:uploadId', async (req, res) => {
  try {
    const { uploadId } = req.params;
    const options = req.body;

    // Validate upload exists
    const upload = await storage.getUpload(uploadId);
    if (!upload) {
      return res.status(404).json({ error: 'Upload not found' });
    }

    // Generate preview
    const preview = await previewPlayer.generatePreview(uploadId, options);
    
    res.json({
      success: true,
      preview,
      message: 'Preview generated successfully'
    });
  } catch (error) {
    console.error('Error generating preview:', error);
    res.status(500).json({ 
      error: 'Failed to generate preview',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Stream preview video/audio
 * GET /api/preview/stream/:previewId
 */
router.get('/stream/:previewId', async (req, res) => {
  try {
    const { previewId } = req.params;
    const preview = await previewPlayer.getPreview(previewId);
    
    if (!preview) {
      return res.status(404).json({ error: 'Preview not found' });
    }

    const filePath = path.join(
      process.cwd(), 
      'previews', 
      `${previewId}.${preview.format}`
    );

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Preview file not found' });
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      // Handle range requests for streaming
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(filePath, { start, end });
      
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': preview.format === 'mp4' ? 'video/mp4' : 'video/webm',
        'Cache-Control': 'public, max-age=31536000'
      };

      res.writeHead(206, head);
      file.pipe(res);
    } else {
      // Full file request
      const head = {
        'Content-Length': fileSize,
        'Content-Type': preview.format === 'mp4' ? 'video/mp4' : 'video/webm',
        'Cache-Control': 'public, max-age=31536000'
      };

      res.writeHead(200, head);
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (error) {
    console.error('Error streaming preview:', error);
    res.status(500).json({ error: 'Failed to stream preview' });
  }
});

/**
 * Serve preview thumbnail
 * GET /api/preview/thumbnail/:previewId
 */
router.get('/thumbnail/:previewId', async (req, res) => {
  try {
    const { previewId } = req.params;
    const thumbnailPath = path.join(process.cwd(), 'thumbnails', `${previewId}.jpg`);

    if (!fs.existsSync(thumbnailPath)) {
      return res.status(404).json({ error: 'Thumbnail not found' });
    }

    const stat = fs.statSync(thumbnailPath);
    res.writeHead(200, {
      'Content-Length': stat.size,
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000'
    });

    fs.createReadStream(thumbnailPath).pipe(res);
  } catch (error) {
    console.error('Error serving thumbnail:', error);
    res.status(500).json({ error: 'Failed to serve thumbnail' });
  }
});

/**
 * Get preview metadata
 * GET /api/preview/:previewId
 */
router.get('/:previewId', async (req, res) => {
  try {
    const { previewId } = req.params;
    const preview = await previewPlayer.getPreview(previewId);
    
    if (!preview) {
      return res.status(404).json({ error: 'Preview not found' });
    }

    res.json({
      success: true,
      preview
    });
  } catch (error) {
    console.error('Error getting preview:', error);
    res.status(500).json({ error: 'Failed to get preview' });
  }
});

/**
 * Delete preview
 * DELETE /api/preview/:previewId
 */
router.delete('/:previewId', async (req, res) => {
  try {
    const { previewId } = req.params;
    await previewPlayer.deletePreview(previewId);
    
    res.json({
      success: true,
      message: 'Preview deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting preview:', error);
    res.status(500).json({ error: 'Failed to delete preview' });
  }
});

/**
 * List all previews for an upload
 * GET /api/preview/upload/:uploadId
 */
router.get('/upload/:uploadId', async (req, res) => {
  try {
    const { uploadId } = req.params;
    
    // Validate upload exists
    const upload = await storage.getUpload(uploadId);
    if (!upload) {
      return res.status(404).json({ error: 'Upload not found' });
    }

    // For now, return empty array since we haven't implemented preview storage yet
    // TODO: Implement preview listing from database
    res.json({
      success: true,
      previews: []
    });
  } catch (error) {
    console.error('Error listing previews:', error);
    res.status(500).json({ error: 'Failed to list previews' });
  }
});

export default router; 