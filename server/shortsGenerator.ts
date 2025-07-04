import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import path from 'path';
import fs from 'fs/promises';
import { Segment } from '@shared/schema';

// Set FFmpeg path
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

interface ShortsConfig {
  width: number;
  height: number;
  subtitleStyle: {
    fontsize: number;
    fontcolor: string;
    fontfamily: string;
    boxcolor: string;
    boxborderw: number;
  };
  introOutroConfig?: {
    intro?: {
      duration: number;
      text: string;
      backgroundColor: string;
    };
    outro?: {
      duration: number;
      text: string;
      backgroundColor: string;
    };
  };
}

interface ShortsResult {
  outputPath: string;
  duration: number;
  size: number;
  format: string;
  resolution: string;
}

export class ShortsGenerator {
  private defaultConfig: ShortsConfig = {
    width: 1080,
    height: 1920, // 9:16 aspect ratio
    subtitleStyle: {
      fontsize: 48,
      fontcolor: 'white',
      fontfamily: 'Arial',
      boxcolor: 'black@0.7',
      boxborderw: 8
    }
  };

  async generateVerticalShort(
    originalVideoPath: string,
    segment: Segment,
    outputDir: string,
    config?: Partial<ShortsConfig>
  ): Promise<ShortsResult> {
    const finalConfig = { ...this.defaultConfig, ...config };
    const outputPath = path.join(outputDir, `short_${segment.id}.mp4`);

    try {
      // Ensure output directory exists
      await fs.mkdir(outputDir, { recursive: true });

      // Generate SRT subtitle file
      const srtPath = await this.generateSRTFile(segment, outputDir);

      // Calculate start and end times
      const startTime = parseFloat(segment.startTime);
      const endTime = parseFloat(segment.endTime);
      const duration = endTime - startTime;

      const tempMain = path.join(outputDir, `main_${segment.id}.mp4`);

      // First generate the processed clip
      await new Promise<void>((resolve, reject) => {
        ffmpeg(originalVideoPath)
          .seekInput(startTime)
          .duration(duration)
          .videoFilters([
            `scale=${finalConfig.width}:${finalConfig.height}:force_original_aspect_ratio=increase`,
            `crop=${finalConfig.width}:${finalConfig.height}`,
            `subtitles=${srtPath}:force_style='FontSize=${finalConfig.subtitleStyle.fontsize},FontName=${finalConfig.subtitleStyle.fontfamily},PrimaryColour=${this.convertColorToASS(finalConfig.subtitleStyle.fontcolor)},OutlineColour=${this.convertColorToASS(finalConfig.subtitleStyle.boxcolor)},BorderStyle=3,Outline=${finalConfig.subtitleStyle.boxborderw}'`
          ])
          .videoCodec('libx264')
          .audioCodec('aac')
          .audioBitrate('128k')
          .videoBitrate('2000k')
          .fps(30)
          .format('mp4')
          .outputOptions(['-preset fast', '-crf 23', '-movflags +faststart'])
          .output(tempMain)
          .on('end', () => resolve())
          .on('error', err => reject(err))
          .run();
      });

      // Cleanup SRT
      await fs.unlink(srtPath).catch(() => {});

      let finalPath = tempMain;

      if (finalConfig.introOutroConfig?.intro || finalConfig.introOutroConfig?.outro) {
        finalPath = await this.addIntroOutro(tempMain, finalConfig, outputDir);
      }

      if (finalPath !== outputPath) {
        await fs.rename(finalPath, outputPath);
      }

      const stats = await fs.stat(outputPath);
      const result: ShortsResult = {
        outputPath,
        duration,
        size: stats.size,
        format: 'mp4',
        resolution: `${finalConfig.width}x${finalConfig.height}`
      };

      // Cleanup temp files
      if (finalPath !== tempMain) await fs.unlink(tempMain).catch(() => {});

      return result;
    } catch (error) {
      console.error('[ShortsGenerator] Error generating vertical short:', error);
      throw error;
    }
  }

  private async generateSRTFile(segment: Segment, outputDir: string): Promise<string> {
    const srtPath = path.join(outputDir, `subtitle_${segment.id}.srt`);
    
    // Generate simple SRT content based on segment transcript
    const transcript = segment.transcript || segment.summary || '';
    const words = transcript.split(' ');
    const wordsPerSubtitle = 8;
    const duration = parseFloat(segment.endTime) - parseFloat(segment.startTime);
    const subtitleDuration = duration / Math.ceil(words.length / wordsPerSubtitle);
    
    let srtContent = '';
    let subtitleIndex = 1;
    
    for (let i = 0; i < words.length; i += wordsPerSubtitle) {
      const subtitleWords = words.slice(i, i + wordsPerSubtitle);
      const startTime = (i / wordsPerSubtitle) * subtitleDuration;
      const endTime = Math.min(((i / wordsPerSubtitle) + 1) * subtitleDuration, duration);
      
      srtContent += `${subtitleIndex}\n`;
      srtContent += `${this.formatSRTTime(startTime)} --> ${this.formatSRTTime(endTime)}\n`;
      srtContent += `${subtitleWords.join(' ')}\n\n`;
      
      subtitleIndex++;
    }
    
    await fs.writeFile(srtPath, srtContent, 'utf-8');
    return srtPath;
  }

  private formatSRTTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const milliseconds = Math.floor((seconds % 1) * 1000);
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${milliseconds.toString().padStart(3, '0')}`;
  }

  private convertColorToASS(color: string): string {
    // Convert CSS color names to ASS format (BGR hex)
    const colorMap: { [key: string]: string } = {
      'white': '&HFFFFFF',
      'black': '&H000000',
      'red': '&H0000FF',
      'green': '&H00FF00',
      'blue': '&HFF0000',
      'yellow': '&H00FFFF'
    };
    
    return colorMap[color.toLowerCase()] || '&HFFFFFF';
  }

  private async addIntroOutro(
    mainVideoPath: string,
    config: ShortsConfig,
    outputDir: string
  ): Promise<string> {
    const inputs: string[] = [];

    const makeClip = async (
      text: string,
      duration: number,
      background: string,
      filename: string
    ): Promise<string> => {
      const outPath = path.join(outputDir, filename);
      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(`color=c=${background}:s=${config.width}x${config.height}:d=${duration}`)
          .inputFormat('lavfi')
          .input('anullsrc=r=44100:cl=stereo')
          .inputFormat('lavfi')
          .videoFilters(
            `drawtext=text='${text.replace(/'/g, "\u2019")}'` +
            `:fontcolor=white:fontsize=64:x=(w-text_w)/2:y=(h-text_h)/2`
          )
          .audioCodec('aac')
          .videoCodec('libx264')
          .outputOptions(['-t', String(duration), '-pix_fmt', 'yuv420p'])
          .output(outPath)
          .on('end', () => resolve())
          .on('error', err => reject(err))
          .run();
      });
      return outPath;
    };

    if (config.introOutroConfig?.intro) {
      const intro = config.introOutroConfig.intro;
      const clip = await makeClip(
        intro.text,
        intro.duration,
        intro.backgroundColor || 'black',
        `intro_${Date.now()}.mp4`
      );
      inputs.push(clip);
    }

    inputs.push(mainVideoPath);

    if (config.introOutroConfig?.outro) {
      const outro = config.introOutroConfig.outro;
      const clip = await makeClip(
        outro.text,
        outro.duration,
        outro.backgroundColor || 'black',
        `outro_${Date.now()}.mp4`
      );
      inputs.push(clip);
    }

    if (inputs.length === 1) return mainVideoPath;

    const concatPath = path.join(outputDir, `concat_${Date.now()}.mp4`);

    await new Promise<void>((resolve, reject) => {
      const cmd = ffmpeg();
      inputs.forEach(i => cmd.input(i));
      const concatInputs = inputs.map((_, idx) => `[${idx}:v:0][${idx}:a:0]`).join('');
      const filter = `${concatInputs}concat=n=${inputs.length}:v=1:a=1[v][a]`;
      cmd
        .complexFilter([filter])
        .outputOptions(['-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-c:a', 'aac', '-preset', 'fast', '-crf', '23', '-movflags', '+faststart'])
        .output(concatPath)
        .on('end', () => resolve())
        .on('error', err => reject(err))
        .run();
    });

    // cleanup
    await Promise.all(inputs.filter(p => p !== mainVideoPath).map(p => fs.unlink(p).catch(() => {})));
    return concatPath;
  }

  async batchGenerateShorts(
    originalVideoPath: string,
    segments: Segment[],
    outputDir: string,
    config?: Partial<ShortsConfig>
  ): Promise<ShortsResult[]> {
    const results: ShortsResult[] = [];
    
    console.log(`[ShortsGenerator] Generating ${segments.length} vertical shorts...`);
    
    for (const segment of segments) {
      try {
        const result = await this.generateVerticalShort(originalVideoPath, segment, outputDir, config);
        results.push(result);
        console.log(`[ShortsGenerator] Generated short for segment ${segment.id}: ${result.outputPath}`);
      } catch (error) {
        console.error(`[ShortsGenerator] Failed to generate short for segment ${segment.id}:`, error);
      }
    }
    
    return results;
  }

  async getVideoInfo(videoPath: string): Promise<{
    duration: number;
    width: number;
    height: number;
    format: string;
  }> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err: any, metadata: any) => {
        if (err) {
          reject(err);
          return;
        }
        
        const videoStream = metadata.streams.find((stream: any) => stream.codec_type === 'video');
        if (!videoStream) {
          reject(new Error('No video stream found'));
          return;
        }
        
        resolve({
          duration: metadata.format.duration || 0,
          width: videoStream.width || 0,
          height: videoStream.height || 0,
          format: metadata.format.format_name || 'unknown'
        });
      });
    });
  }
}

export const shortsGenerator = new ShortsGenerator();