import { promises as fs } from 'fs';
import path from 'path';
// @ts-ignore optional dependency
import { chromium, Browser } from 'playwright';

interface ThumbnailOptions {
  width: number;
  height: number;
  brandColor: string;
  textColor: string;
  logo?: string;
}

export class ThumbnailGenerator {
  private browser: Browser | null = null;

  private async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await chromium.launch();
    }
    return this.browser;
  }

  async generateThumbnail(title: string, options: ThumbnailOptions): Promise<Buffer> {
    const browser = await this.getBrowser();
    const page = await browser.newPage({
      viewport: { width: options.width, height: options.height }
    });

    const html = `<!DOCTYPE html>
      <html>
      <body style="margin:0;display:flex;align-items:center;justify-content:center;background:${options.brandColor};color:${options.textColor};font-family:Arial;font-size:64px;position:relative;">
        ${options.logo ? `<img src="${options.logo}" style="position:absolute;top:40px;left:40px;width:150px" />` : ''}
        <div style="text-align:center;padding:40px;">${title}</div>
      </body>
      </html>`;

    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    const buffer = await page.screenshot({ type: 'png' });
    await page.close();
    return buffer;
  }

  async saveThumbnail(buffer: Buffer, outputDir: string): Promise<string> {
    await fs.mkdir(outputDir, { recursive: true });
    const filename = `thumbnail_${Date.now()}.png`;
    const filePath = path.join(outputDir, filename);
    await fs.writeFile(filePath, buffer);
    return filePath;
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

export const thumbnailGenerator = new ThumbnailGenerator();
