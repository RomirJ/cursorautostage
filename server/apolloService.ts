import axios from 'axios';
import { storage } from './storage';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface ApolloConfig {
  apiKey: string;
  baseUrl: string;
}

interface ProspectCriteria {
  industry?: string[];
  companySize?: {
    min?: number;
    max?: number;
  };
  location?: string[];
  revenue?: {
    min?: number;
    max?: number;
  };
  keywords?: string[];
  jobTitles?: string[];
  technologies?: string[];
  excludeCompanies?: string[];
  contentNiche?: string;
  audienceSize?: {
    min?: number;
    max?: number;
  };
}

interface Prospect {
  id: string;
  name: string;
  email: string;
  title: string;
  company: {
    name: string;
    industry: string;
    size: number;
    revenue: number;
    website: string;
    location: string;
    description: string;
  };
  socialProfiles: {
    linkedin?: string;
    twitter?: string;
    instagram?: string;
  };
  contactInfo: {
    phone?: string;
    email: string;
    directEmail?: string;
  };
  sponsorshipHistory: {
    hasSponsored: boolean;
    previousSponsors: string[];
    avgSpendPerCampaign?: number;
    preferredChannels: string[];
  };
  relevanceScore: number;
  matchReason: string[];
  lastUpdated: Date;
}

interface SponsorshipIntelligence {
  prospect: Prospect;
  insights: {
    marketingBudget: number;
    sponsorshipBudget: number;
    preferredContentTypes: string[];
    targetAudience: string[];
    competitorSponsors: string[];
    seasonalTrends: string[];
    decisionMakers: string[];
  };
  recommendations: {
    approachStrategy: string;
    pitchPoints: string[];
    timing: string;
    budget: {
      min: number;
      max: number;
    };
  };
  outreachTemplates: {
    subject: string;
    body: string;
    followUp: string[];
  };
}

interface OutreachCampaign {
  id: string;
  name: string;
  userId: string;
  prospects: string[];
  template: {
    subject: string;
    body: string;
    followUp: string[];
  };
  schedule: {
    startDate: Date;
    followUpInterval: number; // days
    maxFollowUps: number;
  };
  status: 'draft' | 'active' | 'paused' | 'completed';
  metrics: {
    sent: number;
    opened: number;
    replied: number;
    interested: number;
    meetings: number;
    deals: number;
  };
  createdAt: Date;
}

interface OutreachAnalytics {
  campaignId: string;
  period: {
    start: Date;
    end: Date;
  };
  performance: {
    deliveryRate: number;
    openRate: number;
    replyRate: number;
    interestRate: number;
    meetingRate: number;
    dealRate: number;
  };
  insights: {
    bestPerformingSubjects: string[];
    bestPerformingTimes: string[];
    bestPerformingDays: string[];
    avgResponseTime: number;
  };
  recommendations: string[];
}

export class ApolloService {
  private config: ApolloConfig;
  private rateLimiter: Map<string, number> = new Map();

  constructor() {
    this.config = {
      apiKey: process.env.APOLLO_API_KEY || '',
      baseUrl: 'https://api.apollo.io/v1'
    };
  }

  async searchProspects(criteria: ProspectCriteria, userId: string): Promise<Prospect[]> {
    try {
      await this.checkRateLimit('search');

      // Build Apollo search query
      const searchQuery = this.buildSearchQuery(criteria);
      
      const response = await axios.post(`${this.config.baseUrl}/mixed_people/search`, {
        ...searchQuery,
        page: 1,
        per_page: 100
      }, {
        headers: {
          'Cache-Control': 'no-cache',
          'Content-Type': 'application/json',
          'X-Api-Key': this.config.apiKey
        }
      });

      const apolloProspects = response.data.people || [];
      
      // Enhance prospects with sponsorship intelligence
      const enhancedProspects = await Promise.all(
        apolloProspects.map(async (apolloProspect: any) => {
          const prospect = this.mapApolloProspect(apolloProspect);
          
          // Add sponsorship history and relevance scoring
          prospect.sponsorshipHistory = await this.analyzeSponsorshipHistory(prospect);
          prospect.relevanceScore = await this.calculateRelevanceScore(prospect, criteria, userId);
          prospect.matchReason = await this.generateMatchReasons(prospect, criteria);
          
          return prospect;
        })
      );

      // Sort by relevance score
      const sortedProspects = enhancedProspects.sort((a, b) => b.relevanceScore - a.relevanceScore);
      
      // Save search results for future reference
      await storage.saveProspectSearch(userId, criteria, sortedProspects);
      
      console.log(`[Apollo] Found ${sortedProspects.length} prospects for user ${userId}`);
      return sortedProspects;

    } catch (error) {
      console.error('[Apollo] Error searching prospects:', error);
      throw new Error('Failed to search prospects');
    }
  }

  async generateSponsorshipIntelligence(prospectId: string, userId: string): Promise<SponsorshipIntelligence> {
    try {
      const prospect = await storage.getProspect(prospectId);
      if (!prospect) {
        throw new Error('Prospect not found');
      }

      // Get additional company intelligence
      const companyIntel = await this.getCompanyIntelligence(prospect.company.name);
      
      // Analyze user's content for better matching
      const userContent = await storage.getUserContentAnalysis(userId);
      
      // Generate comprehensive insights
      const insights = await this.generateInsights(prospect, companyIntel, userContent);
      
      // Generate personalized recommendations
      const recommendations = await this.generateRecommendations(prospect, insights, userContent);
      
      // Create outreach templates
      const outreachTemplates = await this.generateOutreachTemplates(prospect, recommendations, userContent);

      const intelligence: SponsorshipIntelligence = {
        prospect,
        insights,
        recommendations,
        outreachTemplates
      };

      // Save intelligence for future reference
      await storage.saveSponsorshipIntelligence(prospectId, intelligence);
      
      console.log(`[Apollo] Generated sponsorship intelligence for prospect ${prospectId}`);
      return intelligence;

    } catch (error) {
      console.error('[Apollo] Error generating sponsorship intelligence:', error);
      throw new Error('Failed to generate sponsorship intelligence');
    }
  }

  async createOutreachCampaign(campaignData: Omit<OutreachCampaign, 'id' | 'createdAt' | 'metrics'>): Promise<string> {
    try {
      const campaign: OutreachCampaign = {
        id: `campaign_${Date.now()}`,
        ...campaignData,
        metrics: {
          sent: 0,
          opened: 0,
          replied: 0,
          interested: 0,
          meetings: 0,
          deals: 0
        },
        createdAt: new Date()
      };

      await storage.saveOutreachCampaign(campaign);
      
      // Schedule initial outreach
      if (campaign.status === 'active') {
        await this.scheduleOutreach(campaign);
      }

      console.log(`[Apollo] Created outreach campaign ${campaign.id}`);
      return campaign.id;

    } catch (error) {
      console.error('[Apollo] Error creating outreach campaign:', error);
      throw new Error('Failed to create outreach campaign');
    }
  }

  async executeOutreach(campaignId: string): Promise<void> {
    try {
      const campaign = await storage.getOutreachCampaign(campaignId);
      if (!campaign) {
        throw new Error('Campaign not found');
      }

      if (campaign.status !== 'active') {
        throw new Error('Campaign is not active');
      }

      // Get prospects for this campaign
      const prospects = await Promise.all(
        campaign.prospects.map(id => storage.getProspect(id))
      );

      // Send outreach emails
      for (const prospect of prospects) {
        if (!prospect) continue;

        try {
          await this.sendOutreachEmail(prospect, campaign.template);
          campaign.metrics.sent++;
          
          // Schedule follow-ups
          await this.scheduleFollowUps(prospect, campaign);
          
          // Rate limiting
          await this.delay(2000); // 2 second delay between emails
          
        } catch (error) {
          console.error(`[Apollo] Error sending outreach to ${prospect.email}:`, error);
        }
      }

      // Update campaign metrics
      await storage.updateOutreachCampaign(campaignId, { metrics: campaign.metrics });
      
      console.log(`[Apollo] Executed outreach campaign ${campaignId}, sent ${campaign.metrics.sent} emails`);

    } catch (error) {
      console.error('[Apollo] Error executing outreach:', error);
      throw new Error('Failed to execute outreach');
    }
  }

  async analyzeOutreachPerformance(campaignId: string): Promise<OutreachAnalytics> {
    try {
      const campaign = await storage.getOutreachCampaign(campaignId);
      if (!campaign) {
        throw new Error('Campaign not found');
      }

      // Get detailed metrics
      const detailedMetrics = await storage.getOutreachMetrics(campaignId);
      
      // Calculate performance rates
      const performance = {
        deliveryRate: campaign.metrics.sent > 0 ? (campaign.metrics.sent / campaign.prospects.length) * 100 : 0,
        openRate: campaign.metrics.sent > 0 ? (campaign.metrics.opened / campaign.metrics.sent) * 100 : 0,
        replyRate: campaign.metrics.sent > 0 ? (campaign.metrics.replied / campaign.metrics.sent) * 100 : 0,
        interestRate: campaign.metrics.sent > 0 ? (campaign.metrics.interested / campaign.metrics.sent) * 100 : 0,
        meetingRate: campaign.metrics.sent > 0 ? (campaign.metrics.meetings / campaign.metrics.sent) * 100 : 0,
        dealRate: campaign.metrics.sent > 0 ? (campaign.metrics.deals / campaign.metrics.sent) * 100 : 0
      };

      // Analyze patterns
      const insights = await this.analyzeOutreachPatterns(detailedMetrics);
      
      // Generate recommendations
      const recommendations = await this.generateOutreachRecommendations(performance, insights);

      const analytics: OutreachAnalytics = {
        campaignId,
        period: {
          start: campaign.createdAt,
          end: new Date()
        },
        performance,
        insights,
        recommendations
      };

      console.log(`[Apollo] Analyzed outreach performance for campaign ${campaignId}`);
      return analytics;

    } catch (error) {
      console.error('[Apollo] Error analyzing outreach performance:', error);
      throw new Error('Failed to analyze outreach performance');
    }
  }

  async enrichProspectData(prospectId: string): Promise<Prospect> {
    try {
      const prospect = await storage.getProspect(prospectId);
      if (!prospect) {
        throw new Error('Prospect not found');
      }

      // Enrich with Apollo data
      const apolloData = await this.getApolloPersonData(prospect.email);
      
      // Enrich with social media data
      const socialData = await this.getSocialMediaData(prospect);
      
      // Enrich with company data
      const companyData = await this.getCompanyIntelligence(prospect.company.name);
      
      // Merge all data
      const enrichedProspect = {
        ...prospect,
        ...apolloData,
        socialProfiles: { ...prospect.socialProfiles, ...socialData },
        company: { ...prospect.company, ...companyData },
        lastUpdated: new Date()
      };

      await storage.updateProspect(prospectId, enrichedProspect);
      
      console.log(`[Apollo] Enriched prospect data for ${prospectId}`);
      return enrichedProspect;

    } catch (error) {
      console.error('[Apollo] Error enriching prospect data:', error);
      throw new Error('Failed to enrich prospect data');
    }
  }

  private buildSearchQuery(criteria: ProspectCriteria): any {
    const query: any = {
      person_titles: criteria.jobTitles || ['Marketing Director', 'CMO', 'Marketing Manager', 'Brand Manager'],
      organization_locations: criteria.location || ['United States'],
      organization_num_employees_ranges: []
    };

    if (criteria.companySize) {
      if (criteria.companySize.min && criteria.companySize.max) {
        query.organization_num_employees_ranges.push(`${criteria.companySize.min},${criteria.companySize.max}`);
      }
    }

    if (criteria.industry && criteria.industry.length > 0) {
      query.organization_industry_tag_ids = criteria.industry;
    }

    if (criteria.keywords && criteria.keywords.length > 0) {
      query.keywords = criteria.keywords.join(' OR ');
    }

    if (criteria.technologies && criteria.technologies.length > 0) {
      query.organization_technology_names = criteria.technologies;
    }

    if (criteria.excludeCompanies && criteria.excludeCompanies.length > 0) {
      query.organization_not_names = criteria.excludeCompanies;
    }

    return query;
  }

  private mapApolloProspect(apolloProspect: any): Prospect {
    return {
      id: apolloProspect.id,
      name: apolloProspect.name,
      email: apolloProspect.email,
      title: apolloProspect.title,
      company: {
        name: apolloProspect.organization?.name || '',
        industry: apolloProspect.organization?.industry || '',
        size: apolloProspect.organization?.estimated_num_employees || 0,
        revenue: apolloProspect.organization?.estimated_annual_revenue || 0,
        website: apolloProspect.organization?.website_url || '',
        location: apolloProspect.organization?.primary_location?.display_name || '',
        description: apolloProspect.organization?.short_description || ''
      },
      socialProfiles: {
        linkedin: apolloProspect.linkedin_url,
        twitter: apolloProspect.twitter_url
      },
      contactInfo: {
        email: apolloProspect.email,
        phone: apolloProspect.phone,
        directEmail: apolloProspect.personal_email
      },
      sponsorshipHistory: {
        hasSponsored: false,
        previousSponsors: [],
        preferredChannels: []
      },
      relevanceScore: 0,
      matchReason: [],
      lastUpdated: new Date()
    };
  }

  private async analyzeSponsorshipHistory(prospect: Prospect): Promise<Prospect['sponsorshipHistory']> {
    try {
      // Use AI to analyze company description and industry for sponsorship indicators
      const prompt = `Analyze this company for sponsorship potential:
      
      Company: ${prospect.company.name}
      Industry: ${prospect.company.industry}
      Size: ${prospect.company.size} employees
      Description: ${prospect.company.description}
      
      Determine:
      1. Likelihood of sponsoring content creators (0-100)
      2. Preferred marketing channels
      3. Estimated marketing budget tier (low/medium/high)
      
      Return JSON format only.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 300,
        temperature: 0.3
      });

      const analysis = JSON.parse(response.choices[0].message.content || '{}');
      
      return {
        hasSponsored: analysis.likelihood > 60,
        previousSponsors: analysis.previousSponsors || [],
        avgSpendPerCampaign: analysis.avgSpend || 0,
        preferredChannels: analysis.preferredChannels || ['youtube', 'instagram', 'tiktok']
      };

    } catch (error) {
      console.error('[Apollo] Error analyzing sponsorship history:', error);
      return {
        hasSponsored: false,
        previousSponsors: [],
        preferredChannels: ['youtube', 'instagram', 'tiktok']
      };
    }
  }

  private async calculateRelevanceScore(prospect: Prospect, criteria: ProspectCriteria, userId: string): Promise<number> {
    let score = 0;
    
    // Industry match
    if (criteria.industry && criteria.industry.includes(prospect.company.industry)) {
      score += 20;
    }
    
    // Company size match
    if (criteria.companySize) {
      const size = prospect.company.size;
      if (size >= (criteria.companySize.min || 0) && size <= (criteria.companySize.max || 10000)) {
        score += 15;
      }
    }
    
    // Title relevance
    if (criteria.jobTitles && criteria.jobTitles.some(title => 
      prospect.title.toLowerCase().includes(title.toLowerCase())
    )) {
      score += 25;
    }
    
    // Sponsorship history
    if (prospect.sponsorshipHistory.hasSponsored) {
      score += 30;
    }
    
    // User content alignment
    const userContent = await storage.getUserContentAnalysis(userId);
    if (userContent) {
      const alignment = this.calculateContentAlignment(prospect, userContent);
      score += alignment * 10;
    }
    
    return Math.min(score, 100);
  }

  private async generateMatchReasons(prospect: Prospect, criteria: ProspectCriteria): Promise<string[]> {
    const reasons: string[] = [];
    
    if (criteria.industry && criteria.industry.includes(prospect.company.industry)) {
      reasons.push(`Industry match: ${prospect.company.industry}`);
    }
    
    if (prospect.sponsorshipHistory.hasSponsored) {
      reasons.push('Has previous sponsorship experience');
    }
    
    if (prospect.company.size >= 100) {
      reasons.push('Large company with marketing budget');
    }
    
    if (prospect.title.toLowerCase().includes('marketing')) {
      reasons.push('Marketing decision maker');
    }
    
    return reasons;
  }

  private async getCompanyIntelligence(companyName: string): Promise<any> {
    try {
      const response = await axios.get(`${this.config.baseUrl}/organizations/search`, {
        params: {
          q_organization_name: companyName
        },
        headers: {
          'X-Api-Key': this.config.apiKey
        }
      });

      return response.data.organizations?.[0] || {};
    } catch (error) {
      console.error('[Apollo] Error getting company intelligence:', error);
      return {};
    }
  }

  private async generateInsights(prospect: Prospect, companyIntel: any, userContent: any): Promise<SponsorshipIntelligence['insights']> {
    try {
      const prompt = `Generate sponsorship insights for this prospect:
      
      Prospect: ${prospect.name} - ${prospect.title}
      Company: ${prospect.company.name} (${prospect.company.industry})
      Company Size: ${prospect.company.size} employees
      
      User Content: ${userContent.niche} content, ${userContent.audienceSize} followers
      
      Provide insights on:
      1. Estimated marketing budget
      2. Preferred content types
      3. Target audience demographics
      4. Competitor sponsors
      5. Seasonal trends
      6. Decision makers
      
      Return JSON format.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 500,
        temperature: 0.3
      });

      const insights = JSON.parse(response.choices[0].message.content || '{}');
      
      return {
        marketingBudget: insights.marketingBudget || 100000,
        sponsorshipBudget: insights.sponsorshipBudget || 50000,
        preferredContentTypes: insights.preferredContentTypes || ['video', 'social'],
        targetAudience: insights.targetAudience || ['18-34', 'tech-savvy'],
        competitorSponsors: insights.competitorSponsors || [],
        seasonalTrends: insights.seasonalTrends || [],
        decisionMakers: insights.decisionMakers || [prospect.name]
      };

    } catch (error) {
      console.error('[Apollo] Error generating insights:', error);
      return {
        marketingBudget: 100000,
        sponsorshipBudget: 50000,
        preferredContentTypes: ['video', 'social'],
        targetAudience: ['18-34'],
        competitorSponsors: [],
        seasonalTrends: [],
        decisionMakers: [prospect.name]
      };
    }
  }

  private async generateRecommendations(
    prospect: Prospect, 
    insights: SponsorshipIntelligence['insights'], 
    userContent: any
  ): Promise<SponsorshipIntelligence['recommendations']> {
    try {
      const prompt = `Generate sponsorship recommendations for:
      
      Prospect: ${prospect.name} at ${prospect.company.name}
      Budget: $${insights.sponsorshipBudget}
      Content Creator: ${userContent.niche}, ${userContent.audienceSize} followers
      
      Provide:
      1. Approach strategy
      2. Key pitch points
      3. Best timing
      4. Budget range
      
      Return JSON format.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 400,
        temperature: 0.3
      });

      const recommendations = JSON.parse(response.choices[0].message.content || '{}');
      
      return {
        approachStrategy: recommendations.approachStrategy || 'Direct email with value proposition',
        pitchPoints: recommendations.pitchPoints || ['Audience alignment', 'Engagement rates', 'ROI potential'],
        timing: recommendations.timing || 'Q1 budget planning season',
        budget: {
          min: recommendations.budget?.min || 5000,
          max: recommendations.budget?.max || 15000
        }
      };

    } catch (error) {
      console.error('[Apollo] Error generating recommendations:', error);
      return {
        approachStrategy: 'Direct email with value proposition',
        pitchPoints: ['Audience alignment', 'Engagement rates', 'ROI potential'],
        timing: 'Q1 budget planning season',
        budget: { min: 5000, max: 15000 }
      };
    }
  }

  private async generateOutreachTemplates(
    prospect: Prospect, 
    recommendations: SponsorshipIntelligence['recommendations'], 
    userContent: any
  ): Promise<SponsorshipIntelligence['outreachTemplates']> {
    try {
      const prompt = `Create personalized outreach templates for:
      
      Prospect: ${prospect.name} - ${prospect.title} at ${prospect.company.name}
      Strategy: ${recommendations.approachStrategy}
      Key Points: ${recommendations.pitchPoints.join(', ')}
      Creator: ${userContent.niche} content, ${userContent.audienceSize} followers
      
      Create:
      1. Email subject line
      2. Email body (professional, value-focused)
      3. Follow-up sequence (2 follow-ups)
      
      Return JSON format.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 600,
        temperature: 0.4
      });

      const templates = JSON.parse(response.choices[0].message.content || '{}');
      
      return {
        subject: templates.subject || `Partnership Opportunity - ${prospect.company.name} x ${userContent.brandName}`,
        body: templates.body || `Hi ${prospect.name.split(' ')[0]},\n\nI hope this email finds you well...`,
        followUp: templates.followUp || [
          'Following up on my previous email...',
          'Last follow-up regarding our partnership opportunity...'
        ]
      };

    } catch (error) {
      console.error('[Apollo] Error generating outreach templates:', error);
      return {
        subject: `Partnership Opportunity - ${prospect.company.name}`,
        body: `Hi ${prospect.name.split(' ')[0]},\n\nI hope this email finds you well...`,
        followUp: [
          'Following up on my previous email...',
          'Last follow-up regarding our partnership opportunity...'
        ]
      };
    }
  }

  private async checkRateLimit(operation: string): Promise<void> {
    const now = Date.now();
    const lastCall = this.rateLimiter.get(operation) || 0;
    const timeSinceLastCall = now - lastCall;
    
    // Apollo rate limit: 60 requests per minute
    const minInterval = 1000; // 1 second between requests
    
    if (timeSinceLastCall < minInterval) {
      await this.delay(minInterval - timeSinceLastCall);
    }
    
    this.rateLimiter.set(operation, now);
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private calculateContentAlignment(prospect: Prospect, userContent: any): number {
    // Simple alignment calculation based on industry and audience
    let alignment = 0;
    
    if (userContent.targetAudience && prospect.company.industry) {
      // Industry-audience alignment logic
      alignment = Math.random() * 5; // Placeholder
    }
    
    return alignment;
  }

  private async scheduleOutreach(campaign: OutreachCampaign): Promise<void> {
    // In a real implementation, this would use a job queue
    console.log(`[Apollo] Scheduling outreach for campaign ${campaign.id}`);
  }

  private async sendOutreachEmail(prospect: Prospect, template: any): Promise<void> {
    // In a real implementation, this would integrate with email service
    console.log(`[Apollo] Sending outreach email to ${prospect.email}`);
  }

  private async scheduleFollowUps(prospect: Prospect, campaign: OutreachCampaign): Promise<void> {
    // In a real implementation, this would schedule follow-up emails
    console.log(`[Apollo] Scheduling follow-ups for ${prospect.email}`);
  }

  private async getApolloPersonData(email: string): Promise<any> {
    try {
      const response = await axios.get(`${this.config.baseUrl}/people/match`, {
        params: { email },
        headers: { 'X-Api-Key': this.config.apiKey }
      });
      return response.data.person || {};
    } catch (error) {
      return {};
    }
  }

  private async getSocialMediaData(prospect: Prospect): Promise<any> {
    // Placeholder for social media enrichment
    return {};
  }

  private async analyzeOutreachPatterns(metrics: any): Promise<any> {
    // Analyze patterns in outreach performance
    return {
      bestPerformingSubjects: ['Partnership Opportunity', 'Collaboration Proposal'],
      bestPerformingTimes: ['10:00 AM', '2:00 PM'],
      bestPerformingDays: ['Tuesday', 'Wednesday'],
      avgResponseTime: 24 // hours
    };
  }

  private async generateOutreachRecommendations(performance: any, insights: any): Promise<string[]> {
    const recommendations: string[] = [];
    
    if (performance.openRate < 20) {
      recommendations.push('Improve subject lines - current open rate is low');
    }
    
    if (performance.replyRate < 5) {
      recommendations.push('Personalize email content more - reply rate needs improvement');
    }
    
    if (insights.bestPerformingTimes) {
      recommendations.push(`Send emails at ${insights.bestPerformingTimes.join(' or ')} for better engagement`);
    }
    
    return recommendations;
  }
}

export const apolloService = new ApolloService(); 