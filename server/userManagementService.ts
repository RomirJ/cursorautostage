import { storage } from "./storage";
import { randomUUID } from "crypto";
import {
  User,
  Workspace,
  InsertWorkspace,
  WorkspaceMember,
  InsertWorkspaceMember,
  WorkspaceUsage,
  InsertWorkspaceUsage,
} from "@shared/schema";


interface UserProfile {
  userId: string;
  displayName: string;
  bio?: string;
  avatar?: string;
  preferences: {
    timezone: string;
    language: string;
    notifications: {
      email: boolean;
      push: boolean;
      digest: boolean;
    };
  };
  onboardingCompleted: boolean;
  lastLogin: Date;
}


interface BillingPlan {
  id: string;
  name: string;
  tier: 'starter' | 'professional' | 'studio' | 'enterprise';
  limits: {
    workspaces: number;
    uploads: number;
    transcriptionMinutes: number;
    aiGenerations: number;
    storage: number; // in GB
    teamMembers: number;
  };
  pricing: {
    monthly: number;
    yearly: number;
  };
  features: string[];
}

const ROLE_PERMISSIONS: Record<WorkspaceMember['role'], string[]> = {
  owner: [
    'workspace.manage',
    'workspace.delete',
    'members.invite',
    'members.remove',
    'content.create',
    'content.edit',
    'content.delete',
    'content.publish',
    'analytics.view',
    'analytics.export',
    'billing.manage',
    'settings.manage'
  ],
  editor: [
    'content.create',
    'content.edit',
    'content.delete',
    'content.publish',
    'analytics.view',
    'members.view'
  ],
  analyst: [
    'content.view',
    'analytics.view',
    'analytics.export',
    'members.view'
  ],
  'sponsor-viewer': [
    'content.view',
    'analytics.view'
  ]
};

const BILLING_PLANS: BillingPlan[] = [
  {
    id: 'starter',
    name: 'Starter',
    tier: 'starter',
    limits: {
      workspaces: 1,
      uploads: 10,
      transcriptionMinutes: 120,
      aiGenerations: 50,
      storage: 5,
      teamMembers: 2
    },
    pricing: {
      monthly: 29,
      yearly: 290
    },
    features: [
      'Basic transcription',
      'Social media posting',
      'Analytics dashboard',
      'Email support'
    ]
  },
  {
    id: 'professional',
    name: 'Professional',
    tier: 'professional',
    limits: {
      workspaces: 3,
      uploads: 100,
      transcriptionMinutes: 1000,
      aiGenerations: 500,
      storage: 50,
      teamMembers: 5
    },
    pricing: {
      monthly: 79,
      yearly: 790
    },
    features: [
      'Advanced AI features',
      'Quote graphics generation',
      'Multi-platform scheduling',
      'Team collaboration',
      'Priority support'
    ]
  },
  {
    id: 'studio',
    name: 'Studio',
    tier: 'studio',
    limits: {
      workspaces: 10,
      uploads: 500,
      transcriptionMinutes: 5000,
      aiGenerations: 2500,
      storage: 200,
      teamMembers: 15
    },
    pricing: {
      monthly: 199,
      yearly: 1990
    },
    features: [
      'White-label branding',
      'API access',
      'Custom integrations',
      'Advanced analytics',
      'Dedicated support'
    ]
  }
];

export class UserManagementService {
  private profiles: Map<string, UserProfile> = new Map();

  async createWorkspace(ownerId: string, data: {
    name: string;
    description?: string;
    brandingConfig?: Partial<Workspace['brandingConfig']>;
    settings?: Partial<Workspace['settings']>;
  }): Promise<Workspace> {
    const workspace = await storage.createWorkspace({
      name: data.name,
      description: data.description,
      ownerId,
      brandingConfig: {
        primaryColor: '#3B82F6',
        secondaryColor: '#1F2937',
        fontFamily: 'Inter, sans-serif',
        ...data.brandingConfig,
      },
      settings: {
        timezone: 'UTC',
        currency: 'USD',
        defaultPlatforms: ['twitter', 'linkedin'],
        ...data.settings,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as InsertWorkspace);

    await this.addWorkspaceMember(workspace.id, ownerId, 'owner', ownerId);

    console.log(`[UserManagement] Created workspace: ${workspace.id} for user ${ownerId}`);
    return workspace;
  }

  async getWorkspacesByUser(userId: string): Promise<Workspace[]> {
    return await storage.getWorkspacesByUser(userId);
  }

  async getWorkspace(workspaceId: string): Promise<Workspace | undefined> {
    return await storage.getWorkspace(workspaceId);
  }

  async updateWorkspace(workspaceId: string, updates: Partial<Workspace>): Promise<void> {
    await storage.updateWorkspace(workspaceId, updates);
    console.log(`[UserManagement] Updated workspace: ${workspaceId}`);
  }

  async deleteWorkspace(workspaceId: string, userId: string): Promise<void> {
    const workspace = await storage.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    if (workspace.ownerId !== userId) {
      throw new Error('Only workspace owner can delete workspace');
    }
    await storage.deleteWorkspace(workspaceId);
    console.log(`[UserManagement] Deleted workspace: ${workspaceId}`);
  }

  async addWorkspaceMember(
    workspaceId: string, 
    userId: string, 
    role: WorkspaceMember['role'],
    invitedBy: string
  ): Promise<WorkspaceMember> {
    const member = await storage.addWorkspaceMember({
      workspaceId,
      userId,
      role,
      permissions: ROLE_PERMISSIONS[role],
      invitedBy,
      joinedAt: new Date(),
      lastActive: new Date(),
    } as InsertWorkspaceMember);

    console.log(`[UserManagement] Added member ${userId} to workspace ${workspaceId} as ${role}`);
    return member;
  }

  async getWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    return await storage.getWorkspaceMembers(workspaceId);
  }

  async updateMemberRole(
    workspaceId: string, 
    userId: string, 
    newRole: WorkspaceMember['role']
  ): Promise<void> {
    const members = await storage.getWorkspaceMembers(workspaceId);
    const member = members.find(m => m.userId === userId);
    if (!member) throw new Error('Member not found');
    await storage.updateWorkspaceMember(member.id, { role: newRole, permissions: ROLE_PERMISSIONS[newRole] });
    console.log(`[UserManagement] Updated member ${userId} role to ${newRole}`);
  }

  async removeMember(workspaceId: string, userId: string): Promise<void> {
    const members = await storage.getWorkspaceMembers(workspaceId);
    const member = members.find(m => m.userId === userId);
    if (member) {
      await storage.removeWorkspaceMember(member.id);
      console.log(`[UserManagement] Removed member ${userId} from workspace ${workspaceId}`);
    }
  }

  async checkPermission(userId: string, workspaceId: string, permission: string): Promise<boolean> {
    const members = await storage.getWorkspaceMembers(workspaceId);
    const member = members.find(m => m.userId === userId);
    if (!member) return false;
    return member.permissions.includes(permission);
  }

  async createUserProfile(userId: string, data: Partial<UserProfile>): Promise<UserProfile> {
    const profile: UserProfile = {
      userId,
      displayName: data.displayName || 'User',
      bio: data.bio,
      avatar: data.avatar,
      preferences: {
        timezone: 'UTC',
        language: 'en',
        notifications: {
          email: true,
          push: true,
          digest: true
        },
        ...data.preferences
      },
      onboardingCompleted: false,
      lastLogin: new Date()
    };

    this.profiles.set(userId, profile);
    console.log(`[UserManagement] Created profile for user: ${userId}`);
    return profile;
  }

  async getUserProfile(userId: string): Promise<UserProfile | undefined> {
    return this.profiles.get(userId);
  }

  async updateUserProfile(userId: string, updates: Partial<UserProfile>): Promise<void> {
    const profile = this.profiles.get(userId);
    if (!profile) {
      throw new Error('User profile not found');
    }

    const updatedProfile = { ...profile, ...updates };
    this.profiles.set(userId, updatedProfile);
    console.log(`[UserManagement] Updated profile for user: ${userId}`);
  }

  async completeOnboarding(userId: string): Promise<void> {
    const profile = this.profiles.get(userId);
    if (profile) {
      profile.onboardingCompleted = true;
      this.profiles.set(userId, profile);
    }
  }

  async recordUsage(workspaceId: string, metrics: Partial<WorkspaceUsage['metrics']>): Promise<void> {
    const cost = {
      transcription: (metrics.transcriptionMinutes || 0) * 0.006,
      ai: (metrics.segmentsGenerated || 0) * 0.02,
      storage: (metrics.storageUsed || 0) * 0.001,
      platforms: (metrics.postsScheduled || 0) * 0.01,
    };
    const total = cost.transcription + cost.ai + cost.storage + cost.platforms;
    await storage.recordWorkspaceUsage({
      id: randomUUID(),
      workspaceId,
      period: 'daily',
      date: new Date(),
      metrics: {
        uploadsCount: metrics.uploadsCount || 0,
        transcriptionMinutes: metrics.transcriptionMinutes || 0,
        segmentsGenerated: metrics.segmentsGenerated || 0,
        postsScheduled: metrics.postsScheduled || 0,
        apiCalls: metrics.apiCalls || 0,
        storageUsed: metrics.storageUsed || 0,
      },
      costs: { ...cost, total },
    });
  }

  async getUsageReport(workspaceId: string, days: number = 30): Promise<{
    currentPeriod: Omit<WorkspaceUsage, 'id'>;
    history: WorkspaceUsage[];
    limits: BillingPlan['limits'];
    overages: Record<string, number>;
  }> {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const history = await storage.getWorkspaceUsage(workspaceId, cutoffDate);

    // Calculate current period totals
    const currentPeriod: Omit<WorkspaceUsage, 'id'> = {
      workspaceId,
      period: 'monthly',
      date: new Date(),
      metrics: history.reduce((total, u) => {
        const m = u.metrics as any;
        return {
          uploadsCount: total.uploadsCount + (m.uploadsCount || 0),
          transcriptionMinutes: total.transcriptionMinutes + (m.transcriptionMinutes || 0),
          segmentsGenerated: total.segmentsGenerated + (m.segmentsGenerated || 0),
          postsScheduled: total.postsScheduled + (m.postsScheduled || 0),
          apiCalls: total.apiCalls + (m.apiCalls || 0),
          storageUsed: total.storageUsed + (m.storageUsed || 0),
        };
      }, {
        uploadsCount: 0,
        transcriptionMinutes: 0,
        segmentsGenerated: 0,
        postsScheduled: 0,
        apiCalls: 0,
        storageUsed: 0,
      }),
      costs: history.reduce((total, u) => {
        const c = u.costs as any;
        return {
          transcription: total.transcription + (c.transcription || 0),
          ai: total.ai + (c.ai || 0),
          storage: total.storage + (c.storage || 0),
          platforms: total.platforms + (c.platforms || 0),
          total: total.total + (c.total || 0),
        };
      }, { transcription: 0, ai: 0, storage: 0, platforms: 0, total: 0 }),
    };

    // Get plan limits (defaulting to professional plan)
    const planLimits = BILLING_PLANS.find(p => p.id === 'professional')!.limits;

    // Calculate overages
    const overages: Record<string, number> = {};
    if (currentPeriod.metrics.uploadsCount > planLimits.uploads) {
      overages.uploads = currentPeriod.metrics.uploadsCount - planLimits.uploads;
    }
    if (currentPeriod.metrics.transcriptionMinutes > planLimits.transcriptionMinutes) {
      overages.transcriptionMinutes = currentPeriod.metrics.transcriptionMinutes - planLimits.transcriptionMinutes;
    }
    if (currentPeriod.metrics.storageUsed > planLimits.storage * 1024) {
      overages.storage = currentPeriod.metrics.storageUsed - (planLimits.storage * 1024);
    }

    return {
      currentPeriod,
      history,
      limits: planLimits,
      overages
    };
  }

  async getBillingPlans(): Promise<BillingPlan[]> {
    return BILLING_PLANS;
  }

  async getOnboardingChecklist(userId: string): Promise<{
    steps: Array<{
      id: string;
      title: string;
      description: string;
      completed: boolean;
      required: boolean;
    }>;
    completionRate: number;
  }> {
    const profile = this.profiles.get(userId);
    const workspaces = await this.getWorkspacesByUser(userId);
    
    const steps = [
      {
        id: 'profile',
        title: 'Complete your profile',
        description: 'Add your name and preferences',
        completed: !!profile?.displayName,
        required: true
      },
      {
        id: 'workspace',
        title: 'Create your first workspace',
        description: 'Set up a workspace for your content',
        completed: workspaces.length > 0,
        required: true
      },
      {
        id: 'upload',
        title: 'Upload your first content',
        description: 'Upload a video or audio file to get started',
        completed: false, // Would check actual uploads
        required: true
      },
      {
        id: 'social',
        title: 'Connect social accounts',
        description: 'Link your social media accounts for posting',
        completed: false, // Would check connected accounts
        required: false
      },
      {
        id: 'schedule',
        title: 'Schedule your first post',
        description: 'Create and schedule content for publishing',
        completed: false, // Would check scheduled posts
        required: false
      }
    ];

    const completed = steps.filter(s => s.completed).length;
    const completionRate = Math.round((completed / steps.length) * 100);

    return { steps, completionRate };
  }
}

export const userManagementService = new UserManagementService();
