import OpenAI from 'openai';
import { storage } from './storage';
import { type VoiceProfile as DBVoiceProfile } from '@shared/schema';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface VoiceProfile {
  userId: string;
  name: string;
  description: string | null;
  sampleTexts: string[] | null;
  embedding: number[] | null;
  characteristics: Record<string, any> | null;
  platformAdaptations: Record<string, any> | null;
  isActive: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
}

interface VoiceAnalysis {
  similarity: number;
  matchingCharacteristics: string[];
  suggestions: string[];
  adaptedContent: string;
}

export class BrandVoiceService {
  private profileCache: Map<string, DBVoiceProfile[]> = new Map();
  private embeddingCache: Map<string, number[]> = new Map();

  constructor() {
    this.startBackgroundWorker();
  }

  // Voice Profile Management
  async createVoiceProfile(userId: string, profileData: {
    name: string;
    description: string;
    sampleTexts: string[];
    characteristics: DBVoiceProfile['characteristics'];
    platformAdaptations?: DBVoiceProfile['platformAdaptations'];
  }): Promise<DBVoiceProfile> {
    try {
      // Generate embedding from sample texts
      const embedding = await this.generateVoiceEmbedding(profileData.sampleTexts);
      
      const profile = await storage.createVoiceProfile({
        userId,
        name: profileData.name,
        description: profileData.description,
        sampleTexts: profileData.sampleTexts,
        embedding,
        characteristics: profileData.characteristics as any,
        platformAdaptations: profileData.platformAdaptations || this.getDefaultPlatformAdaptations(),
        isActive: true,
        lastTrainedAt: new Date(),
      });

      const userProfiles = this.profileCache.get(userId) || [];
      userProfiles.push(profile);
      this.profileCache.set(userId, userProfiles);

      console.log(`[BrandVoice] Created voice profile: ${profile.name} for user ${userId}`);
      return profile;
    } catch (error) {
      console.error('[BrandVoice] Error creating voice profile:', error);
      throw error;
    }
  }

  private async generateVoiceEmbedding(sampleTexts: string[]): Promise<number[]> {
    try {
      // Combine sample texts into a representative corpus
      const combinedText = sampleTexts.join('\n\n');
      
      // Check cache first
      const cacheKey = this.hashText(combinedText);
      if (this.embeddingCache.has(cacheKey)) {
        return this.embeddingCache.get(cacheKey)!;
      }

      // Generate embedding using OpenAI
      const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: combinedText,
        encoding_format: "float"
      });

      const embedding = response.data[0].embedding;
      this.embeddingCache.set(cacheKey, embedding);
      
      return embedding;
    } catch (error) {
      console.error('[BrandVoice] Error generating embedding:', error);
      throw error;
    }
  }

  private hashText(text: string): string {
    // Simple hash function for caching
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString();
  }

  async updateVoiceProfile(userId: string, profileName: string, updates: Partial<DBVoiceProfile>): Promise<DBVoiceProfile | null> {
    const profiles = await this.getUserVoiceProfiles(userId);
    const profileIndex = profiles.findIndex(p => p.name === profileName);

    if (profileIndex === -1) return null;

    const profile = profiles[profileIndex];
    
    if (updates.sampleTexts && updates.sampleTexts !== profile.sampleTexts) {
      updates.embedding = await this.generateVoiceEmbedding(updates.sampleTexts);
    }

    const updated = { ...profile, ...updates, updatedAt: new Date() };
    await storage.updateVoiceProfile(profile.id, updates);

    const profilesUpdated = [...profiles];
    profilesUpdated[profileIndex] = updated as DBVoiceProfile;
    this.profileCache.set(userId, profilesUpdated);
    return updated as DBVoiceProfile;
  }

  async getUserVoiceProfiles(userId: string): Promise<DBVoiceProfile[]> {
    if (this.profileCache.has(userId)) {
      return this.profileCache.get(userId)!;
    }
    const profiles = await storage.getVoiceProfilesByUser(userId);
    this.profileCache.set(userId, profiles);
    return profiles;
  }

  async getActiveVoiceProfile(userId: string): Promise<DBVoiceProfile | null> {
    const profiles = await this.getUserVoiceProfiles(userId);
    return profiles.find(p => p.isActive) || null;
  }

  // Content Analysis and Matching
  async analyzeContentVoiceMatch(userId: string, content: string, targetProfile?: string): Promise<VoiceAnalysis> {
    try {
      const profiles = await this.getUserVoiceProfiles(userId);
      const profile = targetProfile 
        ? profiles.find(p => p.name === targetProfile)
        : profiles.find(p => p.isActive);

      if (!profile) {
        throw new Error('No voice profile found');
      }

      // Generate embedding for the content
      const contentEmbedding = await this.generateContentEmbedding(content);
      
      // Calculate similarity
      const similarity = this.calculateCosineSimilarity(contentEmbedding, profile.embedding || []);
      
      // Analyze characteristics match
      const characteristicsAnalysis = await this.analyzeCharacteristics(content, profile.characteristics || {});
      
      // Generate improvement suggestions
      const suggestions = await this.generateVoiceImprovementSuggestions(content, profile as any, similarity);
      
      // Adapt content to match voice
      const adaptedContent = await this.adaptContentToVoice(content, profile as any);

      return {
        similarity,
        matchingCharacteristics: characteristicsAnalysis.matching,
        suggestions,
        adaptedContent
      };
    } catch (error) {
      console.error('[BrandVoice] Error analyzing voice match:', error);
      throw error;
    }
  }

  private async generateContentEmbedding(content: string): Promise<number[]> {
    const cacheKey = this.hashText(content);
    if (this.embeddingCache.has(cacheKey)) {
      return this.embeddingCache.get(cacheKey)!;
    }

    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: content,
      encoding_format: "float"
    });

    const embedding = response.data[0].embedding;
    this.embeddingCache.set(cacheKey, embedding);
    
    return embedding;
  }

  private calculateCosineSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length !== embedding2.length) {
      throw new Error('Embeddings must have the same length');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  private async analyzeCharacteristics(content: string, targetCharacteristics: VoiceProfile['characteristics']): Promise<{
    matching: string[];
    nonMatching: string[];
  }> {
    try {
      const prompt = `
        Analyze this content against the target voice characteristics:
        
        Content: "${content}"
        
        Target Characteristics:
        - Tone: ${targetCharacteristics?.tone || 'neutral'}
        - Formality: ${targetCharacteristics?.formality || 'mixed'}
        - Length Preference: ${targetCharacteristics?.lengthPreference || 'medium'}
        - Emoji Usage: ${targetCharacteristics?.emojiUsage || 'minimal'}
        - Hashtag Style: ${targetCharacteristics?.hashtagStyle || 'minimal'}
        - CTA Style: ${targetCharacteristics?.callToActionStyle || 'subtle'}
        
        Return JSON: {
          "matching": ["characteristic1", "characteristic2"],
          "nonMatching": ["characteristic3", "characteristic4"]
        }
      `;

      const response = await openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
      });

      const analysis = JSON.parse(response.choices[0].message.content || '{"matching":[],"nonMatching":[]}');
      return analysis;
    } catch (error) {
      console.error('[BrandVoice] Error analyzing characteristics:', error);
      return { matching: [], nonMatching: [] };
    }
  }

  private async generateVoiceImprovementSuggestions(
    content: string, 
    profile: VoiceProfile, 
    similarity: number
  ): Promise<string[]> {
    try {
      const prompt = `
        Generate specific improvement suggestions to better match this content to the brand voice:
        
        Content: "${content}"
        Current similarity: ${(similarity * 100).toFixed(1)}%
        
        Target Voice Profile:
        - Name: ${profile.name}
        - Description: ${profile.description || 'No description'}
        - Tone: ${profile.characteristics?.tone || 'neutral'}
        - Formality: ${profile.characteristics?.formality || 'mixed'}
        - Sample texts: ${(profile.sampleTexts || []).slice(0, 2).join(' | ')}
        
        Provide 3-5 specific, actionable suggestions as a JSON array of strings.
        Focus on concrete changes, not general advice.
      `;

      const response = await openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
      });

      const result = JSON.parse(response.choices[0].message.content || '{"suggestions":[]}');
      return result.suggestions || [];
    } catch (error) {
      console.error('[BrandVoice] Error generating suggestions:', error);
      return ['Review tone consistency with brand voice', 'Adjust formality level', 'Consider emoji usage preferences'];
    }
  }

  private async adaptContentToVoice(content: string, profile: VoiceProfile): Promise<string> {
    try {
      const prompt = `
        Adapt this content to match the specified brand voice while preserving the core message:
        
        Original Content: "${content}"
        
        Brand Voice Profile:
        - Name: ${profile.name}
        - Description: ${profile.description || 'No description'}
        - Tone: ${profile.characteristics?.tone || 'neutral'}
        - Formality: ${profile.characteristics?.formality || 'mixed'}
        - Length Preference: ${profile.characteristics?.lengthPreference || 'medium'}
        - Emoji Usage: ${profile.characteristics?.emojiUsage || 'minimal'}
        - Hashtag Style: ${profile.characteristics?.hashtagStyle || 'minimal'}
        - CTA Style: ${profile.characteristics?.callToActionStyle || 'subtle'}
        
        Sample Texts for Reference:
        ${(profile.sampleTexts || []).slice(0, 3).map((text, i) => `${i + 1}. "${text}"`).join('\n')}
        
        Return only the adapted content, nothing else.
      `;

      const response = await openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [{ role: "user", content: prompt }],
        max_tokens: 500,
        temperature: 0.7
      });

      return response.choices[0].message.content?.trim() || content;
    } catch (error) {
      console.error('[BrandVoice] Error adapting content:', error);
      return content;
    }
  }

  // Platform-specific adaptations
  async adaptContentForPlatform(
    userId: string, 
    content: string, 
    platform: string, 
    profileName?: string
  ): Promise<string> {
    try {
      const profiles = await this.getUserVoiceProfiles(userId);
      const profile = profileName 
        ? profiles.find(p => p.name === profileName)
        : profiles.find(p => p.isActive);

      if (!profile) {
        return content;
      }

      const platformConfig = profile.platformAdaptations?.[platform];
      if (!platformConfig) {
        return content;
      }

      const prompt = `
        Adapt this content for ${platform} while maintaining the brand voice:
        
        Original Content: "${content}"
        Platform: ${platform}
        Max Length: ${platformConfig.maxLength} characters
        Format Preferences: ${platformConfig.formatPreferences.join(', ')}
        ${platformConfig.specificTone ? `Platform-specific tone: ${platformConfig.specificTone}` : ''}
        
        Brand Voice:
        - Tone: ${profile.characteristics?.tone || 'neutral'}
        - Formality: ${profile.characteristics?.formality || 'mixed'}
        - Emoji Usage: ${profile.characteristics?.emojiUsage || 'minimal'}
        
        Return only the adapted content for ${platform}.
      `;

      const response = await openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [{ role: "user", content: prompt }],
        max_tokens: 300,
        temperature: 0.7
      });

      const adaptedContent = response.choices[0].message.content?.trim() || content;
      
      // Ensure length constraints
      if (adaptedContent.length > platformConfig.maxLength) {
        return adaptedContent.substring(0, platformConfig.maxLength - 3) + '...';
      }

      return adaptedContent;
    } catch (error) {
      console.error('[BrandVoice] Error adapting for platform:', error);
      return content;
    }
  }

  // Training and improvement
  async learnFromContent(userId: string, content: string, profileName?: string): Promise<void> {
    try {
      const profiles = await this.getUserVoiceProfiles(userId);
      const profile = profileName 
        ? profiles.find(p => p.name === profileName)
        : profiles.find(p => p.isActive);

      if (!profile) {
        console.warn(`[BrandVoice] No profile found for learning: ${profileName || 'active'}`);
        return;
      }

      // Add content to sample texts (keep last 20 samples)
      if (!profile.sampleTexts) {
        profile.sampleTexts = [];
      }
      profile.sampleTexts.push(content);
      if (profile.sampleTexts.length > 20) {
        profile.sampleTexts = profile.sampleTexts.slice(-20);
      }

      // Regenerate embedding with new sample
      profile.embedding = await this.generateVoiceEmbedding(profile.sampleTexts);
      profile.updatedAt = new Date();

      await storage.updateVoiceProfile(profile.id, {
        sampleTexts: profile.sampleTexts,
        embedding: profile.embedding,
        lastTrainedAt: new Date(),
      });

      const userProfiles = this.profileCache.get(userId) || [];
      const profileIndex = userProfiles.findIndex(p => p.name === profile.name);
      if (profileIndex !== -1) {
        userProfiles[profileIndex] = profile as DBVoiceProfile;
        this.profileCache.set(userId, userProfiles);
      }

      console.log(`[BrandVoice] Learned from new content for profile: ${profile.name}`);
    } catch (error) {
      console.error('[BrandVoice] Error learning from content:', error);
    }
  }

  private getDefaultPlatformAdaptations(): VoiceProfile['platformAdaptations'] {
    return {
      twitter: {
        maxLength: 280,
        formatPreferences: ['concise', 'hashtags', 'mentions'],
        specificTone: 'conversational'
      },
      linkedin: {
        maxLength: 3000,
        formatPreferences: ['professional', 'structured', 'insights'],
        specificTone: 'professional'
      },
      instagram: {
        maxLength: 2200,
        formatPreferences: ['visual', 'emojis', 'hashtags', 'stories'],
        specificTone: 'engaging'
      },
      tiktok: {
        maxLength: 300,
        formatPreferences: ['trendy', 'short', 'call-to-action'],
        specificTone: 'energetic'
      },
      youtube: {
        maxLength: 5000,
        formatPreferences: ['detailed', 'timestamps', 'call-to-action'],
        specificTone: 'informative'
      }
    };
  }

  // Batch processing
  async processContentWithVoice(userId: string, content: string, platform: string): Promise<string> {
    try {
      // First, adapt to brand voice
      const voiceAnalysis = await this.analyzeContentVoiceMatch(userId, content);
      
      // Then adapt for platform
      const platformAdapted = await this.adaptContentForPlatform(userId, voiceAnalysis.adaptedContent, platform);
      
      // Learn from the final content
      await this.learnFromContent(userId, platformAdapted);
      
      return platformAdapted;
    } catch (error) {
      console.error('[BrandVoice] Error processing content with voice:', error);
      return content;
    }
  }

  async getVoiceMatchScore(userId: string, content: string): Promise<number> {
    try {
      const analysis = await this.analyzeContentVoiceMatch(userId, content);
      return analysis.similarity;
    } catch (error) {
      console.error('[BrandVoice] Error getting voice match score:', error);
      return 0;
    }
  }

  async retrainEmbeddings(userId: string): Promise<void> {
    const posts = await storage.getSocialPostsByUserId(userId, 'posted');
    const profiles = await this.getUserVoiceProfiles(userId);

    for (const profile of profiles) {
      const last = profile.lastTrainedAt ? new Date(profile.lastTrainedAt) : new Date(0);
      const newPosts = posts.filter(p => p.postedAt && new Date(p.postedAt) > last);
      for (const p of newPosts) {
        await this.learnFromContent(userId, p.content, profile.name);
      }
    }
  }

  private startBackgroundWorker(intervalMs: number = 600000) {
    setInterval(async () => {
      try {
        const allProfiles = await storage.getAllVoiceProfiles();
        const users = Array.from(new Set(allProfiles.map(p => p.userId)));
        for (const uid of users) {
          await this.retrainEmbeddings(uid);
        }
      } catch (err) {
        console.error('[BrandVoice] Worker error:', err);
      }
    }, intervalMs);
  }
}

export const brandVoiceService = new BrandVoiceService();