import {
  users,
  uploads,
  transcripts,
  segments,
  clips,
  socialAccounts,
  socialPosts,
  scheduledPosts,
  subscriptions,
  invoices,
  usageRecords,
  revenueRecords,
  featureFlags,
  voiceProfiles,

  ctaConfigs,
  ctaPerformance,
  workspaces,
  workspaceMembers,
  workspaceUsage,
  type User,
  type UpsertUser,
  type Upload,
  type InsertUpload,
  type Transcript,
  type InsertTranscript,
  type Segment,
  type InsertSegment,
  type Clip,
  type InsertClip,
  type SocialAccount,
  type SocialPost,
  type InsertSocialPost,
  type ScheduledPost,
  type RevenueRecord,
  type InsertRevenueRecord,
  type FeatureFlag,
  type InsertFeatureFlag,

  type CTAConfig,
  type InsertCTAConfig,
  type CTAPerformance,
  type Workspace,
  type InsertWorkspace,
  type WorkspaceMember,
  type InsertWorkspaceMember,
  type WorkspaceUsage,
  type InsertWorkspaceUsage,
  type VoiceProfile,
  type InsertVoiceProfile,
  type UploadSession,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql, inArray } from "drizzle-orm";
import fs from "fs";

export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Upload operations
  createUpload(upload: InsertUpload): Promise<Upload>;
  getUpload(id: string): Promise<Upload | undefined>;
  getUserUploads(userId: string): Promise<Upload[]>;
  updateUploadStatus(id: string, status: string): Promise<void>;
  
  // Transcript operations
  createTranscript(transcript: InsertTranscript): Promise<Transcript>;
  getTranscriptByUploadId(uploadId: string): Promise<Transcript | undefined>;
  
  // Segment operations
  createSegments(segments: InsertSegment[]): Promise<Segment[]>;
  getSegmentsByUploadId(uploadId: string): Promise<Segment[]>;
  
  // Clip operations
  createClip(clip: InsertClip): Promise<Clip>;
  getClipsBySegmentId(segmentId: string): Promise<Clip[]>;
  getClipsByUploadId(uploadId: string): Promise<Clip[]>;
  updateClipStatus(id: string, status: string): Promise<void>;
  
  // Social account operations
  getUserSocialAccounts(userId: string): Promise<SocialAccount[]>;
  getSocialAccount(id: string): Promise<SocialAccount | undefined>;
  getSocialAccountsByPlatform(platform: string): Promise<SocialAccount[]>;
  createSocialAccount(account: any): Promise<SocialAccount>;
  updateSocialAccountStatus(id: string, isActive: boolean): Promise<void>;
  updateSocialAccountToken(id: string, tokenData: any): Promise<void>;
  updateSocialAccount(id: string, data: any): Promise<void>;
  getSocialAccountByUserAndPlatform(
    userId: string,
    platform: string
  ): Promise<SocialAccount | undefined>;
  getAllSocialAccounts(): Promise<SocialAccount[]>;
  deleteSocialAccount(id: string): Promise<void>;
  getAllUsers(): Promise<User[]>;
  
  // Social post operations
  createSocialPost(socialPost: InsertSocialPost): Promise<SocialPost>;
  getSocialPost(id: string): Promise<SocialPost | undefined>;
  getSocialPostsBySegmentId(segmentId: string): Promise<SocialPost[]>;
  getSocialPostsByUploadId(uploadId: string): Promise<SocialPost[]>;
  getSocialPostsByUserId(userId: string, status?: string): Promise<SocialPost[]>;
  updateSocialPostStatus(id: string, status: string): Promise<void>;
  updateSocialPost(id: string, data: any): Promise<void>;
  updateSocialPostSchedule(id: string, scheduledFor: string): Promise<void>;

  // Revenue records
  createRevenueRecord(record: InsertRevenueRecord): Promise<RevenueRecord>;
  getRevenueRecordsByUserId(userId: string, days?: number): Promise<RevenueRecord[]>;

  // CTA config operations
  createCTAConfig(config: InsertCTAConfig): Promise<CTAConfig>;
  getCTAConfigsByUser(userId: string): Promise<CTAConfig[]>;
  updateCTAConfig(id: string, updates: Partial<CTAConfig>): Promise<CTAConfig | undefined>;
  deleteCTAConfig(id: string): Promise<void>;
  incrementCTAPerformance(ctaId: string, postId: string, platform: string, clicks: number, conversions: number, revenue: number): Promise<void>;
  getCTAPerformance(ctaIds: string[], since: Date): Promise<CTAPerformance[]>;

  // Workspace operations
  createWorkspace(data: InsertWorkspace): Promise<Workspace>;
  getWorkspacesByUser(userId: string): Promise<Workspace[]>;
  getWorkspace(id: string): Promise<Workspace | undefined>;
  updateWorkspace(id: string, updates: Partial<Workspace>): Promise<void>;
  deleteWorkspace(id: string): Promise<void>;
  addWorkspaceMember(member: InsertWorkspaceMember): Promise<WorkspaceMember>;
  getWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]>;
  updateWorkspaceMember(id: string, updates: Partial<WorkspaceMember>): Promise<void>;
  removeWorkspaceMember(id: string): Promise<void>;
  recordWorkspaceUsage(data: InsertWorkspaceUsage): Promise<void>;
  getWorkspaceUsage(workspaceId: string, since: Date): Promise<WorkspaceUsage[]>;

  // Voice profile operations
  createVoiceProfile(profile: InsertVoiceProfile): Promise<VoiceProfile>;
  getVoiceProfilesByUser(userId: string): Promise<VoiceProfile[]>;
  updateVoiceProfile(id: string, updates: Partial<VoiceProfile>): Promise<void>;
  getAllVoiceProfiles(): Promise<VoiceProfile[]>;

  // Scheduled posts operations
  getScheduledPostsByUserId(userId: string): Promise<any[]>;

  // Analytics
  getUserStats(userId: string): Promise<{
    totalUploads: number;
    contentGenerated: number;
    postsScheduled: number;
    totalEngagement: number;
  }>;

  // Feature flags
  getFeatureFlags(): Promise<FeatureFlag[]>;
  getFeatureFlag(name: string): Promise<FeatureFlag | undefined>;
  createFeatureFlag(flag: InsertFeatureFlag): Promise<FeatureFlag>;
  updateFeatureFlag(name: string, data: Partial<InsertFeatureFlag>): Promise<void>;
  deleteFeatureFlag(name: string): Promise<void>;

  // Account removal
  deleteUserData(userId: string): Promise<void>;

  // Upload session operations (persistent resumable uploads)
  createUploadSession(session: UploadSession): Promise<UploadSession>;
  getUploadSession(id: string): Promise<UploadSession | undefined>;
  updateUploadSession(id: string, updates: Partial<UploadSession>): Promise<void>;
  getUserUploadSessions(userId: string): Promise<UploadSession[]>;
  deleteUploadSession(id: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  // Upload operations
  async createUpload(upload: InsertUpload): Promise<Upload> {
    const [newUpload] = await db.insert(uploads).values(upload).returning();
    return newUpload;
  }

  async getUpload(id: string): Promise<Upload | undefined> {
    const [upload] = await db.select().from(uploads).where(eq(uploads.id, id));
    return upload;
  }

  async getUserUploads(userId: string): Promise<Upload[]> {
    return await db
      .select()
      .from(uploads)
      .where(eq(uploads.userId, userId))
      .orderBy(desc(uploads.createdAt));
  }

  async updateUploadStatus(id: string, status: string): Promise<void> {
    await db
      .update(uploads)
      .set({ status, updatedAt: new Date() })
      .where(eq(uploads.id, id));
  }

  // Transcript operations
  async createTranscript(transcript: InsertTranscript): Promise<Transcript> {
    const [newTranscript] = await db.insert(transcripts).values(transcript).returning();
    return newTranscript;
  }

  async getTranscriptByUploadId(uploadId: string): Promise<Transcript | undefined> {
    const [transcript] = await db
      .select()
      .from(transcripts)
      .where(eq(transcripts.uploadId, uploadId));
    return transcript;
  }

  // Segment operations
  async createSegments(segmentList: InsertSegment[]): Promise<Segment[]> {
    return await db.insert(segments).values(segmentList).returning();
  }

  async getSegmentsByUploadId(uploadId: string): Promise<Segment[]> {
    return await db
      .select()
      .from(segments)
      .where(eq(segments.uploadId, uploadId))
      .orderBy(segments.order);
  }

  async getSegment(segmentId: string): Promise<Segment | null> {
    const [segment] = await db
      .select()
      .from(segments)
      .where(eq(segments.id, segmentId));
    return segment || null;
  }

  // Clip operations
  async createClip(clip: InsertClip): Promise<Clip> {
    const [newClip] = await db.insert(clips).values(clip).returning();
    return newClip;
  }

  async getClipsBySegmentId(segmentId: string): Promise<Clip[]> {
    return await db.select().from(clips).where(eq(clips.segmentId, segmentId));
  }

  async getClipsByUploadId(uploadId: string): Promise<Clip[]> {
    return await db
      .select({
        id: clips.id,
        segmentId: clips.segmentId,
        type: clips.type,
        filePath: clips.filePath,
        content: clips.content,
        metadata: clips.metadata,
        status: clips.status,
        createdAt: clips.createdAt,
      })
      .from(clips)
      .innerJoin(segments, eq(clips.segmentId, segments.id))
      .where(eq(segments.uploadId, uploadId));
  }

  async updateClipStatus(id: string, status: string): Promise<void> {
    await db.update(clips).set({ status }).where(eq(clips.id, id));
  }

  // Social account operations
  async getUserSocialAccounts(userId: string): Promise<SocialAccount[]> {
    return await db
      .select()
      .from(socialAccounts)
      .where(and(eq(socialAccounts.userId, userId), eq(socialAccounts.isActive, true)));
  }

  async getSocialAccount(id: string): Promise<SocialAccount | undefined> {
    const [account] = await db
      .select()
      .from(socialAccounts)
      .where(eq(socialAccounts.id, id));
    return account;
  }

  // Analytics
  async getUserStats(userId: string): Promise<{
    totalUploads: number;
    contentGenerated: number;
    postsScheduled: number;
    totalEngagement: number;
  }> {
    // Get total uploads
    const totalUploadsResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(uploads)
      .where(eq(uploads.userId, userId));

    // Get content generated (clips)
    const contentGeneratedResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(clips)
      .innerJoin(segments, eq(clips.segmentId, segments.id))
      .innerJoin(uploads, eq(segments.uploadId, uploads.id))
      .where(eq(uploads.userId, userId));

    // Get posts scheduled
    const postsScheduledResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(scheduledPosts)
      .innerJoin(clips, eq(scheduledPosts.clipId, clips.id))
      .innerJoin(segments, eq(clips.segmentId, segments.id))
      .innerJoin(uploads, eq(segments.uploadId, uploads.id))
      .where(eq(uploads.userId, userId));

    return {
      totalUploads: totalUploadsResult[0]?.count || 0,
      contentGenerated: contentGeneratedResult[0]?.count || 0,
      postsScheduled: postsScheduledResult[0]?.count || 0,
      totalEngagement: 0, // Placeholder for now
    };
  }

  // Social post operations
  async createSocialPost(socialPostData: InsertSocialPost): Promise<SocialPost> {
    const [socialPost] = await db
      .insert(socialPosts)
      .values(socialPostData)
      .returning();
    return socialPost;
  }

  async getSocialPostsBySegmentId(segmentId: string): Promise<SocialPost[]> {
    return await db
      .select()
      .from(socialPosts)
      .where(eq(socialPosts.segmentId, segmentId))
      .orderBy(desc(socialPosts.createdAt));
  }

  async getSocialPostsByUploadId(uploadId: string): Promise<SocialPost[]> {
    const results = await db
      .select({
        id: socialPosts.id,
        segmentId: socialPosts.segmentId,
        platform: socialPosts.platform,
        content: socialPosts.content,
        scheduledFor: socialPosts.scheduledFor,
        postedAt: socialPosts.postedAt,
        status: socialPosts.status,
        engagement: socialPosts.engagement,
        createdAt: socialPosts.createdAt,
        updatedAt: socialPosts.updatedAt,
      })
      .from(socialPosts)
      .innerJoin(segments, eq(socialPosts.segmentId, segments.id))
      .where(eq(segments.uploadId, uploadId))
      .orderBy(desc(socialPosts.createdAt));
    
    return results;
  }

  async updateSocialPostStatus(id: string, status: string): Promise<void> {
    await db
      .update(socialPosts)
      .set({ status, updatedAt: new Date() })
      .where(eq(socialPosts.id, id));
  }

  async updateSocialPostSchedule(id: string, scheduledFor: string): Promise<void> {
    await db
      .update(socialPosts)
      .set({ 
        scheduledFor: new Date(scheduledFor),
        status: 'scheduled',
        updatedAt: new Date() 
      })
      .where(eq(socialPosts.id, id));
  }

  async getSocialPostsByUserId(userId: string, status?: string): Promise<SocialPost[]> {
    const uploads = await this.getUserUploads(userId);
    
    if (uploads.length === 0) return [];
    
    // Get all social posts for this user's uploads
    let allPosts: SocialPost[] = [];
    for (const upload of uploads) {
      const posts = await this.getSocialPostsByUploadId(upload.id);
      allPosts.push(...posts);
    }
    
    // Filter by status if provided
    if (status) {
      allPosts = allPosts.filter(post => post.status === status);
    }
    
    return allPosts;
  }

  async getScheduledPostsByUserId(userId: string): Promise<any[]> {
    const uploads = await this.getUserUploads(userId);
    
    if (uploads.length === 0) return [];
    
    let allScheduledPosts: any[] = [];
    
    for (const upload of uploads) {
      const segments = await this.getSegmentsByUploadId(upload.id);
      for (const segment of segments) {
        const posts = await this.getSocialPostsBySegmentId(segment.id);
        const scheduledPosts = posts
          .filter(post => post.scheduledFor)
          .map(post => ({
            id: post.id,
            content: post.content,
            platform: post.platform,
            scheduledFor: post.scheduledFor,
            status: post.status,
            segmentTitle: segment.title,
          }));
        allScheduledPosts.push(...scheduledPosts);
      }
    }
    
    return allScheduledPosts.sort((a, b) => 
      new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime()
    );
  }

  async createSocialAccount(accountData: any): Promise<SocialAccount> {
    const [account] = await db
      .insert(socialAccounts)
      .values(accountData)
      .returning();
    return account;
  }

  async updateSocialAccountStatus(id: string, isActive: boolean): Promise<void> {
    await db
      .update(socialAccounts)
      .set({ isActive })
      .where(eq(socialAccounts.id, id));
  }

  async updateSocialAccountToken(id: string, tokenData: any): Promise<void> {
    await db
      .update(socialAccounts)
      .set(tokenData)
      .where(eq(socialAccounts.id, id));
  }

  async updateSocialAccount(id: string, data: any): Promise<void> {
    await db
      .update(socialAccounts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(socialAccounts.id, id));
  }

  async getSocialAccountByUserAndPlatform(
    userId: string,
    platform: string
  ): Promise<SocialAccount | undefined> {
    const [account] = await db
      .select()
      .from(socialAccounts)
      .where(
        and(eq(socialAccounts.userId, userId), eq(socialAccounts.platform, platform))
      );
    return account;
  }

  async getAllSocialAccounts(): Promise<SocialAccount[]> {
    return await db.select().from(socialAccounts);
  }

  async deleteSocialAccount(id: string): Promise<void> {
    await db
      .delete(socialAccounts)
      .where(eq(socialAccounts.id, id));
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async getSocialAccountsByPlatform(platform: string): Promise<SocialAccount[]> {
    return await db
      .select()
      .from(socialAccounts)
      .where(eq(socialAccounts.platform, platform));
  }

  async getSocialPost(id: string): Promise<SocialPost | undefined> {
    const [post] = await db
      .select()
      .from(socialPosts)
      .where(eq(socialPosts.id, id));
    return post;
  }

  async updateSocialPost(id: string, data: any): Promise<void> {
    await db
      .update(socialPosts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(socialPosts.id, id));
  }

  async createRevenueRecord(record: InsertRevenueRecord): Promise<RevenueRecord> {
    const [r] = await db.insert(revenueRecords).values(record).returning();
    return r;
  }

  async getRevenueRecordsByUserId(userId: string, days: number = 30): Promise<RevenueRecord[]> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return await db
      .select()
      .from(revenueRecords)
      .where(and(eq(revenueRecords.userId, userId), sql`${revenueRecords.date} >= ${since}`))
      .orderBy(desc(revenueRecords.date));
  }

  // Feature flags
  async getFeatureFlags(): Promise<FeatureFlag[]> {
    return await db.select().from(featureFlags);
  }

  async getFeatureFlag(name: string): Promise<FeatureFlag | undefined> {
    const [flag] = await db
      .select()
      .from(featureFlags)
      .where(eq(featureFlags.name, name));
    return flag;
  }

  async createFeatureFlag(flag: InsertFeatureFlag): Promise<FeatureFlag> {
    const [f] = await db.insert(featureFlags).values(flag).returning();
    return f;
  }

  async updateFeatureFlag(name: string, data: Partial<InsertFeatureFlag>): Promise<void> {
    await db
      .update(featureFlags)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(featureFlags.name, name));
  }

  async deleteFeatureFlag(name: string): Promise<void> {
    await db.delete(featureFlags).where(eq(featureFlags.name, name));
  }

  // CTA config operations
  async createCTAConfig(config: InsertCTAConfig): Promise<CTAConfig> {
    const [c] = await db.insert(ctaConfigs).values(config).returning();
    return c;
  }

  async getCTAConfigsByUser(userId: string): Promise<CTAConfig[]> {
    return await db.select().from(ctaConfigs).where(eq(ctaConfigs.userId, userId));
  }

  async updateCTAConfig(id: string, updates: Partial<CTAConfig>): Promise<CTAConfig | undefined> {
    const [c] = await db
      .update(ctaConfigs)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(ctaConfigs.id, id))
      .returning();
    return c;
  }

  async deleteCTAConfig(id: string): Promise<void> {
    await db.delete(ctaConfigs).where(eq(ctaConfigs.id, id));
  }

  async incrementCTAPerformance(
    ctaId: string,
    postId: string,
    platform: string,
    clicks: number,
    conversions: number,
    revenue: number
  ): Promise<void> {
    const [existing] = await db
      .select()
      .from(ctaPerformance)
      .where(
        and(
          eq(ctaPerformance.ctaId, ctaId),
          eq(ctaPerformance.postId, postId),
          eq(ctaPerformance.platform, platform)
        )
      );

    if (existing) {
      await db
        .update(ctaPerformance)
        .set({
          clicks: sql`${ctaPerformance.clicks} + ${clicks}`,
          conversions: sql`${ctaPerformance.conversions} + ${conversions}`,
          revenue: sql`${ctaPerformance.revenue} + ${String(revenue)}`,
        })
        .where(eq(ctaPerformance.id, existing.id));
    } else {
      await db.insert(ctaPerformance).values({
        ctaId,
        postId,
        platform,
        clicks,
        conversions,
        revenue: String(revenue),
        date: new Date(),
      });
    }
  }

  async getCTAPerformance(ctaIds: string[], since: Date): Promise<CTAPerformance[]> {
    if (ctaIds.length === 0) return [];
    return await db
      .select()
      .from(ctaPerformance)
      .where(and(inArray(ctaPerformance.ctaId, ctaIds), sql`${ctaPerformance.date} >= ${since}`));
  }

  // Workspace operations
  async createWorkspace(data: InsertWorkspace): Promise<Workspace> {
    const [ws] = await db.insert(workspaces).values(data).returning();
    return ws;
  }

  async getWorkspacesByUser(userId: string): Promise<Workspace[]> {
    return await db.select().from(workspaces).where(eq(workspaces.ownerId, userId));
  }

  async getWorkspace(id: string): Promise<Workspace | undefined> {
    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, id));
    return ws;
  }

  async updateWorkspace(id: string, updates: Partial<Workspace>): Promise<void> {
    await db
      .update(workspaces)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(workspaces.id, id));
  }

  async deleteWorkspace(id: string): Promise<void> {
    await db.delete(workspaces).where(eq(workspaces.id, id));
  }

  async addWorkspaceMember(member: InsertWorkspaceMember): Promise<WorkspaceMember> {
    const [m] = await db.insert(workspaceMembers).values(member).returning();
    return m;
  }

  async getWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    return await db.select().from(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceId));
  }

  async updateWorkspaceMember(id: string, updates: Partial<WorkspaceMember>): Promise<void> {
    await db.update(workspaceMembers).set(updates).where(eq(workspaceMembers.id, id));
  }

  async removeWorkspaceMember(id: string): Promise<void> {
    await db.delete(workspaceMembers).where(eq(workspaceMembers.id, id));
  }

  async recordWorkspaceUsage(data: InsertWorkspaceUsage): Promise<void> {
    await db.insert(workspaceUsage).values(data);
  }

  async getWorkspaceUsage(workspaceId: string, since: Date): Promise<WorkspaceUsage[]> {
    return await db
      .select()
      .from(workspaceUsage)
      .where(and(eq(workspaceUsage.workspaceId, workspaceId), sql`${workspaceUsage.date} >= ${since}`));
  }

  // Voice profile operations
  async createVoiceProfile(profile: InsertVoiceProfile): Promise<VoiceProfile> {
    const [vp] = await db.insert(voiceProfiles).values(profile).returning();
    return vp;
  }

  async getVoiceProfilesByUser(userId: string): Promise<VoiceProfile[]> {
    return await db.select().from(voiceProfiles).where(eq(voiceProfiles.userId, userId));
  }

  async updateVoiceProfile(id: string, updates: Partial<VoiceProfile>): Promise<void> {
    await db.update(voiceProfiles).set({ ...updates, updatedAt: new Date() }).where(eq(voiceProfiles.id, id));
  }

  async getAllVoiceProfiles(): Promise<VoiceProfile[]> {
    return await db.select().from(voiceProfiles);
  }

  async deleteUserData(userId: string): Promise<void> {
    const uploadsList = await this.getUserUploads(userId);
    for (const up of uploadsList) {
      if (up.filePath && fs.existsSync(up.filePath)) {
        fs.unlinkSync(up.filePath);
      }
      const clipsList = await this.getClipsByUploadId(up.id);
      for (const clip of clipsList) {
        if (clip.filePath && fs.existsSync(clip.filePath)) {
          fs.unlinkSync(clip.filePath);
        }
      }
    }

    await db.delete(uploads).where(eq(uploads.userId, userId));
    await db.delete(socialAccounts).where(eq(socialAccounts.userId, userId));
    await db.delete(subscriptions).where(eq(subscriptions.userId, userId));
    await db.delete(invoices).where(eq(invoices.userId, userId));
    await db.delete(usageRecords).where(eq(usageRecords.userId, userId));
    await db.delete(revenueRecords).where(eq(revenueRecords.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  }

  // Upload session operations (persistent resumable uploads)
  async createUploadSession(session: UploadSession): Promise<UploadSession> {
    const [newSession] = await db
      .insert('upload_sessions')
      .values({
        id: session.id,
        user_id: session.userId,
        platform: session.platform,
        file_name: session.fileName,
        file_size: session.fileSize,
        upload_url: session.uploadUrl,
        upload_id: session.uploadId,
        chunks: JSON.stringify(session.chunks),
        status: session.status,
        created_at: session.createdAt,
        completed_at: session.completedAt,
        updated_at: session.updatedAt,
      })
      .returning();
    return {
      ...newSession,
      userId: newSession.user_id,
      fileName: newSession.file_name,
      fileSize: newSession.file_size,
      uploadUrl: newSession.upload_url,
      uploadId: newSession.upload_id,
      chunks: JSON.parse(newSession.chunks),
      createdAt: newSession.created_at,
      completedAt: newSession.completed_at,
      updatedAt: newSession.updated_at,
    };
  }

  async getUploadSession(id: string): Promise<UploadSession | undefined> {
    const [session] = await db
      .select()
      .from('upload_sessions')
      .where(sql`id = ${id}`);
    if (!session) return undefined;
    return {
      ...session,
      userId: session.user_id,
      fileName: session.file_name,
      fileSize: session.file_size,
      uploadUrl: session.upload_url,
      uploadId: session.upload_id,
      chunks: JSON.parse(session.chunks),
      createdAt: session.created_at,
      completedAt: session.completed_at,
      updatedAt: session.updated_at,
    };
  }

  async updateUploadSession(id: string, updates: Partial<UploadSession>): Promise<void> {
    const updateObj: any = { updated_at: new Date() };
    if (updates.status) updateObj.status = updates.status;
    if (updates.uploadUrl) updateObj.upload_url = updates.uploadUrl;
    if (updates.uploadId) updateObj.upload_id = updates.uploadId;
    if (updates.chunks) updateObj.chunks = JSON.stringify(updates.chunks);
    if (updates.completedAt) updateObj.completed_at = updates.completedAt;
    await db
      .update('upload_sessions')
      .set(updateObj)
      .where(sql`id = ${id}`);
  }

  async getUserUploadSessions(userId: string): Promise<UploadSession[]> {
    const sessions = await db
      .select()
      .from('upload_sessions')
      .where(sql`user_id = ${userId}`);
    return sessions.map((session: any) => ({
      ...session,
      userId: session.user_id,
      fileName: session.file_name,
      fileSize: session.file_size,
      uploadUrl: session.upload_url,
      uploadId: session.upload_id,
      chunks: JSON.parse(session.chunks),
      createdAt: session.created_at,
      completedAt: session.completed_at,
      updatedAt: session.updated_at,
    }));
  }

  async deleteUploadSession(id: string): Promise<void> {
    await db.delete('upload_sessions').where(sql`id = ${id}`);
  }
}

export const storage = new DatabaseStorage();
