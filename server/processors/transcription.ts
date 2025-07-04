import { transcribeAudio } from "../openai";
import { storage } from "../storage";
import type { Upload } from "@shared/schema";
import path from "path";

export async function processTranscription(upload: Upload) {
  try {
    console.log(`Starting transcription for upload ${upload.id}`);
    
    // Check if transcript already exists
    const existingTranscript = await storage.getTranscriptByUploadId(upload.id);
    if (existingTranscript) {
      console.log(`Transcript already exists for upload ${upload.id}`);
      return existingTranscript;
    }

    // Perform transcription
    const transcriptionResult = await transcribeAudio(upload.filePath);
    
    // Save transcript to database
    const transcript = await storage.createTranscript({
      uploadId: upload.id,
      text: transcriptionResult.text,
      wordTimestamps: transcriptionResult.words ? 
        transcriptionResult.words.reduce((acc: Record<string, number>, word: any) => {
          acc[word.word] = word.start;
          return acc;
        }, {}) : undefined,
      language: transcriptionResult.language,
              confidence: transcriptionResult.duration ? Number(transcriptionResult.duration) : undefined,
    });

    console.log(`Transcription completed for upload ${upload.id}`);
    return transcript;
    
  } catch (error) {
    const err = error as Error;
    console.error(`Transcription failed for upload ${upload.id}:`, err);
    throw new Error(`Transcription failed: ${err.message}`);
  }
}
