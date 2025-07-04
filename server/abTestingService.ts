import { v4 as uuidv4 } from 'uuid';
import { db } from './db';
import { abTests, socialPosts } from '../shared/schema';
import { eq, and, gte, lte } from 'drizzle-orm';
import { enhancedAnalyticsService } from './enhancedAnalytics';
import { storage } from './storage';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface ABTestConfig {
  testId: string;
  userId: string;
  contentId: string;
  variations: {
    id: string;
    content: string;
    thumbnail?: string;
    title?: string;
    description?: string;
    hashtags?: string[];
    cta?: string;
    postingTime?: string;
  }[];
  platforms: string[];
  duration: number; // hours
  successMetrics: string[];
  trafficSplit: '50-50' | '70-30' | '80-20';
  statisticalSignificance: number; // 0.05 = 95% confidence
  testName?: string;
  description?: string;
}

interface ABTestResult {
  testId: string;
  winner: string;
  results: PerformanceResult[];
  recommendations: string[];
  confidence: number;
  totalEngagement: number;
  testDuration: number;
  statisticalAnalysis: StatisticalTest;
  insights: string[];
}

interface PerformanceResult {
  variationId: string;
  platform: string;
  views: number;
  likes: number;
  shares: number;
  comments: number;
  watchTime: number;
  engagementRate: number;
  clickThroughRate: number;
  conversionRate: number;
  revenue: number;
  completionRate: number;
  bounceRate: number;
}

interface StatisticalTest {
  isSignificant: boolean;
  pValue: number;
  confidenceInterval: [number, number];
  effectSize: number;
  confidence: number;
  sampleSize: number;
  power: number;
}

interface ABTestStatus {
  testId: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number; // 0-100
  estimatedCompletion: Date;
  currentResults: PerformanceResult[];
  alerts: string[];
}

export class ABTestingService {
  private activeTests: Map<string, ABTestStatus> = new Map();

  async createTest(config: ABTestConfig): Promise<{ testId: string; status: string }> {
    const testId = uuidv4();
    
    try {
      // Validate configuration
      this.validateTestConfig(config);
      
      // Create test record
      await this.createTestRecord(testId, config);
      
      // Initialize test status
      this.activeTests.set(testId, {
        testId,
        status: 'running',
        progress: 0,
        estimatedCompletion: new Date(Date.now() + config.duration * 60 * 60 * 1000),
        currentResults: [],
        alerts: []
      });
      
      // Start monitoring
      this.startTestMonitoring(testId, config);
      
      console.log(`[ABTesting] Created test ${testId} for user ${config.userId}`);
      
      return { testId, status: 'running' };
    } catch (error) {
      console.error(`[ABTesting] Failed to create test ${testId}:`, error);
      throw error;
    }
  }

  private validateTestConfig(config: ABTestConfig): void {
    if (!config.variations || config.variations.length < 2) {
      throw new Error('At least 2 variations are required');
    }
    
    if (!['50-50', '70-30', '80-20'].includes(config.trafficSplit)) {
      throw new Error('Invalid traffic split configuration');
    }
    
    if (config.statisticalSignificance <= 0 || config.statisticalSignificance >= 1) {
      throw new Error('Statistical significance must be between 0 and 1');
    }
    
    if (config.duration < 1 || config.duration > 168) { // 1 hour to 1 week
      throw new Error('Test duration must be between 1 and 168 hours');
    }
  }

  private async createTestRecord(testId: string, config: ABTestConfig): Promise<void> {
    await db.insert(abTests).values({
      id: testId,
      userId: config.userId,
      contentId: config.contentId,
      testConfig: {
        variations: config.variations,
        platforms: config.platforms,
        duration: config.duration,
        successMetrics: config.successMetrics,
        trafficSplit: config.trafficSplit,
        statisticalSignificance: config.statisticalSignificance,
        testName: config.testName,
        description: config.description
      },
      status: 'running',
      createdAt: new Date()
    });
  }

  private startTestMonitoring(testId: string, config: ABTestConfig): void {
    const startTime = Date.now();
    const endTime = startTime + config.duration * 60 * 60 * 1000;
    
    // Monitor every 5 minutes
    const interval = setInterval(async () => {
      try {
        const currentTime = Date.now();
        const progress = Math.min(100, ((currentTime - startTime) / (endTime - startTime)) * 100);
        
        // Update progress
        const testStatus = this.activeTests.get(testId);
        if (testStatus) {
          testStatus.progress = progress;
          
          // Collect current metrics
          const currentResults = await this.collectMetrics(testId);
          testStatus.currentResults = currentResults;
          
          // Check for early significance
          if (progress >= 50) { // Only check after 50% completion
            const analysis = await this.performStatisticalAnalysis(currentResults);
            if (analysis.isSignificant && analysis.confidence >= 95) {
              console.log(`[ABTesting] Early significance detected for test ${testId}`);
              await this.completeTest(testId, currentResults, analysis);
              clearInterval(interval);
              return;
            }
          }
          
          // Check if test duration is complete
          if (currentTime >= endTime) {
            await this.completeTest(testId, currentResults);
            clearInterval(interval);
          }
        }
      } catch (error) {
        console.error(`[ABTesting] Error monitoring test ${testId}:`, error);
      }
    }, 5 * 60 * 1000); // 5 minutes
  }

  private async collectMetrics(testId: string): Promise<PerformanceResult[]> {
    const results: PerformanceResult[] = [];
    
    try {
      // Get test configuration
      const testRecord = await db.select().from(abTests).where(eq(abTests.id, testId)).limit(1);
      if (testRecord.length === 0) return results;
      
      const config = testRecord[0].testConfig as ABTestConfig;
      
      // Get posts for this test
      const posts = await storage.getSocialPostsByUserId(config.userId);
      const testPosts = posts.filter(post => {
        const metadata = post.metadata as any;
        return metadata?.abTestId === testId;
      });
      
      for (const post of testPosts) {
        try {
          // Collect real metrics from platform APIs
          const metrics = await this.fetchPlatformMetrics(post);
          
          const variationId = (post.metadata as any)?.variationId || post.id;
          
          results.push({
            variationId,
            platform: post.platform,
            views: metrics.views || 0,
            likes: metrics.likes || 0,
            shares: metrics.shares || 0,
            comments: metrics.comments || 0,
            watchTime: metrics.watchTime || 0,
            engagementRate: this.calculateEngagementRate(metrics),
            clickThroughRate: metrics.clickThroughRate || 0,
            conversionRate: metrics.conversionRate || 0,
            revenue: metrics.revenue || 0,
            completionRate: metrics.completionRate || 0,
            bounceRate: metrics.bounceRate || 0
          });
        } catch (error) {
          console.error(`[ABTesting] Failed to collect metrics for post ${post.id}:`, error);
        }
      }
    } catch (error) {
      console.error(`[ABTesting] Error collecting metrics for test ${testId}:`, error);
    }
    
    return results;
  }

  private async fetchPlatformMetrics(post: any): Promise<any> {
    // Mock implementation - in production, this would fetch from platform APIs
    const baseMetrics = {
      views: Math.floor(Math.random() * 1000) + 100,
      likes: Math.floor(Math.random() * 100) + 10,
      shares: Math.floor(Math.random() * 50) + 5,
      comments: Math.floor(Math.random() * 30) + 2,
      watchTime: Math.floor(Math.random() * 300) + 30,
      clickThroughRate: Math.random() * 5,
      conversionRate: Math.random() * 2,
      revenue: Math.random() * 100,
      completionRate: Math.random() * 80 + 20,
      bounceRate: Math.random() * 30
    };
    
    // Add some variation based on platform
    const platformMultipliers = {
      youtube: { views: 1.5, engagement: 1.2 },
      tiktok: { views: 2.0, engagement: 1.5 },
      instagram: { views: 1.0, engagement: 1.0 },
      twitter: { views: 0.8, engagement: 0.9 }
    };
    
    const multiplier = platformMultipliers[post.platform as keyof typeof platformMultipliers] || { views: 1, engagement: 1 };
    
    return {
      views: Math.floor(baseMetrics.views * multiplier.views),
      likes: Math.floor(baseMetrics.likes * multiplier.engagement),
      shares: Math.floor(baseMetrics.shares * multiplier.engagement),
      comments: Math.floor(baseMetrics.comments * multiplier.engagement),
      watchTime: baseMetrics.watchTime,
      clickThroughRate: baseMetrics.clickThroughRate,
      conversionRate: baseMetrics.conversionRate,
      revenue: baseMetrics.revenue,
      completionRate: baseMetrics.completionRate,
      bounceRate: baseMetrics.bounceRate
    };
  }

  private calculateEngagementRate(metrics: any): number {
    const totalEngagement = (metrics.likes || 0) + (metrics.shares || 0) + (metrics.comments || 0);
    return metrics.views > 0 ? (totalEngagement / metrics.views) * 100 : 0;
  }

  private async completeTest(testId: string, results: PerformanceResult[], analysis?: StatisticalTest): Promise<void> {
    try {
      if (!analysis) {
        analysis = await this.performStatisticalAnalysis(results);
      }
      
      const winner = await this.determineWinner(results, analysis);
      const recommendations = await this.generateRecommendations(results, winner);
      const insights = await this.generateInsights(results, analysis);
      
      // Update test record
      await db.update(abTests)
        .set({
          status: 'completed',
          winnerVariationId: winner.variationId,
          results: results,
          confidence: analysis.confidence,
          totalEngagement: results.reduce((sum, r) => sum + r.engagementRate, 0),
          testDuration: Date.now() - (await db.select().from(abTests).where(eq(abTests.id, testId)).limit(1))[0].createdAt.getTime(),
          completedAt: new Date()
        })
        .where(eq(abTests.id, testId));
      
      // Update test status
      const testStatus = this.activeTests.get(testId);
      if (testStatus) {
        testStatus.status = 'completed';
        testStatus.progress = 100;
        testStatus.currentResults = results;
      }
      
      console.log(`[ABTesting] Completed test ${testId} with winner: ${winner.variationId}`);
    } catch (error) {
      console.error(`[ABTesting] Error completing test ${testId}:`, error);
      
      // Mark as failed
      await db.update(abTests)
        .set({ status: 'failed' })
        .where(eq(abTests.id, testId));
      
      const testStatus = this.activeTests.get(testId);
      if (testStatus) {
        testStatus.status = 'failed';
      }
    }
  }

  private async performStatisticalAnalysis(results: PerformanceResult[]): Promise<StatisticalTest> {
    // Group results by variation
    const variationGroups = this.groupResultsByVariation(results);
    
    if (variationGroups.size < 2) {
      throw new Error('Need at least 2 variations for statistical analysis');
    }
    
    const variations = Array.from(variationGroups.keys());
    const variation1 = variationGroups.get(variations[0])!;
    const variation2 = variationGroups.get(variations[1])!;
    
    // Calculate means
    const mean1 = this.calculateMean(variation1.map(r => r.engagementRate));
    const mean2 = this.calculateMean(variation2.map(r => r.engagementRate));
    
    // Calculate standard deviations
    const std1 = this.calculateStandardDeviation(variation1.map(r => r.engagementRate));
    const std2 = this.calculateStandardDeviation(variation2.map(r => r.engagementRate));
    
    // Perform t-test
    const tStat = this.calculateTStatistic(mean1, mean2, std1, std2, variation1.length, variation2.length);
    const pValue = this.calculatePValue(tStat, variation1.length + variation2.length - 2);
    
    // Calculate confidence interval
    const confidenceInterval = this.calculateConfidenceInterval(mean1, mean2, std1, std2, variation1.length, variation2.length);
    
    // Calculate effect size (Cohen's d)
    const effectSize = Math.abs(mean1 - mean2) / Math.sqrt((std1 * std1 + std2 * std2) / 2);
    
    // Calculate power
    const power = this.calculatePower(effectSize, variation1.length + variation2.length, 0.05);
    
    return {
      isSignificant: pValue < 0.05,
      pValue,
      confidenceInterval,
      effectSize,
      confidence: (1 - pValue) * 100,
      sampleSize: variation1.length + variation2.length,
      power
    };
  }

  private groupResultsByVariation(results: PerformanceResult[]): Map<string, PerformanceResult[]> {
    const groups = new Map<string, PerformanceResult[]>();
    
    for (const result of results) {
      if (!groups.has(result.variationId)) {
        groups.set(result.variationId, []);
      }
      groups.get(result.variationId)!.push(result);
    }
    
    return groups;
  }

  private calculateMean(values: number[]): number {
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  private calculateStandardDeviation(values: number[]): number {
    const mean = this.calculateMean(values);
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    const variance = this.calculateMean(squaredDiffs);
    return Math.sqrt(variance);
  }

  private calculateTStatistic(mean1: number, mean2: number, std1: number, std2: number, n1: number, n2: number): number {
    const pooledStd = Math.sqrt(((n1 - 1) * std1 * std1 + (n2 - 1) * std2 * std2) / (n1 + n2 - 2));
    const standardError = pooledStd * Math.sqrt(1/n1 + 1/n2);
    return (mean1 - mean2) / standardError;
  }

  private calculatePValue(tStat: number, degreesOfFreedom: number): number {
    // Simplified p-value calculation (in practice, use a proper t-distribution library)
    const absT = Math.abs(tStat);
    if (absT > 3.291) return 0.001; // 99.9% confidence
    if (absT > 2.576) return 0.01;  // 99% confidence
    if (absT > 1.96) return 0.05;   // 95% confidence
    return 0.1; // Not significant
  }

  private calculateConfidenceInterval(mean1: number, mean2: number, std1: number, std2: number, n1: number, n2: number): [number, number] {
    const pooledStd = Math.sqrt(((n1 - 1) * std1 * std1 + (n2 - 1) * std2 * std2) / (n1 + n2 - 2));
    const standardError = pooledStd * Math.sqrt(1/n1 + 1/n2);
    const margin = 1.96 * standardError; // 95% confidence interval
    const diff = mean1 - mean2;
    return [diff - margin, diff + margin];
  }

  private calculatePower(effectSize: number, sampleSize: number, alpha: number): number {
    // Simplified power calculation
    const criticalValue = 1.96; // For alpha = 0.05
    const zScore = effectSize * Math.sqrt(sampleSize / 2) - criticalValue;
    return this.normalCDF(zScore);
  }

  private normalCDF(z: number): number {
    // Simplified normal CDF approximation
    return 0.5 * (1 + this.erf(z / Math.sqrt(2)));
  }

  private erf(x: number): number {
    // Simplified error function approximation
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;
    
    const sign = x >= 0 ? 1 : -1;
    x = Math.abs(x);
    
    const t = 1 / (1 + p * x);
    const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    
    return sign * y;
  }

  private async determineWinner(results: PerformanceResult[], analysis: StatisticalTest): Promise<PerformanceResult> {
    // Group results by variation and calculate aggregate metrics
    const variationGroups = this.groupResultsByVariation(results);
    const variationScores: Array<{ variationId: string; score: number; result: PerformanceResult }> = [];
    
    for (const [variationId, variationResults] of variationGroups) {
      const avgEngagementRate = this.calculateMean(variationResults.map(r => r.engagementRate));
      const avgViews = this.calculateMean(variationResults.map(r => r.views));
      const avgRevenue = this.calculateMean(variationResults.map(r => r.revenue));
      const avgCompletionRate = this.calculateMean(variationResults.map(r => r.completionRate));
      
      // Calculate composite score (weighted by importance)
      const score = (avgEngagementRate * 0.3) + (avgViews * 0.2) + (avgRevenue * 0.3) + (avgCompletionRate * 0.2);
      
      variationScores.push({
        variationId,
        score,
        result: variationResults[0] // Representative result
      });
    }
    
    // Sort by score and return the winner
    variationScores.sort((a, b) => b.score - a.score);
    return variationScores[0].result;
  }

  private async generateRecommendations(results: PerformanceResult[], winner: PerformanceResult): Promise<string[]> {
    const recommendations: string[] = [];
    
    try {
      const prompt = `Analyze these A/B test results and provide actionable recommendations:

Winner Variation Performance:
- Engagement Rate: ${winner.engagementRate.toFixed(2)}%
- Views: ${winner.views}
- Revenue: $${winner.revenue.toFixed(2)}
- Completion Rate: ${winner.completionRate.toFixed(2)}%

All Results: ${JSON.stringify(results.slice(0, 5))}

Provide 3-5 specific, actionable recommendations for content optimization. Focus on:
1. What made the winner successful
2. How to apply these learnings to future content
3. Specific improvements to test next

Respond as JSON array: ["recommendation1", "recommendation2", "recommendation3"]`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_tokens: 500
      });

      const result = JSON.parse(response.choices[0].message.content || '{"recommendations":[]}');
      return result.recommendations || this.generateFallbackRecommendations(results, winner);
    } catch (error) {
      console.error('[ABTesting] Error generating AI recommendations:', error);
      return this.generateFallbackRecommendations(results, winner);
    }
  }

  private generateFallbackRecommendations(results: PerformanceResult[], winner: PerformanceResult): string[] {
    const recommendations: string[] = [];
    
    // Analyze winner characteristics
    const winnerResults = results.filter(r => r.variationId === winner.variationId);
    const avgEngagement = this.calculateMean(winnerResults.map(r => r.engagementRate));
    
    if (avgEngagement > 5) {
      recommendations.push('High engagement rate achieved - consider scaling this content format');
    }
    
    // Platform-specific recommendations
    const platformPerformance = this.analyzePlatformPerformance(results);
    for (const [platform, performance] of platformPerformance) {
      if (performance.engagementRate > 3) {
        recommendations.push(`Strong performance on ${platform} - focus content strategy here`);
      }
    }
    
    // Content optimization suggestions
    if (winner.watchTime > 0) {
      recommendations.push('Good watch time achieved - consider creating longer-form content');
    }
    
    if (winner.conversionRate > 0.1) {
      recommendations.push('High conversion rate - optimize call-to-action placement');
    }
    
    return recommendations;
  }

  private analyzePlatformPerformance(results: PerformanceResult[]): Map<string, { engagementRate: number; views: number }> {
    const platformStats = new Map<string, { engagementRate: number; views: number }>();
    
    for (const result of results) {
      if (!platformStats.has(result.platform)) {
        platformStats.set(result.platform, { engagementRate: 0, views: 0 });
      }
      
      const stats = platformStats.get(result.platform)!;
      stats.engagementRate += result.engagementRate;
      stats.views += result.views;
    }
    
    // Calculate averages
    for (const [platform, stats] of platformStats) {
      const count = results.filter(r => r.platform === platform).length;
      stats.engagementRate /= count;
      stats.views /= count;
    }
    
    return platformStats;
  }

  private async generateInsights(results: PerformanceResult[], analysis: StatisticalTest): Promise<string[]> {
    const insights: string[] = [];
    
    try {
      const prompt = `Analyze these A/B test statistical results and provide key insights:

Statistical Analysis:
- P-value: ${analysis.pValue.toFixed(4)}
- Confidence: ${analysis.confidence.toFixed(1)}%
- Effect Size: ${analysis.effectSize.toFixed(3)}
- Sample Size: ${analysis.sampleSize}
- Power: ${analysis.power.toFixed(3)}

Results Summary: ${results.length} data points across variations

Provide 3-5 key insights about:
1. Statistical significance and reliability
2. Practical significance of the results
3. Sample size adequacy
4. Recommendations for future testing

Respond as JSON array: ["insight1", "insight2", "insight3"]`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_tokens: 400
      });

      const result = JSON.parse(response.choices[0].message.content || '{"insights":[]}');
      return result.insights || this.generateFallbackInsights(analysis);
    } catch (error) {
      console.error('[ABTesting] Error generating AI insights:', error);
      return this.generateFallbackInsights(analysis);
    }
  }

  private generateFallbackInsights(analysis: StatisticalTest): string[] {
    const insights: string[] = [];
    
    if (analysis.isSignificant) {
      insights.push(`Test results are statistically significant with ${analysis.confidence.toFixed(1)}% confidence`);
    } else {
      insights.push('Test results are not statistically significant - consider running longer or with larger sample');
    }
    
    if (analysis.effectSize > 0.5) {
      insights.push('Large effect size detected - winner variation shows substantial improvement');
    } else if (analysis.effectSize > 0.2) {
      insights.push('Medium effect size - meaningful difference between variations');
    } else {
      insights.push('Small effect size - differences may not be practically significant');
    }
    
    if (analysis.power < 0.8) {
      insights.push('Low statistical power - consider increasing sample size for future tests');
    }
    
    return insights;
  }

  async getTestStatus(testId: string): Promise<ABTestStatus | null> {
    return this.activeTests.get(testId) || null;
  }

  async getTestResults(testId: string): Promise<ABTestResult | null> {
    try {
      const testRecord = await db.select().from(abTests).where(eq(abTests.id, testId)).limit(1);
      if (testRecord.length === 0) return null;
      
      const test = testRecord[0];
      if (test.status !== 'completed') return null;
      
      return {
        testId: test.id,
        winner: test.winnerVariationId || '',
        results: test.results as PerformanceResult[],
        recommendations: [], // Would need to be stored or regenerated
        confidence: test.confidence || 0,
        totalEngagement: test.totalEngagement || 0,
        testDuration: test.testDuration || 0,
        statisticalAnalysis: await this.performStatisticalAnalysis(test.results as PerformanceResult[]),
        insights: []
      };
    } catch (error) {
      console.error(`[ABTesting] Error getting test results for ${testId}:`, error);
      return null;
    }
  }

  async cancelTest(testId: string): Promise<void> {
    try {
      await db.update(abTests)
        .set({ status: 'cancelled' })
        .where(eq(abTests.id, testId));
      
      const testStatus = this.activeTests.get(testId);
      if (testStatus) {
        testStatus.status = 'cancelled';
      }
      
      console.log(`[ABTesting] Cancelled test ${testId}`);
    } catch (error) {
      console.error(`[ABTesting] Error cancelling test ${testId}:`, error);
      throw error;
    }
  }

  async getUserTests(userId: string): Promise<Array<{
    testId: string;
    testName: string;
    status: string;
    createdAt: Date;
    completedAt?: Date;
    winnerVariationId?: string;
  }>> {
    try {
      const tests = await db.select().from(abTests).where(eq(abTests.userId, userId));
      
      return tests.map(test => ({
        testId: test.id,
        testName: (test.testConfig as any)?.testName || 'Unnamed Test',
        status: test.status,
        createdAt: test.createdAt,
        completedAt: test.completedAt || undefined,
        winnerVariationId: test.winnerVariationId || undefined
      }));
    } catch (error) {
      console.error(`[ABTesting] Error getting tests for user ${userId}:`, error);
      return [];
    }
  }
}

export const abTestingService = new ABTestingService(); 