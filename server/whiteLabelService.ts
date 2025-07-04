import { storage } from './storage';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';

interface WhiteLabelConfig {
  userId: string;
  clientId: string;
  brandName: string;
  domain: string;
  customDomain?: string;
  branding: {
    logo: string;
    favicon: string;
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    fontFamily: string;
    customCSS?: string;
  };
  features: {
    hideContentStageEngine: boolean;
    customFooter?: string;
    customHeader?: string;
    customAnalytics?: string;
    customSupport?: {
      email: string;
      phone?: string;
      website?: string;
    };
  };
  billing: {
    model: 'markup' | 'flat_fee' | 'revenue_share';
    markup?: number; // percentage
    flatFee?: number; // monthly fee
    revenueShare?: number; // percentage
  };
  limits: {
    maxUsers: number;
    maxStorage: number; // GB
    maxProcessingMinutes: number;
    allowedFeatures: string[];
  };
  settings: {
    allowSignup: boolean;
    requireApproval: boolean;
    customOnboarding?: string;
    customTerms?: string;
    customPrivacy?: string;
  };
}

interface ClientUser {
  id: string;
  clientId: string;
  email: string;
  name: string;
  role: 'admin' | 'user' | 'viewer';
  status: 'active' | 'pending' | 'suspended';
  limits: {
    storage: number;
    processingMinutes: number;
    features: string[];
  };
  createdAt: Date;
  lastLogin?: Date;
}

interface WhiteLabelAnalytics {
  clientId: string;
  period: {
    start: Date;
    end: Date;
  };
  users: {
    total: number;
    active: number;
    new: number;
    churned: number;
  };
  usage: {
    storage: number;
    processingMinutes: number;
    uploads: number;
    downloads: number;
  };
  revenue: {
    total: number;
    recurring: number;
    oneTime: number;
    commission: number;
  };
  engagement: {
    avgSessionDuration: number;
    avgUploadsPerUser: number;
    avgProcessingTime: number;
    featureUsage: Record<string, number>;
  };
}

export class WhiteLabelService {
  private readonly ALLOWED_FEATURES = [
    'upload',
    'transcription',
    'clip_generation',
    'social_posting',
    'analytics',
    'scheduling',
    'ab_testing',
    'monetization',
    'team_collaboration',
    'api_access',
    'custom_branding',
    'priority_support'
  ];

  private readonly TEMPLATE_COLORS = {
    'professional': {
      primary: '#2563eb',
      secondary: '#64748b',
      accent: '#0ea5e9'
    },
    'creative': {
      primary: '#7c3aed',
      secondary: '#a855f7',
      accent: '#ec4899'
    },
    'minimal': {
      primary: '#1f2937',
      secondary: '#6b7280',
      accent: '#10b981'
    },
    'vibrant': {
      primary: '#f59e0b',
      secondary: '#ef4444',
      accent: '#8b5cf6'
    }
  };

  async createWhiteLabelClient(config: WhiteLabelConfig): Promise<string> {
    // Validate domain availability
    await this.validateDomain(config.domain);
    
    // Process branding assets
    config.branding = await this.processBrandingAssets(config.branding);
    
    // Generate custom CSS
    const customCSS = this.generateCustomCSS(config.branding);
    config.branding.customCSS = customCSS;
    
    // Save configuration
    await storage.saveWhiteLabelConfig(config);
    
    // Set up domain routing
    await this.setupDomainRouting(config);
    
    // Create initial admin user
    const adminUser = await this.createClientUser({
      clientId: config.clientId,
      email: config.features.customSupport?.email || 'admin@' + config.domain,
      name: 'Admin',
      role: 'admin',
      status: 'active',
      limits: {
        storage: config.limits.maxStorage,
        processingMinutes: config.limits.maxProcessingMinutes,
        features: config.limits.allowedFeatures
      }
    });

    console.log(`[WhiteLabel] Created client ${config.clientId} with domain ${config.domain}`);
    return config.clientId;
  }

  async updateWhiteLabelConfig(clientId: string, updates: Partial<WhiteLabelConfig>): Promise<void> {
    const existing = await storage.getWhiteLabelConfig(clientId);
    if (!existing) {
      throw new Error(`White label client ${clientId} not found`);
    }

    const updated = { ...existing, ...updates };
    
    // Reprocess branding assets if changed
    if (updates.branding) {
      updated.branding = await this.processBrandingAssets(updated.branding);
      updated.branding.customCSS = this.generateCustomCSS(updated.branding);
    }
    
    await storage.saveWhiteLabelConfig(updated);
    
    // Update domain routing if domain changed
    if (updates.domain || updates.customDomain) {
      await this.setupDomainRouting(updated);
    }

    console.log(`[WhiteLabel] Updated client ${clientId} configuration`);
  }

  async getWhiteLabelConfig(clientId: string): Promise<WhiteLabelConfig | null> {
    return await storage.getWhiteLabelConfig(clientId);
  }

  async getWhiteLabelConfigByDomain(domain: string): Promise<WhiteLabelConfig | null> {
    return await storage.getWhiteLabelConfigByDomain(domain);
  }

  async createClientUser(userData: Omit<ClientUser, 'id' | 'createdAt'>): Promise<ClientUser> {
    const user: ClientUser = {
      id: uuidv4(),
      ...userData,
      createdAt: new Date()
    };

    // Validate client exists
    const client = await storage.getWhiteLabelConfig(userData.clientId);
    if (!client) {
      throw new Error(`Client ${userData.clientId} not found`);
    }

    // Check user limits
    const existingUsers = await storage.getClientUsers(userData.clientId);
    if (existingUsers.length >= client.limits.maxUsers) {
      throw new Error(`User limit reached for client ${userData.clientId}`);
    }

    // Validate feature access
    const invalidFeatures = userData.limits.features.filter(
      feature => !client.limits.allowedFeatures.includes(feature)
    );
    if (invalidFeatures.length > 0) {
      throw new Error(`Invalid features for client: ${invalidFeatures.join(', ')}`);
    }

    await storage.saveClientUser(user);
    console.log(`[WhiteLabel] Created user ${user.id} for client ${userData.clientId}`);
    return user;
  }

  async updateClientUser(userId: string, updates: Partial<ClientUser>): Promise<void> {
    const existing = await storage.getClientUser(userId);
    if (!existing) {
      throw new Error(`User ${userId} not found`);
    }

    const updated = { ...existing, ...updates };
    await storage.saveClientUser(updated);
    console.log(`[WhiteLabel] Updated user ${userId}`);
  }

  async getClientUsers(clientId: string): Promise<ClientUser[]> {
    return await storage.getClientUsers(clientId);
  }

  async generateWhiteLabelAnalytics(clientId: string, period: string = 'month'): Promise<WhiteLabelAnalytics> {
    const { startDate, endDate } = this.getPeriodDates(period);
    
    // Get client users and their activity
    const users = await storage.getClientUsers(clientId);
    const userIds = users.map(u => u.id);
    
    // Calculate user metrics
    const totalUsers = users.length;
    const activeUsers = users.filter(u => 
      u.lastLogin && u.lastLogin >= startDate
    ).length;
    const newUsers = users.filter(u => 
      u.createdAt >= startDate && u.createdAt <= endDate
    ).length;
    const churnedUsers = users.filter(u => 
      u.status === 'suspended' || 
      (u.lastLogin && u.lastLogin < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
    ).length;

    // Get usage metrics
    const uploads = await storage.getClientUploads(clientId, startDate, endDate);
    const totalStorage = uploads.reduce((sum, upload) => sum + (upload.fileSize || 0), 0);
    const processingMinutes = uploads.reduce((sum, upload) => sum + (upload.processingTime || 0), 0);
    const downloads = await storage.getClientDownloads(clientId, startDate, endDate);

    // Calculate revenue metrics
    const client = await storage.getWhiteLabelConfig(clientId);
    const revenue = await this.calculateClientRevenue(clientId, startDate, endDate, client!);

    // Calculate engagement metrics
    const sessions = await storage.getClientSessions(clientId, startDate, endDate);
    const avgSessionDuration = sessions.length > 0 
      ? sessions.reduce((sum, s) => sum + s.duration, 0) / sessions.length
      : 0;
    
    const avgUploadsPerUser = activeUsers > 0 ? uploads.length / activeUsers : 0;
    const avgProcessingTime = uploads.length > 0 ? processingMinutes / uploads.length : 0;
    
    const featureUsage = await this.calculateFeatureUsage(clientId, startDate, endDate);

    return {
      clientId,
      period: { start: startDate, end: endDate },
      users: {
        total: totalUsers,
        active: activeUsers,
        new: newUsers,
        churned: churnedUsers
      },
      usage: {
        storage: totalStorage,
        processingMinutes,
        uploads: uploads.length,
        downloads: downloads.length
      },
      revenue,
      engagement: {
        avgSessionDuration,
        avgUploadsPerUser,
        avgProcessingTime,
        featureUsage
      }
    };
  }

  async generateClientInvoice(clientId: string, period: string): Promise<string> {
    const analytics = await this.generateWhiteLabelAnalytics(clientId, period);
    const client = await storage.getWhiteLabelConfig(clientId);
    
    if (!client) {
      throw new Error(`Client ${clientId} not found`);
    }

    const invoice = {
      clientId,
      clientName: client.brandName,
      period: analytics.period,
      billing: client.billing,
      usage: analytics.usage,
      revenue: analytics.revenue,
      generatedAt: new Date()
    };

    const invoiceId = await storage.saveClientInvoice(invoice);
    console.log(`[WhiteLabel] Generated invoice ${invoiceId} for client ${clientId}`);
    return invoiceId;
  }

  async getCustomTheme(clientId: string): Promise<any> {
    const config = await storage.getWhiteLabelConfig(clientId);
    if (!config) {
      throw new Error(`Client ${clientId} not found`);
    }

    return {
      branding: config.branding,
      features: config.features,
      customCSS: config.branding.customCSS
    };
  }

  async uploadBrandingAsset(
    clientId: string, 
    type: 'logo' | 'favicon', 
    file: Buffer, 
    filename: string
  ): Promise<string> {
    const config = await storage.getWhiteLabelConfig(clientId);
    if (!config) {
      throw new Error(`Client ${clientId} not found`);
    }

    const ext = path.extname(filename);
    const assetId = uuidv4();
    const assetPath = path.join('white-label', clientId, `${type}-${assetId}${ext}`);
    
    // Process image based on type
    let processedBuffer: Buffer;
    
    if (type === 'logo') {
      // Resize logo to standard dimensions
      processedBuffer = await sharp(file)
        .resize(200, 60, { fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer();
    } else if (type === 'favicon') {
      // Create favicon in multiple sizes
      processedBuffer = await sharp(file)
        .resize(32, 32)
        .png()
        .toBuffer();
    } else {
      processedBuffer = file;
    }

    // Save to storage
    const url = await storage.saveFile(assetPath, processedBuffer);
    
    // Update config
    config.branding[type] = url;
    await storage.saveWhiteLabelConfig(config);

    console.log(`[WhiteLabel] Uploaded ${type} for client ${clientId}`);
    return url;
  }

  private async validateDomain(domain: string): Promise<void> {
    // Check if domain is already in use
    const existing = await storage.getWhiteLabelConfigByDomain(domain);
    if (existing) {
      throw new Error(`Domain ${domain} is already in use`);
    }

    // Validate domain format
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
    if (!domainRegex.test(domain)) {
      throw new Error(`Invalid domain format: ${domain}`);
    }
  }

  private async processBrandingAssets(branding: WhiteLabelConfig['branding']): Promise<WhiteLabelConfig['branding']> {
    // Process logo if it's a base64 string
    if (branding.logo && branding.logo.startsWith('data:')) {
      const buffer = Buffer.from(branding.logo.split(',')[1], 'base64');
      const processedBuffer = await sharp(buffer)
        .resize(200, 60, { fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer();
      
      const logoPath = `white-label/logos/${uuidv4()}.png`;
      branding.logo = await storage.saveFile(logoPath, processedBuffer);
    }

    // Process favicon if it's a base64 string
    if (branding.favicon && branding.favicon.startsWith('data:')) {
      const buffer = Buffer.from(branding.favicon.split(',')[1], 'base64');
      const processedBuffer = await sharp(buffer)
        .resize(32, 32)
        .png()
        .toBuffer();
      
      const faviconPath = `white-label/favicons/${uuidv4()}.png`;
      branding.favicon = await storage.saveFile(faviconPath, processedBuffer);
    }

    return branding;
  }

  private generateCustomCSS(branding: WhiteLabelConfig['branding']): string {
    return `
      :root {
        --primary-color: ${branding.primaryColor};
        --secondary-color: ${branding.secondaryColor};
        --accent-color: ${branding.accentColor};
        --font-family: ${branding.fontFamily};
      }

      .brand-logo {
        background-image: url('${branding.logo}');
        background-size: contain;
        background-repeat: no-repeat;
        background-position: center;
      }

      .btn-primary {
        background-color: var(--primary-color);
        border-color: var(--primary-color);
      }

      .btn-primary:hover {
        background-color: color-mix(in srgb, var(--primary-color) 85%, black);
        border-color: color-mix(in srgb, var(--primary-color) 85%, black);
      }

      .text-primary {
        color: var(--primary-color) !important;
      }

      .bg-primary {
        background-color: var(--primary-color) !important;
      }

      .border-primary {
        border-color: var(--primary-color) !important;
      }

      .navbar-brand {
        font-family: var(--font-family);
      }

      .sidebar {
        background-color: var(--secondary-color);
      }

      .accent {
        color: var(--accent-color);
      }

      .bg-accent {
        background-color: var(--accent-color);
      }

      body {
        font-family: var(--font-family);
      }

      ${branding.customCSS || ''}
    `;
  }

  private async setupDomainRouting(config: WhiteLabelConfig): Promise<void> {
    // In a real implementation, this would configure:
    // - DNS records
    // - SSL certificates
    // - Load balancer rules
    // - CDN configuration
    
    console.log(`[WhiteLabel] Setting up domain routing for ${config.domain}`);
    
    // For now, just save the domain mapping
    await storage.saveDomainMapping(config.domain, config.clientId);
    
    if (config.customDomain) {
      await storage.saveDomainMapping(config.customDomain, config.clientId);
    }
  }

  private getPeriodDates(period: string): { startDate: Date; endDate: Date } {
    const now = new Date();
    
    switch (period) {
      case 'week':
        return {
          startDate: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
          endDate: now
        };
      case 'month':
        return {
          startDate: new Date(now.getFullYear(), now.getMonth(), 1),
          endDate: now
        };
      case 'quarter':
        const quarter = Math.floor(now.getMonth() / 3);
        return {
          startDate: new Date(now.getFullYear(), quarter * 3, 1),
          endDate: now
        };
      case 'year':
        return {
          startDate: new Date(now.getFullYear(), 0, 1),
          endDate: now
        };
      default:
        return {
          startDate: new Date(now.getFullYear(), now.getMonth(), 1),
          endDate: now
        };
    }
  }

  private async calculateClientRevenue(
    clientId: string, 
    startDate: Date, 
    endDate: Date, 
    config: WhiteLabelConfig
  ): Promise<WhiteLabelAnalytics['revenue']> {
    const users = await storage.getClientUsers(clientId);
    const activeUsers = users.filter(u => u.status === 'active').length;
    
    // Calculate base revenue based on billing model
    let baseRevenue = 0;
    let commission = 0;
    
    switch (config.billing.model) {
      case 'flat_fee':
        baseRevenue = (config.billing.flatFee || 0) * activeUsers;
        commission = baseRevenue;
        break;
        
      case 'markup':
        // Get actual usage costs and apply markup
        const usageCost = await this.calculateUsageCost(clientId, startDate, endDate);
        baseRevenue = usageCost * (1 + (config.billing.markup || 0) / 100);
        commission = baseRevenue - usageCost;
        break;
        
      case 'revenue_share':
        // Get client's actual revenue and take percentage
        const clientRevenue = await this.getClientActualRevenue(clientId, startDate, endDate);
        commission = clientRevenue * (config.billing.revenueShare || 0) / 100;
        baseRevenue = clientRevenue;
        break;
    }

    return {
      total: baseRevenue,
      recurring: baseRevenue * 0.8, // Assume 80% is recurring
      oneTime: baseRevenue * 0.2,
      commission
    };
  }

  private async calculateUsageCost(clientId: string, startDate: Date, endDate: Date): Promise<number> {
    const uploads = await storage.getClientUploads(clientId, startDate, endDate);
    const processingMinutes = uploads.reduce((sum, upload) => sum + (upload.processingTime || 0), 0);
    const storage = uploads.reduce((sum, upload) => sum + (upload.fileSize || 0), 0);
    
    // Example pricing: $0.10 per processing minute + $0.01 per GB storage
    return (processingMinutes * 0.10) + (storage / (1024 * 1024 * 1024) * 0.01);
  }

  private async getClientActualRevenue(clientId: string, startDate: Date, endDate: Date): Promise<number> {
    // This would integrate with the client's actual revenue tracking
    // For now, return a placeholder
    return 0;
  }

  private async calculateFeatureUsage(clientId: string, startDate: Date, endDate: Date): Promise<Record<string, number>> {
    const usage: Record<string, number> = {};
    
    // Get feature usage from analytics
    const analytics = await storage.getClientAnalytics(clientId, startDate, endDate);
    
    for (const feature of this.ALLOWED_FEATURES) {
      usage[feature] = analytics.featureUsage?.[feature] || 0;
    }
    
    return usage;
  }
}

export const whiteLabelService = new WhiteLabelService(); 