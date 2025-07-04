import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface AdScriptInput {
  productName: string;
  description: string;
  targetAudience: string;
  callToAction?: string;
  tone?: 'enthusiastic' | 'professional' | 'dramatic' | 'playful';
  duration?: '15s' | '30s' | '60s';
}

export interface GeneratedAdScript {
  script: string;
  hook: string;
  callToAction: string;
}

export class AdScriptService {
  async generateAdScript(input: AdScriptInput): Promise<GeneratedAdScript> {
    const prompt = `Create a YouTube video ad script.
Product: ${input.productName}
Description: ${input.description}
Target Audience: ${input.targetAudience}
Tone: ${input.tone || 'enthusiastic'}
Length: ${input.duration || '30s'}
${input.callToAction ? `Call to Action: ${input.callToAction}` : ''}

Return JSON: {"script":"","hook":"","callToAction":""}`;
    try {
      const res = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.7
      });
      const data = JSON.parse(res.choices[0].message.content || '{}');
      return {
        script: data.script || '',
        hook: data.hook || '',
        callToAction: data.callToAction || input.callToAction || ''
      };
    } catch (error) {
      console.error('[AdScriptService] Error generating ad script:', error);
      throw error;
    }
  }
}

export const adScriptService = new AdScriptService();
