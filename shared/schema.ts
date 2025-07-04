import {
  pgTable,
  text,
  varchar,
  timestamp,
  jsonb,
  index,
  uuid,
  numeric,
  integer,
  boolean,
} from "drizzle-orm/pg-core";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Session storage table (required for Replit Auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table (required for Replit Auth)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().notNull(),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  stripeCustomerId: varchar("stripe_customer_id"),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  subscriptionStatus: varchar("subscription_status").default("free"), // free, active, past_due, canceled
  subscriptionTier: varchar("subscription_tier").default("free"), // free, starter, pro, enterprise
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Core AutoStage tables
export const uploads = pgTable("uploads", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  filename: varchar("filename").notNull(),
  originalName: varchar("original_name").notNull(),
  filePath: varchar("file_path").notNull(),
  fileSize: integer("file_size").notNull(),
  mimeType: varchar("mime_type").notNull(),
  duration: numeric("duration"),
  status: varchar("status").default("uploaded").notNull(), // uploaded, transcribing, segmenting, processing, completed, failed
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const transcripts = pgTable("transcripts", {
  id: uuid("id").primaryKey().defaultRandom(),
  uploadId: uuid("upload_id").references(() => uploads.id, { onDelete: "cascade" }).notNull(),
  text: text("text").notNull(),
  wordTimestamps: jsonb("word_timestamps"), // Whisper word-level timestamps
  language: varchar("language"),
  confidence: numeric("confidence"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const segments = pgTable("segments", {
  id: uuid("id").primaryKey().defaultRandom(),
  uploadId: uuid("upload_id").references(() => uploads.id, { onDelete: "cascade" }).notNull(),
  title: varchar("title").notNull(),
  summary: text("summary"),
  startTime: numeric("start_time").notNull(),
  endTime: numeric("end_time").notNull(),
  transcript: text("transcript"),
  order: integer("order").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const clips = pgTable("clips", {
  id: uuid("id").primaryKey().defaultRandom(),
  segmentId: uuid("segment_id").references(() => segments.id, { onDelete: "cascade" }).notNull(),
  type: varchar("type").notNull(), // vertical_short, quote_graphic, social_post
  filePath: varchar("file_path"),
  content: text("content"), // For text-based content like social posts
  metadata: jsonb("metadata"), // Additional clip-specific data
  status: varchar("status").default("pending").notNull(), // pending, processing, completed, failed
  createdAt: timestamp("created_at").defaultNow(),
});

export const socialAccounts = pgTable("social_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  platform: varchar("platform").notNull(), // twitter, linkedin, youtube, tiktok, instagram
  accountId: varchar("account_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const socialPosts = pgTable("social_posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  segmentId: uuid("segment_id").references(() => segments.id, { onDelete: "cascade" }).notNull(),
  platform: varchar("platform").notNull(), // 'tiktok', 'instagram', 'linkedin', 'twitter', 'instagram_graphic', etc.
  content: text("content").notNull(),
  scheduledFor: timestamp("scheduled_for"),
  postedAt: timestamp("posted_at"),
  status: varchar("status").notNull().default('draft'), // 'draft', 'scheduled', 'posted', 'failed'
  engagement: jsonb("engagement"), // likes, shares, comments, etc.
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const scheduledPosts = pgTable("scheduled_posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  clipId: uuid("clip_id").references(() => clips.id, { onDelete: "cascade" }).notNull(),
  socialAccountId: uuid("social_account_id").references(() => socialAccounts.id, { onDelete: "cascade" }).notNull(),
  content: text("content").notNull(),
  scheduledFor: timestamp("scheduled_for").notNull(),
  status: varchar("status").default("scheduled").notNull(), // scheduled, posted, failed
  platformPostId: varchar("platform_post_id"),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const featureFlags = pgTable("feature_flags", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name").unique().notNull(),
  enabled: boolean("enabled").default(false).notNull(),
  rolloutRules: jsonb("rollout_rules"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const abTests = pgTable("ab_tests", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  contentId: uuid("content_id").references(() => uploads.id).notNull(),
  testConfig: jsonb("test_config").notNull(),
  status: varchar("status").default("running").notNull(), // running, completed, failed, cancelled
  winnerVariationId: varchar("winner_variation_id"),
  results: jsonb("results"),
  confidence: numeric("confidence"),
  totalEngagement: integer("total_engagement").default(0),
  testDuration: integer("test_duration"), // in milliseconds
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const revenueRecords = pgTable("revenue_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  postId: uuid("post_id").references(() => socialPosts.id).notNull(),
  platform: varchar("platform").notNull(),
  date: timestamp("date").notNull(),
  views: integer("views").default(0),
  cpm: numeric("cpm"),
  rpm: numeric("rpm"),
  earnings: numeric("earnings").default('0'),
  adRevenue: numeric("ad_revenue").default('0'),
  sponsorshipRevenue: numeric("sponsorship_revenue").default('0'),
  affiliateRevenue: numeric("affiliate_revenue").default('0'),
  merchRevenue: numeric("merch_revenue").default('0'),
  createdAt: timestamp("created_at").defaultNow(),
});

export const voiceProfiles = pgTable('voice_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: varchar('user_id').references(() => users.id).notNull(),
  name: varchar('name').notNull(),
  description: text('description'),
  sampleTexts: jsonb('sample_texts').$type<string[]>(),
  embedding: jsonb('embedding').$type<number[]>(),
  characteristics: jsonb('characteristics').$type<Record<string, any>>(),
  platformAdaptations: jsonb('platform_adaptations').$type<Record<string, any>>(),
  isActive: boolean('is_active').default(true).notNull(),
  lastTrainedAt: timestamp('last_trained_at').defaultNow(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Relations
export const uploadsRelations = relations(uploads, ({ one, many }) => ({
  user: one(users, {
    fields: [uploads.userId],
    references: [users.id],
  }),
  transcript: one(transcripts),
  segments: many(segments),
}));

export const transcriptsRelations = relations(transcripts, ({ one }) => ({
  upload: one(uploads, {
    fields: [transcripts.uploadId],
    references: [uploads.id],
  }),
}));

export const segmentsRelations = relations(segments, ({ one, many }) => ({
  upload: one(uploads, {
    fields: [segments.uploadId],
    references: [uploads.id],
  }),
  clips: many(clips),
  socialPosts: many(socialPosts),
}));

export const socialPostsRelations = relations(socialPosts, ({ one }) => ({
  segment: one(segments, {
    fields: [socialPosts.segmentId],
    references: [segments.id],
  }),
}));

export const clipsRelations = relations(clips, ({ one, many }) => ({
  segment: one(segments, {
    fields: [clips.segmentId],
    references: [segments.id],
  }),
  scheduledPosts: many(scheduledPosts),
}));

// Insert schemas
export const insertUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  profileImageUrl: z.string().url().optional(),
  stripeCustomerId: z.string().optional(),
  stripeSubscriptionId: z.string().optional(),
  subscriptionStatus: z.string().optional(),
  subscriptionTier: z.string().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const insertUploadSchema = z.object({
  userId: z.string().uuid(),
  filename: z.string(),
  originalName: z.string(),
  filePath: z.string(),
  fileSize: z.number(),
  mimeType: z.string(),
  duration: z.number().nullable().optional(),
  status: z.string().optional(),
});

export const insertTranscriptSchema = z.object({
  uploadId: z.string().uuid(),
  text: z.string(),
  wordTimestamps: z.record(z.string(), z.number()).optional(),
  language: z.string().optional(),
  confidence: z.number().optional(),
});

export const insertSegmentSchema = z.object({
  uploadId: z.string().uuid(),
  title: z.string(),
  summary: z.string().optional(),
  startTime: z.number(),
  endTime: z.number(),
  transcript: z.string().optional(),
  order: z.number(),
});

export const insertClipSchema = z.object({
  segmentId: z.string().uuid(),
  type: z.string(),
  filePath: z.string().optional(),
  content: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  status: z.string(),
});

export const insertSocialPostSchema = z.object({
  segmentId: z.string().uuid(),
  platform: z.string(),
  content: z.string(),
  scheduledFor: z.date().optional(),
  status: z.string(),
  engagement: z.record(z.string(), z.number()).optional(),
});

export const insertRevenueRecordSchema = z.object({
  userId: z.string().uuid(),
  postId: z.string().uuid(),
  platform: z.string(),
  date: z.date(),
  views: z.number().optional(),
  cpm: z.number().optional(),
  rpm: z.number().optional(),
  earnings: z.number().optional(),
  adRevenue: z.number().optional(),
  sponsorshipRevenue: z.number().optional(),
  affiliateRevenue: z.number().optional(),
  merchRevenue: z.number().optional(),
});

export const insertFeatureFlagSchema = z.object({
  name: z.string().min(1),
  enabled: z.boolean(),
  rolloutRules: z.record(z.string(), z.unknown()).optional(),
});

export const insertABTestSchema = z.object({
  userId: z.string().uuid(),
  contentId: z.string().uuid(),
  testConfig: z.record(z.string(), z.unknown()),
  status: z.string(),
  winnerVariationId: z.string().uuid().optional(),
  results: z.record(z.string(), z.unknown()).optional(),
  confidence: z.number().optional(),
  totalEngagement: z.number().optional(),
  testDuration: z.number().optional(),
});

export const breakoutAlerts = pgTable("breakout_alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  postId: uuid("post_id").references(() => socialPosts.id).notNull(),
  platform: varchar("platform").notNull(),
  alertType: varchar("alert_type").notNull(),
  message: text("message").notNull(),
  actionUrl: varchar("action_url"),
  createdAt: timestamp("created_at").defaultNow(),
  acknowledged: boolean("acknowledged").default(false).notNull(),
});

export const insertBreakoutAlertSchema = z.object({
  userId: z.string().uuid(),
  postId: z.string().uuid(),
  platform: z.string(),
  alertType: z.string(),
  message: z.string(),
  actionUrl: z.string().url().optional(),
  acknowledged: z.boolean(),
});

// Types
export type UpsertUser = z.infer<typeof insertUserSchema>;
export type User = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: string | null;
  subscriptionTier: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};
export type Upload = typeof uploads.$inferSelect;
export type InsertUpload = typeof uploads.$inferInsert;
export type Transcript = typeof transcripts.$inferSelect;
export type InsertTranscript = z.infer<typeof insertTranscriptSchema>;
export type Segment = typeof segments.$inferSelect;
export type InsertSegment = z.infer<typeof insertSegmentSchema>;
export type Clip = typeof clips.$inferSelect;
export type InsertClip = z.infer<typeof insertClipSchema>;
export type SocialPost = typeof socialPosts.$inferSelect;
export type InsertSocialPost = z.infer<typeof insertSocialPostSchema>;
export type RevenueRecord = typeof revenueRecords.$inferSelect;
export type InsertRevenueRecord = z.infer<typeof insertRevenueRecordSchema>;
export type BreakoutAlert = typeof breakoutAlerts.$inferSelect;
export type InsertBreakoutAlert = z.infer<typeof insertBreakoutAlertSchema>;
export type SocialAccount = typeof socialAccounts.$inferSelect;
export type ScheduledPost = typeof scheduledPosts.$inferSelect;
export type FeatureFlag = typeof featureFlags.$inferSelect;
export type InsertFeatureFlag = z.infer<typeof insertFeatureFlagSchema>;
export type ABTest = typeof abTests.$inferSelect;
export type InsertABTest = z.infer<typeof insertABTestSchema>;

// Billing tables
export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  stripeSubscriptionId: varchar("stripe_subscription_id").unique().notNull(),
  stripePriceId: varchar("stripe_price_id").notNull(),
  status: varchar("status").notNull(), // active, past_due, canceled, unpaid
  currentPeriodStart: timestamp("current_period_start").notNull(),
  currentPeriodEnd: timestamp("current_period_end").notNull(),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  stripeInvoiceId: varchar("stripe_invoice_id").unique().notNull(),
  amount: integer("amount").notNull(), // in cents
  currency: varchar("currency").default("usd").notNull(),
  status: varchar("status").notNull(), // paid, open, void, uncollectible
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const usageRecords = pgTable("usage_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  month: varchar("month").notNull(), // YYYY-MM format
  uploadsCount: integer("uploads_count").default(0),
  transcriptionMinutes: integer("transcription_minutes").default(0),
  segmentsGenerated: integer("segments_generated").default(0),
  postsScheduled: integer("posts_scheduled").default(0),
  storageUsed: integer("storage_used").default(0), // in MB
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Billing types
export type Subscription = typeof subscriptions.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type UsageRecord = typeof usageRecords.$inferSelect;

// CTA tables
export const ctaConfigs = pgTable('cta_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: varchar('user_id').references(() => users.id).notNull(),
  name: varchar('name').notNull(),
  type: varchar('type').notNull(),
  url: text('url').notNull(),
  product: jsonb('product').$type<{ name?: string; price?: number; description?: string }>(),
  template: text('template').notNull(),
  platforms: jsonb('platforms').$type<string[]>().notNull(),
  timing: varchar('timing').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const ctaPerformance = pgTable('cta_performance', {
  id: uuid('id').primaryKey().defaultRandom(),
  ctaId: uuid('cta_id').references(() => ctaConfigs.id, { onDelete: 'cascade' }).notNull(),
  postId: uuid('post_id').references(() => socialPosts.id).notNull(),
  platform: varchar('platform').notNull(),
  clicks: integer('clicks').default(0).notNull(),
  conversions: integer('conversions').default(0).notNull(),
  revenue: numeric('revenue').default('0').notNull(),
  date: timestamp('date').defaultNow(),
});

// Workspace tables
export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name').notNull(),
  description: text('description'),
  ownerId: varchar('owner_id').references(() => users.id).notNull(),
  brandingConfig: jsonb('branding_config').$type<Record<string, any>>(),
  settings: jsonb('settings').$type<Record<string, any>>(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const workspaceMembers = pgTable('workspace_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }).notNull(),
  userId: varchar('user_id').references(() => users.id).notNull(),
  role: varchar('role').notNull(),
  permissions: jsonb('permissions').$type<string[]>().notNull(),
  invitedBy: varchar('invited_by').references(() => users.id),
  joinedAt: timestamp('joined_at').defaultNow(),
  lastActive: timestamp('last_active').defaultNow(),
});

export const workspaceUsage = pgTable('workspace_usage', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }).notNull(),
  period: varchar('period').notNull(),
  date: timestamp('date').notNull(),
  metrics: jsonb('metrics').$type<{
    uploadsCount: number;
    transcriptionMinutes: number;
    segmentsGenerated: number;
    postsScheduled: number;
    apiCalls: number;
    storageUsed: number;
  }>().notNull(),
  costs: jsonb('costs').$type<{
    transcription: number;
    ai: number;
    storage: number;
    platforms: number;
    total: number;
  }>().notNull(),
});

// CTA and workspace types
export type CTAConfig = typeof ctaConfigs.$inferSelect;
export type InsertCTAConfig = typeof ctaConfigs.$inferInsert;
export type CTAPerformance = typeof ctaPerformance.$inferSelect;
export type InsertCTAPerformance = typeof ctaPerformance.$inferInsert;
export type Workspace = typeof workspaces.$inferSelect;
export type InsertWorkspace = typeof workspaces.$inferInsert;
export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type InsertWorkspaceMember = typeof workspaceMembers.$inferInsert;
export type WorkspaceUsage = typeof workspaceUsage.$inferSelect;
export type InsertWorkspaceUsage = typeof workspaceUsage.$inferInsert;
export type VoiceProfile = typeof voiceProfiles.$inferSelect;
export type InsertVoiceProfile = typeof voiceProfiles.$inferInsert;

// UploadSession table for resumable uploads
export interface UploadSession {
  id: string;
  userId: string;
  platform: string;
  fileName: string;
  fileSize: number;
  uploadUrl?: string;
  uploadId?: string;
  chunks: Array<{
    index: number;
    size: number;
    uploaded: boolean;
    etag?: string;
  }>;
  status: 'initialized' | 'uploading' | 'completed' | 'failed';
  createdAt: Date;
  completedAt?: Date;
  updatedAt: Date;
}

// Tax Reporting Tables
export const taxConfigurations = pgTable('tax_configurations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: varchar('user_id').references(() => users.id).notNull(),
  businessType: varchar('business_type').notNull(),
  taxYear: integer('tax_year').notNull(),
  jurisdiction: varchar('jurisdiction').notNull(),
  stateProvince: varchar('state_province'),
  taxId: varchar('tax_id'),
  businessName: varchar('business_name'),
  address: jsonb('address'),
  accountingMethod: varchar('accounting_method').notNull(),
  fiscalYearEnd: varchar('fiscal_year_end').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const taxableTransactions = pgTable('taxable_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: varchar('user_id').references(() => users.id).notNull(),
  type: varchar('type').notNull(), // 'revenue', 'expense', 'deduction'
  category: varchar('category').notNull(),
  amount: numeric('amount').notNull(),
  currency: varchar('currency').default('USD'),
  date: timestamp('date').notNull(),
  description: text('description').notNull(),
  platform: varchar('platform'),
  invoiceNumber: varchar('invoice_number'),
  receiptUrl: varchar('receipt_url'),
  taxDeductible: boolean('tax_deductible').default(false),
  businessPurpose: text('business_purpose'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
});

// White Label Tables
export const whiteLabelConfigs = pgTable('white_label_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: varchar('user_id').references(() => users.id).notNull(),
  clientId: varchar('client_id').notNull().unique(),
  brandName: varchar('brand_name').notNull(),
  domain: varchar('domain').notNull().unique(),
  customDomain: varchar('custom_domain'),
  branding: jsonb('branding').notNull(),
  features: jsonb('features').notNull(),
  billing: jsonb('billing').notNull(),
  limits: jsonb('limits').notNull(),
  settings: jsonb('settings').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const whiteLabelUsers = pgTable('white_label_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: varchar('client_id').notNull(),
  email: varchar('email').notNull(),
  name: varchar('name').notNull(),
  role: varchar('role').notNull(), // 'admin', 'user', 'viewer'
  status: varchar('status').notNull(), // 'active', 'pending', 'suspended'
  limits: jsonb('limits').notNull(),
  lastLogin: timestamp('last_login'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const domainMappings = pgTable('domain_mappings', {
  id: uuid('id').primaryKey().defaultRandom(),
  domain: varchar('domain').notNull().unique(),
  clientId: varchar('client_id').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Apollo/Sponsorship Tables
export const prospects = pgTable('prospects', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: varchar('user_id').references(() => users.id).notNull(),
  name: varchar('name').notNull(),
  email: varchar('email').notNull(),
  title: varchar('title').notNull(),
  company: jsonb('company').notNull(),
  socialProfiles: jsonb('social_profiles'),
  contactInfo: jsonb('contact_info').notNull(),
  sponsorshipHistory: jsonb('sponsorship_history'),
  relevanceScore: numeric('relevance_score').default('0'),
  matchReason: jsonb('match_reason'),
  lastUpdated: timestamp('last_updated').defaultNow(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const sponsorshipIntelligence = pgTable('sponsorship_intelligence', {
  id: uuid('id').primaryKey().defaultRandom(),
  prospectId: uuid('prospect_id').references(() => prospects.id).notNull(),
  insights: jsonb('insights').notNull(),
  recommendations: jsonb('recommendations').notNull(),
  outreachTemplates: jsonb('outreach_templates').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const outreachCampaigns = pgTable('outreach_campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name').notNull(),
  userId: varchar('user_id').references(() => users.id).notNull(),
  prospects: jsonb('prospects').notNull(),
  template: jsonb('template').notNull(),
  schedule: jsonb('schedule').notNull(),
  status: varchar('status').notNull(), // 'draft', 'active', 'paused', 'completed'
  metrics: jsonb('metrics').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const prospectSearches = pgTable('prospect_searches', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: varchar('user_id').references(() => users.id).notNull(),
  criteria: jsonb('criteria').notNull(),
  results: jsonb('results').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Insert schemas for new tables
export const insertTaxConfigurationSchema = z.object({
  userId: z.string().uuid(),
  businessType: z.string(),
  taxYear: z.number(),
  jurisdiction: z.string(),
  stateProvince: z.string().optional(),
  taxId: z.string().optional(),
  businessName: z.string().optional(),
  address: z.record(z.string(), z.unknown()).optional(),
  accountingMethod: z.string(),
  fiscalYearEnd: z.string(),
});

export const insertTaxableTransactionSchema = z.object({
  userId: z.string().uuid(),
  type: z.string(),
  category: z.string(),
  amount: z.number(),
  currency: z.string().optional(),
  date: z.date(),
  description: z.string(),
  platform: z.string().optional(),
  invoiceNumber: z.string().optional(),
  receiptUrl: z.string().optional(),
  taxDeductible: z.boolean().optional(),
  businessPurpose: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const insertWhiteLabelConfigSchema = z.object({
  userId: z.string().uuid(),
  clientId: z.string(),
  brandName: z.string(),
  domain: z.string(),
  customDomain: z.string().optional(),
  branding: z.record(z.string(), z.unknown()),
  features: z.record(z.string(), z.unknown()),
  billing: z.record(z.string(), z.unknown()),
  limits: z.record(z.string(), z.unknown()),
  settings: z.record(z.string(), z.unknown()),
});

export const insertProspectSchema = z.object({
  userId: z.string().uuid(),
  name: z.string(),
  email: z.string(),
  title: z.string(),
  company: z.record(z.string(), z.unknown()),
  socialProfiles: z.record(z.string(), z.unknown()).optional(),
  contactInfo: z.record(z.string(), z.unknown()),
  sponsorshipHistory: z.record(z.string(), z.unknown()).optional(),
  relevanceScore: z.number().optional(),
  matchReason: z.array(z.string()).optional(),
});

// Type exports for new tables
export type TaxConfiguration = typeof taxConfigurations.$inferSelect;
export type InsertTaxConfiguration = z.infer<typeof insertTaxConfigurationSchema>;
export type TaxableTransaction = typeof taxableTransactions.$inferSelect;
export type InsertTaxableTransaction = z.infer<typeof insertTaxableTransactionSchema>;
export type WhiteLabelConfig = typeof whiteLabelConfigs.$inferSelect;
export type InsertWhiteLabelConfig = z.infer<typeof insertWhiteLabelConfigSchema>;
export type WhiteLabelUser = typeof whiteLabelUsers.$inferSelect;
export type Prospect = typeof prospects.$inferSelect;
export type InsertProspect = z.infer<typeof insertProspectSchema>;
export type SponsorshipIntelligence = typeof sponsorshipIntelligence.$inferSelect;
export type OutreachCampaign = typeof outreachCampaigns.$inferSelect;
export type ProspectSearch = typeof prospectSearches.$inferSelect;

// Advanced Infrastructure Tables

// Compliance and Data Protection
export const dataExportRequests = pgTable('data_export_requests', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id).notNull(),
  requestType: text('request_type').notNull(), // 'gdpr', 'ccpa', 'full_export'
  status: text('status').default('pending').notNull(),
  requestedData: text('requested_data').array(),
  exportUrl: text('export_url'),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
});

export const dataErasureRequests = pgTable('data_erasure_requests', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id).notNull(),
  requestType: text('request_type').notNull(),
  status: text('status').default('pending').notNull(),
  verificationToken: text('verification_token').notNull(),
  verificationExpiresAt: timestamp('verification_expires_at').notNull(),
  dataTypes: text('data_types').array(),
  retentionPeriod: integer('retention_period'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  processedAt: timestamp('processed_at'),
  completedAt: timestamp('completed_at'),
});

export const consentRecords = pgTable('consent_records', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id).notNull(),
  consentType: text('consent_type').notNull(),
  granted: boolean('granted').notNull(),
  version: text('version').notNull(),
  ipAddress: text('ip_address').notNull(),
  userAgent: text('user_agent').notNull(),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
  expiresAt: timestamp('expires_at'),
  withdrawnAt: timestamp('withdrawn_at'),
});

export const auditLogs = pgTable('audit_logs', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id),
  action: text('action').notNull(),
  resource: text('resource').notNull(),
  resourceId: text('resource_id'),
  details: jsonb('details'),
  ipAddress: text('ip_address').notNull(),
  userAgent: text('user_agent').notNull(),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
  severity: text('severity').notNull(), // 'low', 'medium', 'high', 'critical'
  category: text('category').notNull(), // 'data_access', 'data_modification', etc.
});

// Copyright Protection
export const contentFingerprints = pgTable('content_fingerprints', {
  id: text('id').primaryKey(),
  uploadId: text('upload_id').references(() => uploads.id).notNull(),
  userId: text('user_id').references(() => users.id).notNull(),
  contentType: text('content_type').notNull(),
  perceptualHash: text('perceptual_hash').notNull(),
  audioFingerprint: text('audio_fingerprint'),
  videoFingerprint: text('video_fingerprint'),
  textHash: text('text_hash'),
  fileSize: integer('file_size').notNull(),
  mimeType: text('mime_type').notNull(),
  duration: integer('duration'),
  resolution: text('resolution'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const copyrightClaims = pgTable('copyright_claims', {
  id: text('id').primaryKey(),
  claimantId: text('claimant_id').notNull(),
  contentId: text('content_id').notNull(),
  claimType: text('claim_type').notNull(),
  status: text('status').default('pending').notNull(),
  evidence: jsonb('evidence').notNull(),
  targetContent: jsonb('target_content').notNull(),
  resolution: jsonb('resolution'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  resolvedAt: timestamp('resolved_at'),
});

export const blockedHashes = pgTable('blocked_hashes', {
  hash: text('hash').primaryKey(),
  reason: text('reason').notNull(),
  addedAt: timestamp('added_at').defaultNow().notNull(),
});

// Encryption Keys
export const encryptionKeys = pgTable('encryption_keys', {
  id: text('id').primaryKey(),
  keyData: text('key_data').notNull(),
  algorithm: text('algorithm').notNull(),
  keySize: integer('key_size').notNull(),
  purpose: text('purpose').notNull(),
  status: text('status').default('active').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at'),
});

// Multi-Region Infrastructure
export const regions = pgTable('regions', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  code: text('code').unique().notNull(),
  location: jsonb('location').notNull(),
  endpoints: jsonb('endpoints').notNull(),
  capacity: jsonb('capacity').notNull(),
  status: text('status').default('active').notNull(),
  healthCheck: jsonb('health_check').notNull(),
  dataResidency: jsonb('data_residency').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const userSessions = pgTable('user_sessions', {
  sessionId: text('session_id').primaryKey(),
  userId: text('user_id').references(() => users.id).notNull(),
  assignedRegion: text('assigned_region').references(() => regions.code).notNull(),
  originalRegion: text('original_region').notNull(),
  routingDecision: jsonb('routing_decision').notNull(),
  performance: jsonb('performance').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Backup and Recovery
export const backupConfigs = pgTable('backup_configs', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  schedule: jsonb('schedule').notNull(),
  retention: jsonb('retention').notNull(),
  targets: jsonb('targets').notNull(),
  destinations: jsonb('destinations').notNull(),
  notifications: jsonb('notifications').notNull(),
  enabled: boolean('enabled').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const backupJobs = pgTable('backup_jobs', {
  id: text('id').primaryKey(),
  configId: text('config_id').references(() => backupConfigs.id).notNull(),
  type: text('type').notNull(),
  status: text('status').default('pending').notNull(),
  startTime: timestamp('start_time').defaultNow().notNull(),
  endTime: timestamp('end_time'),
  duration: integer('duration'),
  size: bigint('size', { mode: 'number' }).default(0).notNull(),
  filesCount: integer('files_count').default(0).notNull(),
  checksum: text('checksum').default('').notNull(),
  metadata: jsonb('metadata').notNull(),
  destinations: jsonb('destinations').notNull(),
  error: jsonb('error'),
  logs: text('logs').array(),
});

export const recoveryPoints = pgTable('recovery_points', {
  id: text('id').primaryKey(),
  backupJobId: text('backup_job_id').references(() => backupJobs.id).notNull(),
  timestamp: timestamp('timestamp').notNull(),
  type: text('type').notNull(),
  size: bigint('size', { mode: 'number' }).notNull(),
  checksum: text('checksum').notNull(),
  dependencies: text('dependencies').array(),
  metadata: jsonb('metadata').notNull(),
  verified: boolean('verified').default(false).notNull(),
  verificationDate: timestamp('verification_date'),
});

export const restoreJobs = pgTable('restore_jobs', {
  id: text('id').primaryKey(),
  recoveryPointId: text('recovery_point_id').references(() => recoveryPoints.id).notNull(),
  type: text('type').notNull(),
  status: text('status').default('pending').notNull(),
  targetEnvironment: text('target_environment').notNull(),
  restoreTargets: jsonb('restore_targets').notNull(),
  options: jsonb('options').notNull(),
  progress: jsonb('progress').notNull(),
  startTime: timestamp('start_time').defaultNow().notNull(),
  endTime: timestamp('end_time'),
  error: jsonb('error'),
  logs: text('logs').array(),
});

// SQL for migration:
// CREATE TABLE upload_sessions (
//   id TEXT PRIMARY KEY,
//   user_id TEXT NOT NULL,
//   platform TEXT NOT NULL,
//   file_name TEXT NOT NULL,
//   file_size BIGINT NOT NULL,
//   upload_url TEXT,
//   upload_id TEXT,
//   chunks JSONB NOT NULL,
//   status TEXT NOT NULL,
//   created_at TIMESTAMP NOT NULL DEFAULT NOW(),
//   completed_at TIMESTAMP,
//   updated_at TIMESTAMP NOT NULL DEFAULT NOW()
// );
