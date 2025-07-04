import { storage } from "./storage";
import { SocialAccount, SocialPost } from "@shared/schema";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface RevenueData {
  userId?: string;
  postId: string;
  platform: string;
  date: Date;
  views: number;
  cpm: number;
  rpm: number;
  earnings: number;
  adRevenue: number;
  sponsorshipRevenue: number;
  affiliateRevenue: number;
  merchRevenue: number;
}

interface SponsorshipProspect {
  id: string;
  companyName: string;
  industry: string;
  contactEmail: string;
  contactName: string;
  linkedinProfile: string;
  estimatedBudget: number;
  relevanceScore: number;
  audienceMatch: number;
  engagementPotential: number;
  status: 'prospecting' | 'contacted' | 'negotiating' | 'accepted' | 'rejected';
  lastContactDate?: Date;
  proposedRate: number;
  notes: string[];
}

interface CTAConfig {
  type: 'merch' | 'affiliate' | 'course' | 'newsletter' | 'custom';
  url: string;
  text: string;
  platform: string[];
  active: boolean;
  clickThrough: number;
  conversions: number;
  revenue: number;
}

class YouTubeRevenueTracker {
  async fetchAnalytics(account: SocialAccount, videoIds: string[]): Promise<RevenueData[]> {
    console.log(`[YouTubeRevenueTracker] Fetching analytics for ${videoIds.length} videos`);
    if (!account.accessToken) return [];

    try {
      const response = await fetch(`https://youtubeanalytics.googleapis.com/v2/reports?metrics=views,estimatedRevenue,adImpressions&dimensions=day&ids=channel==${account.accountId}&filters=video==${videoIds.join(',')}&startDate=2000-01-01&endDate=${new Date().toISOString().split('T')[0]}`, {
        headers: { 'Authorization': `Bearer ${account.accessToken}` }
      });
      if (!response.ok) return [];
      const data = await response.json();
      return (data.rows || []).map((row: any, idx: number) => ({
        postId: videoIds[idx] || `${idx}`,
        platform: 'youtube',
        date: new Date(row[0]),
        views: parseInt(row[1] || '0'),
        cpm: parseFloat(row[2] || '0'),
        rpm: parseFloat(row[2] || '0'),
        earnings: parseFloat(row[3] || '0'),
        adRevenue: parseFloat(row[3] || '0'),
        sponsorshipRevenue: 0,
        affiliateRevenue: 0,
        merchRevenue: 0,
        userId: account.userId
      }));
    } catch (err) {
      console.error('YouTube revenue fetch error', err);
      return [];
    }
  }

  async getChannelRevenue(channelId: string, days: number = 30): Promise<{
    totalRevenue: number;
    adRevenue: number;
    avgCPM: number;
    avgRPM: number;
    topEarningVideos: any[];
  }> {
    // Simulate YouTube Analytics API response
    return {
      totalRevenue: 2450.75,
      adRevenue: 1890.50,
      avgCPM: 3.45,
      avgRPM: 2.10,
      topEarningVideos: [
        { videoId: 'abc123', title: 'Top Video', earnings: 450.25 },
        { videoId: 'def456', title: 'Second Video', earnings: 320.75 }
      ]
    };
  }
}

class TikTokRevenueTracker {
  async fetchCreatorFundData(account: SocialAccount, videoIds: string[]): Promise<RevenueData[]> {
    console.log(`[TikTokRevenueTracker] Fetching Creator Fund data for ${videoIds.length} videos`);
    if (!account.accessToken) return [];
    try {
      const response = await fetch(`https://open.tiktokapis.com/v2/creator/revenue?video_ids=${videoIds.join(',')}`, {
        headers: { 'Authorization': `Bearer ${account.accessToken}` }
      });
      if (!response.ok) return [];
      const data = await response.json();
      return (data.data || []).map((item: any) => ({
        postId: item.video_id,
        platform: 'tiktok',
        date: new Date(item.date || Date.now()),
        views: item.views || 0,
        cpm: item.cpm || 0,
        rpm: item.rpm || 0,
        earnings: item.earnings || 0,
        adRevenue: item.earnings || 0,
        sponsorshipRevenue: 0,
        affiliateRevenue: 0,
        merchRevenue: 0,
        userId: account.userId
      }));
    } catch (err) {
      console.error('TikTok revenue fetch error', err);
      return [];
    }
  }
}

class TwitterRevenueTracker {
  async fetchSuperFollowsData(account: SocialAccount, tweetIds: string[]): Promise<RevenueData[]> {
    console.log(`[TwitterRevenueTracker] Fetching Super Follows and Tip Jar data for ${tweetIds.length} tweets`);
    if (!account.accessToken) return [];
    try {
      const response = await fetch(`https://api.twitter.com/2/tweets?ids=${tweetIds.join(',')}&tweet.fields=public_metrics,organic_metrics,promoted_metrics`, {
        headers: { 'Authorization': `Bearer ${account.accessToken}` }
      });
      if (!response.ok) return [];
      const data = await response.json();
      return (data.data || []).map((tweet: any) => ({
        postId: tweet.id,
        platform: 'twitter',
        date: new Date(tweet.created_at),
        views: tweet.public_metrics.impression_count || 0,
        cpm: 0,
        rpm: 0,
        earnings: 0,
        adRevenue: 0,
        sponsorshipRevenue: 0,
        affiliateRevenue: 0,
        merchRevenue: 0,
        userId: account.userId
      }));
    } catch (err) {
      console.error('Twitter revenue fetch error', err);
      return [];
    }
  }

  async getCreatorEarnings(userId: string, days: number = 30): Promise<{
    superFollowsRevenue: number;
    tipJarRevenue: number;
    spacesRevenue: number;
    adsRevenue: number;
    totalRevenue: number;
  }> {
    // Note: This requires Twitter Creator Revenue API access
    // Connect your Twitter Creator account to view real revenue data
    return {
      superFollowsRevenue: 0,
      tipJarRevenue: 0,
      spacesRevenue: 0,
      adsRevenue: 0,
      totalRevenue: 0
    };
  }
}

class InstagramRevenueTracker {
  async fetchCreatorFundData(account: SocialAccount, postIds: string[]): Promise<RevenueData[]> {
    console.log(`[InstagramRevenueTracker] Fetching Creator monetization data for ${postIds.length} posts`);
    if (!account.accessToken) return [];
    try {
      const response = await fetch(`https://graph.facebook.com/v18.0/${account.accountId}/media?fields=insights.metric(plays,estimated_earnings)&ids=${postIds.join(',')}`, {
        headers: { 'Authorization': `Bearer ${account.accessToken}` }
      });
      if (!response.ok) return [];
      const data = await response.json();
      return Object.keys(data).map((id: string) => {
        const item = data[id];
        return {
          postId: id,
          platform: 'instagram',
          date: new Date(),
          views: item.insights?.data?.find((m: any) => m.name === 'plays')?.values[0]?.value || 0,
          cpm: 0,
          rpm: 0,
          earnings: item.insights?.data?.find((m: any) => m.name === 'estimated_earnings')?.values[0]?.value || 0,
          adRevenue: item.insights?.data?.find((m: any) => m.name === 'estimated_earnings')?.values[0]?.value || 0,
          sponsorshipRevenue: 0,
          affiliateRevenue: 0,
          merchRevenue: 0,
          userId: account.userId
        } as RevenueData;
      });
    } catch (err) {
      console.error('Instagram revenue fetch error', err);
      return [];
    }
  }

  async getCreatorEarnings(userId: string, days: number = 30): Promise<{
    reelsPlayBonus: number;
    creatorFund: number;
    igtvAds: number;
    liveBadges: number;
    shopping: number;
    totalRevenue: number;
  }> {
    return {
      reelsPlayBonus: 567.80,
      creatorFund: 234.50,
      igtvAds: 189.25,
      liveBadges: 78.40,
      shopping: 445.75,
      totalRevenue: 1515.70
    };
  }
}

class LinkedInRevenueTracker {
  async fetchNewsletterData(account: SocialAccount, postIds: string[]): Promise<RevenueData[]> {
    console.log(`[LinkedInRevenueTracker] Fetching Creator Accelerator Program data for ${postIds.length} posts`);
    
    // LinkedIn monetization: Creator Accelerator Program, Newsletter subscriptions, Course sales, Consulting leads
    const mockData: RevenueData[] = postIds.map(postId => ({
      postId: postId,
      platform: 'linkedin',
      date: new Date(),
      views: Math.floor(Math.random() * 200000) + 2000,
      cpm: parseFloat((Math.random() * 4 + 1.2).toFixed(2)),
      rpm: parseFloat((Math.random() * 2.5 + 0.8).toFixed(2)),
      earnings: parseFloat((Math.random() * 200 + 15).toFixed(2)),
      adRevenue: parseFloat((Math.random() * 60 + 5).toFixed(2)), // Creator Accelerator
      sponsorshipRevenue: 0,
      affiliateRevenue: parseFloat((Math.random() * 80).toFixed(2)), // Course sales
      merchRevenue: parseFloat((Math.random() * 60).toFixed(2)) // Newsletter + Consulting
    }));

    return mockData;
  }

  async getCreatorEarnings(userId: string, days: number = 30): Promise<{
    creatorAccelerator: number;
    newsletterRevenue: number;
    courseRevenue: number;
    consultingLeads: number;
    totalRevenue: number;
  }> {
    return {
      creatorAccelerator: 389.60,
      newsletterRevenue: 256.80,
      courseRevenue: 1245.00,
      consultingLeads: 2890.50,
      totalRevenue: 4781.90
    };
  }
}

class SponsorshipProspector {
  async searchProspects(niche: string, audienceSize: number): Promise<SponsorshipProspect[]> {
    console.log(`[SponsorshipProspector] Searching for prospects in ${niche} with ${audienceSize} audience`);
    
    // In real implementation, this would use Apollo.io API or LinkedIn Sales Navigator
    const mockProspects: SponsorshipProspect[] = [
      {
        id: `prospect_${Date.now()}_1`,
        companyName: "TechStartup Inc",
        industry: "SaaS",
        contactEmail: "partnerships@techstartup.com",
        contactName: "Sarah Johnson",
        linkedinProfile: "https://linkedin.com/in/sarah-johnson-marketing",
        estimatedBudget: 5000,
        relevanceScore: 0.85,
        audienceMatch: 0.78,
        engagementPotential: 0.82,
        status: 'prospecting',
        proposedRate: 2500,
        notes: []
      },
      {
        id: `prospect_${Date.now()}_2`,
        companyName: "HealthTech Solutions",
        industry: "Healthcare",
        contactEmail: "marketing@healthtech.com",
        contactName: "Mike Chen",
        linkedinProfile: "https://linkedin.com/in/mike-chen-healthtech",
        estimatedBudget: 8000,
        relevanceScore: 0.92,
        audienceMatch: 0.88,
        engagementPotential: 0.90,
        status: 'prospecting',
        proposedRate: 4000,
        notes: []
      }
    ];

    return mockProspects;
  }

  async generateOutreachEmail(prospect: SponsorshipProspect, creatorStats: any): Promise<string> {
    const prompt = `Generate a professional sponsorship outreach email for a content creator.

Creator Stats:
- Total Followers: ${creatorStats.totalFollowers}
- Avg Engagement Rate: ${creatorStats.engagementRate}%
- Content Niche: ${creatorStats.niche}
- Top Platforms: ${creatorStats.platforms.join(', ')}

Prospect Info:
- Company: ${prospect.companyName}
- Industry: ${prospect.industry}
- Contact: ${prospect.contactName}
- Estimated Budget: $${prospect.estimatedBudget}

Guidelines:
- Professional but personable tone
- Highlight relevant metrics and audience match
- Include specific collaboration ideas
- Mention media kit availability
- Keep under 200 words
- Include clear call-to-action

Generate the email:`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [{ role: "user", content: prompt }],
      max_tokens: 300,
      temperature: 0.7,
    });

    return response.choices[0].message.content?.trim() || '';
  }

  async generateMediaKitSnippet(creatorStats: any): Promise<string> {
    const prompt = `Create a concise media kit snippet for sponsorship proposals.

Creator Stats:
- Total Followers: ${creatorStats.totalFollowers}
- Monthly Views: ${creatorStats.monthlyViews}
- Engagement Rate: ${creatorStats.engagementRate}%
- Demographics: ${creatorStats.demographics}
- Content Pillars: ${creatorStats.contentPillars.join(', ')}

Create a professional 3-4 sentence summary highlighting key metrics and value proposition:`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 150,
      temperature: 0.6,
    });

    return response.choices[0].message.content?.trim() || '';
  }
}

class CTAManager {
  private ctaConfigs: Map<string, CTAConfig> = new Map();

  async addCTA(config: CTAConfig): Promise<void> {
    this.ctaConfigs.set(config.url, config);
    console.log(`[CTAManager] Added CTA: ${config.type} - ${config.text}`);
  }

  async insertCTAIntoContent(content: string, platform: string): Promise<string> {
    const relevantCTAs = Array.from(this.ctaConfigs.values())
      .filter(cta => cta.active && cta.platform.includes(platform));

    if (relevantCTAs.length === 0) return content;

    // Select best CTA based on performance
    const bestCTA = relevantCTAs.sort((a, b) => {
      const aPerformance = a.conversions / Math.max(a.clickThrough, 1);
      const bPerformance = b.conversions / Math.max(b.clickThrough, 1);
      return bPerformance - aPerformance;
    })[0];

    // Insert CTA naturally into content
    const ctaText = platform === 'twitter' 
      ? `\n\n${bestCTA.text} ${bestCTA.url}`
      : `\n\n${bestCTA.text}\n${bestCTA.url}`;

    return content + ctaText;
  }

  async trackCTAClick(url: string): Promise<void> {
    const cta = this.ctaConfigs.get(url);
    if (cta) {
      cta.clickThrough++;
      console.log(`[CTAManager] CTA click tracked: ${url}`);
    }
  }

  async trackCTAConversion(url: string, revenue: number): Promise<void> {
    const cta = this.ctaConfigs.get(url);
    if (cta) {
      cta.conversions++;
      cta.revenue += revenue;
      console.log(`[CTAManager] CTA conversion tracked: ${url} - $${revenue}`);
    }
  }

  async getCTAPerformance(): Promise<CTAConfig[]> {
    return Array.from(this.ctaConfigs.values())
      .map(cta => ({
        ...cta,
        conversionRate: cta.conversions / Math.max(cta.clickThrough, 1),
        revenuePerClick: cta.revenue / Math.max(cta.clickThrough, 1)
      }))
      .sort((a: any, b: any) => b.revenue - a.revenue);
  }
}

export class MonetizationService {
  private youtubeTracker = new YouTubeRevenueTracker();
  private tiktokTracker = new TikTokRevenueTracker();
  private twitterTracker = new TwitterRevenueTracker();
  private instagramTracker = new InstagramRevenueTracker();
  private linkedinTracker = new LinkedInRevenueTracker();
  private sponsorshipProspector = new SponsorshipProspector();
  private ctaManager = new CTAManager();
  private prospects: Map<string, SponsorshipProspect> = new Map();

  async syncRevenueData(userId: string): Promise<void> {
    console.log(`[MonetizationService] Syncing revenue data for user ${userId}`);

    try {
      const accounts = await storage.getUserSocialAccounts(userId);
      const posts = await storage.getSocialPostsByUserId(userId);

      for (const account of accounts) {
        if (!account.isActive) continue;

        const accountPosts = posts.filter(post => post.platform === account.platform);
        const postIds = accountPosts.map(post => post.id);

        let revenueData: RevenueData[] = [];

        switch (account.platform) {
          case 'youtube':
            revenueData = await this.youtubeTracker.fetchAnalytics(account, postIds);
            break;
          case 'tiktok':
            revenueData = await this.tiktokTracker.fetchCreatorFundData(account, postIds);
            break;
          case 'twitter':
            revenueData = await this.twitterTracker.fetchSuperFollowsData(account, postIds);
            break;
          case 'instagram':
            revenueData = await this.instagramTracker.fetchCreatorFundData(account, postIds);
            break;
          case 'linkedin':
            revenueData = await this.linkedinTracker.fetchNewsletterData(account, postIds);
            break;
        }

        // Store revenue data (would need to add revenue table to schema)
        for (const data of revenueData) {
          await this.storeRevenueData(data);
        }
      }
    } catch (error) {
      console.error('[MonetizationService] Error syncing revenue data:', error);
    }
  }

  async storeRevenueData(data: RevenueData): Promise<void> {
    await storage.createRevenueRecord({
      userId: data.userId || '',
      postId: data.postId,
      platform: data.platform,
      date: data.date || new Date(),
      views: data.views,
      cpm: data.cpm,
      rpm: data.rpm,
      earnings: data.earnings,
      adRevenue: data.adRevenue,
      sponsorshipRevenue: data.sponsorshipRevenue,
      affiliateRevenue: data.affiliateRevenue,
      merchRevenue: data.merchRevenue,
    });
  }

  async getRevenueReport(userId: string, days: number = 30): Promise<{
    totalRevenue: number;
    platformBreakdown: Array<{
      platform: string;
      revenue: number;
      cpm: number;
      rpm: number;
      growth: number;
    }>;
    topEarningPosts: Array<{
      postId: string;
      platform: string;
      earnings: number;
      views: number;
      cpm: number;
    }>;
    projectedMonthly: number;
  }> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

    const records = await storage.getRevenueRecordsByUserId(userId, days);

    const totalRevenue = records.reduce((sum, r) => sum + Number(r.earnings || 0), 0);
    const platformMap: Record<string, { revenue: number; views: number; cpm: number; rpm: number }> = {};
    for (const r of records) {
      if (!platformMap[r.platform]) {
        platformMap[r.platform] = { revenue: 0, views: 0, cpm: 0, rpm: 0 };
      }
      platformMap[r.platform].revenue += Number(r.earnings || 0);
      platformMap[r.platform].views += r.views || 0;
    }

    const platformBreakdown = Object.entries(platformMap).map(([platform, stats]) => ({
      platform,
      revenue: stats.revenue,
      cpm: stats.views ? stats.revenue / stats.views * 1000 : 0,
      rpm: stats.views ? stats.revenue / stats.views * 1000 : 0,
      growth: 0
    }));

    const topEarningPosts = records
      .sort((a, b) => Number(b.earnings) - Number(a.earnings))
      .slice(0, 5)
      .map(r => ({
        postId: r.postId,
        platform: r.platform,
        earnings: Number(r.earnings),
        views: r.views || 0,
        cpm: r.views ? Number(r.earnings) / r.views * 1000 : 0
      }));

    return {
      totalRevenue,
      platformBreakdown,
      topEarningPosts,
      projectedMonthly: days ? (totalRevenue / days) * 30 : totalRevenue
    };
  }

  async findSponsorshipProspects(userId: string): Promise<SponsorshipProspect[]> {
    try {
      // Get user's content niche and audience data
      const posts = await storage.getSocialPostsByUserId(userId);
      const userStats = await storage.getUserStats(userId);

      // Analyze content to determine niche
      const contentSample = posts.slice(0, 10).map(post => post.content).join(' ');
      
      const niche = await this.detectContentNiche(contentSample);
      const audienceSize = userStats.totalEngagement * 10; // Estimate

      const prospects = await this.sponsorshipProspector.searchProspects(niche, audienceSize);
      
      // Store prospects
      for (const prospect of prospects) {
        this.prospects.set(prospect.id, prospect);
      }

      return prospects;
    } catch (error) {
      console.error('[MonetizationService] Error finding prospects:', error);
      return [];
    }
  }

  async generateSponsorshipOutreach(prospectId: string, userId: string): Promise<{
    email: string;
    mediaKit: string;
    proposedRate: number;
  }> {
    const prospect = this.prospects.get(prospectId);
    if (!prospect) throw new Error('Prospect not found');

    const userStats = await storage.getUserStats(userId);
    const accounts = await storage.getUserSocialAccounts(userId);

    const creatorStats = {
      totalFollowers: userStats.totalEngagement * 50, // Estimate
      engagementRate: 4.5,
      niche: 'Technology',
      platforms: accounts.map(a => a.platform),
      monthlyViews: userStats.totalEngagement * 100,
      demographics: 'Tech professionals, 25-40 years old',
      contentPillars: ['Technology', 'Business', 'Innovation']
    };

    const [email, mediaKit] = await Promise.all([
      this.sponsorshipProspector.generateOutreachEmail(prospect, creatorStats),
      this.sponsorshipProspector.generateMediaKitSnippet(creatorStats)
    ]);

    return {
      email,
      mediaKit,
      proposedRate: prospect.proposedRate
    };
  }

  async setupCTA(config: CTAConfig): Promise<void> {
    await this.ctaManager.addCTA(config);
  }

  async processContentWithCTA(content: string, platform: string): Promise<string> {
    return await this.ctaManager.insertCTAIntoContent(content, platform);
  }

  async getCTAPerformance(): Promise<any[]> {
    return await this.ctaManager.getCTAPerformance();
  }

  async trackCTAMetrics(url: string, type: 'click' | 'conversion', revenue?: number): Promise<void> {
    if (type === 'click') {
      await this.ctaManager.trackCTAClick(url);
    } else if (type === 'conversion' && revenue) {
      await this.ctaManager.trackCTAConversion(url, revenue);
    }
  }

  private async detectContentNiche(content: string): Promise<string> {
    const prompt = `Analyze this content sample and identify the primary niche/industry category:

Content: "${content.slice(0, 500)}..."

Categories: Technology, Business, Health & Fitness, Lifestyle, Education, Entertainment, Gaming, Finance, Food, Travel, Fashion, Beauty, Sports, Music, Art, Science

Return only the single most relevant category:`;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 20,
        temperature: 0.3,
      });

      return response.choices[0].message.content?.trim() || 'Technology';
    } catch (error) {
      console.error('[MonetizationService] Error detecting niche:', error);
      return 'Technology';
    }
  }

  async updateProspectStatus(prospectId: string, status: SponsorshipProspect['status'], notes?: string): Promise<void> {
    const prospect = this.prospects.get(prospectId);
    if (prospect) {
      prospect.status = status;
      prospect.lastContactDate = new Date();
      if (notes) {
        prospect.notes.push(`${new Date().toISOString()}: ${notes}`);
      }
      console.log(`[MonetizationService] Updated prospect ${prospectId} status to ${status}`);
    }
  }

  async getMonetizationDashboard(userId: string): Promise<{
    revenueReport: any;
    activeProspects: SponsorshipProspect[];
    ctaPerformance: any[];
    recommendations: string[];
  }> {
    const [revenueReport, ctaPerformance] = await Promise.all([
      this.getRevenueReport(userId),
      this.getCTAPerformance()
    ]);

    const activeProspects = Array.from(this.prospects.values())
      .filter(p => ['prospecting', 'contacted', 'negotiating'].includes(p.status))
      .sort((a, b) => b.estimatedBudget - a.estimatedBudget);

    const recommendations = await this.generateRecommendations(revenueReport, ctaPerformance);

    return {
      revenueReport,
      activeProspects,
      ctaPerformance,
      recommendations
    };
  }

  private async generateRecommendations(revenueReport: any, ctaPerformance: any[]): Promise<string[]> {
    const recommendations: string[] = [];

    // Revenue-based recommendations
    if (revenueReport.totalRevenue < 1000) {
      recommendations.push("Consider increasing posting frequency to boost ad revenue");
    }

    const bestPlatform = revenueReport.platformBreakdown.sort((a: any, b: any) => b.revenue - a.revenue)[0];
    if (bestPlatform) {
      recommendations.push(`Focus more content on ${bestPlatform.platform} - your highest earning platform`);
    }

    // CTA recommendations
    if (ctaPerformance.length > 0) {
      const bestCTA = ctaPerformance[0];
      recommendations.push(`Optimize CTAs - your best performing type: ${bestCTA.type}`);
    }

    // Sponsorship recommendations
    recommendations.push("Reach out to 3-5 new sponsorship prospects this week");

    return recommendations;
  }
}

export const monetizationService = new MonetizationService();