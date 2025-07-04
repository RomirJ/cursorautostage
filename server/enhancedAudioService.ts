/**
 * Enhanced Audio Service
 *
 * Note: Requires the 'assemblyai' npm package. Install with:
 *   npm install assemblyai
 */

import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
let AssemblyAI;
try {
  AssemblyAI = require('assemblyai').AssemblyAI;
} catch (e) {
  throw new Error("The 'assemblyai' package is not installed. Please run 'npm install assemblyai' in your project root.");
}

const unlinkAsync = promisify(fs.unlink);

const assembly = new AssemblyAI({ apiKey: process.env.ASSEMBLY_AI_API_KEY });

export interface AudioProcessingConfig {
  enableSpeakerDiarization?: boolean;
  noiseReductionLevel?: 'low' | 'medium' | 'high';
  loudnessTarget?: number; // LUFS
  enableTranscription?: boolean;
  language?: string;
  useAssemblyAI?: boolean;
}

export interface AudioProcessingResult {
  transcript?: any;
  diarization?: any;
  processedAudioPath: string;
  metadata: any;
}

function getNoiseReductionFilter(level: 'low' | 'medium' | 'high' = 'medium') {
  switch (level) {
    case 'low':
      return 'afftdn=nf=-20';
    case 'high':
      return 'afftdn=nf=-35';
    case 'medium':
    default:
      return 'afftdn=nf=-25';
  }
}

export async function processAudio(
  inputPath: string,
  config: AudioProcessingConfig = {}
): Promise<AudioProcessingResult> {
  // 1. Preprocess audio with FFmpeg (noise reduction, loudness normalization)
  const outputPath = path.join(
    path.dirname(inputPath),
    `processed_${path.basename(inputPath)}`
  );

  await new Promise((resolve, reject) => {
    let command = ffmpeg(inputPath)
      .audioCodec('pcm_s16le')
      .audioChannels(1)
      .audioFrequency(16000)
      .outputOptions('-ar', '16000');

    if (config.noiseReductionLevel) {
      command = command.audioFilters(getNoiseReductionFilter(config.noiseReductionLevel));
    }
    if (config.loudnessTarget !== undefined) {
      command = command.audioFilters(`loudnorm=I=${config.loudnessTarget}:TP=-1.5:LRA=11`);
    }

    command
      .on('end', resolve)
      .on('error', reject)
      .save(outputPath);
  });

  // 2. Transcription & Diarization (AssemblyAI)
  let transcript = null;
  let diarization = null;
  if (config.enableTranscription || config.enableSpeakerDiarization) {
    const uploadRes = await assembly.upload(fs.createReadStream(outputPath));
    const transcriptRes = await assembly.transcripts.create({
      audio_url: uploadRes.upload_url,
      speaker_labels: !!config.enableSpeakerDiarization,
      language_code: config.language || 'en',
    });

    // Wait for transcript to complete
    let status = transcriptRes.status;
    let transcriptId = transcriptRes.id;
    let pollCount = 0;
    while (status !== 'completed' && status !== 'error' && pollCount < 60) {
      await new Promise(r => setTimeout(r, 5000));
      const poll = await assembly.transcripts.get(transcriptId);
      status = poll.status;
      if (status === 'completed') {
        transcript = poll;
        if (config.enableSpeakerDiarization) {
          diarization = poll.utterances || poll.words;
        }
      }
      pollCount++;
    }
    if (status !== 'completed') {
      throw new Error('AssemblyAI transcription failed or timed out');
    }
  }

  // 3. Collect metadata
  const metadata = {
    noiseReductionLevel: config.noiseReductionLevel,
    loudnessTarget: config.loudnessTarget,
    enableSpeakerDiarization: config.enableSpeakerDiarization,
    language: config.language || 'en',
    processedAt: new Date().toISOString(),
  };

  // 4. Cleanup (optional)
  // await unlinkAsync(inputPath); // Uncomment if you want to delete original

  return {
    transcript,
    diarization,
    processedAudioPath: outputPath,
    metadata,
  };
}

export async function analyzeAudioQuality(filePath: string): Promise<any> {
  // Basic audio quality analysis using FFmpeg
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }

      const audioStream = metadata.streams.find((stream: any) => stream.codec_type === 'audio');
      if (!audioStream) {
        reject(new Error('No audio stream found'));
        return;
      }

      const sampleRate = Number(audioStream.sample_rate) || 0;
      const channels = Number(audioStream.channels) || 0;
      const bitrate = Number(audioStream.bit_rate) || 0;

      const analysis = {
        duration: audioStream.duration,
        sampleRate: sampleRate,
        channels: channels,
        bitrate: bitrate,
        codec: audioStream.codec_name,
        quality: {
          sampleRate: sampleRate >= 44100 ? 'good' : 'poor',
          channels: channels >= 2 ? 'stereo' : 'mono',
          bitrate: bitrate >= 128000 ? 'good' : 'poor'
        }
      };

      resolve(analysis);
    });
  });
}

export async function batchProcessAudio(files: Array<{ filePath: string; config?: AudioProcessingConfig }>): Promise<AudioProcessingResult[]> {
  const results: AudioProcessingResult[] = [];

  for (const file of files) {
    try {
      const result = await processAudio(file.filePath, file.config);
      results.push(result);
    } catch (error) {
      console.error(`Failed to process ${file.filePath}:`, error);
      // Add error result
      results.push({
        processedAudioPath: file.filePath,
        metadata: { error: error instanceof Error ? error.message : 'Unknown error' }
      });
    }
  }

  return results;
} 