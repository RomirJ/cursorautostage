import { generateSegments } from "../openai";
import { storage } from "../storage";

export async function processSegmentation(uploadId: string, transcriptText: string) {
  try {
    console.log(`Starting segmentation for upload ${uploadId}`);
    
    // Check if segments already exist
    const existingSegments = await storage.getSegmentsByUploadId(uploadId);
    if (existingSegments.length > 0) {
      console.log(`Segments already exist for upload ${uploadId}`);
      return existingSegments;
    }

    // Generate segments using AI
    const segmentResults = await generateSegments(transcriptText);
    
    // Convert to database format
    const segmentsToInsert = segmentResults.map((segment, idx) => ({
      uploadId,
      title: segment.title,
      summary: segment.summary,
      startTime: Number(segment.startTime),
      endTime: Number(segment.endTime),
      transcript: segment.transcript,
      order: idx,
    }));

    // Save segments to database
    const segments = await storage.createSegments(segmentsToInsert);
    
    console.log(`Segmentation completed for upload ${uploadId}, created ${segments.length} segments`);
    return segments;
    
  } catch (error) {
    const err = error as any;
    console.error(`Segmentation failed for upload ${uploadId}:`, err);
    throw new Error(`Segmentation failed: ${err.message}`);
  }
}
