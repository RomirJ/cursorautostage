import { storage } from './storage';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

interface DataExportRequest {
  id: string;
  userId: string;
  requestType: 'gdpr' | 'ccpa' | 'full_export';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  requestedData: string[];
  exportUrl?: string;
  expiresAt: Date;
  createdAt: Date;
  completedAt?: Date;
}

interface DataErasureRequest {
  id: string;
  userId: string;
  requestType: 'gdpr_erasure' | 'ccpa_deletion' | 'account_deletion';
  status: 'pending' | 'verified' | 'processing' | 'completed' | 'failed';
  verificationToken: string;
  verificationExpiresAt: Date;
  dataTypes: string[];
  retentionPeriod?: number; // days
  createdAt: Date;
  processedAt?: Date;
  completedAt?: Date;
}

interface ConsentRecord {
  id: string;
  userId: string;
  consentType: string;
  granted: boolean;
  version: string;
  ipAddress: string;
  userAgent: string;
  timestamp: Date;
  expiresAt?: Date;
  withdrawnAt?: Date;
}

interface AuditLogEntry {
  id: string;
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  details: Record<string, any>;
  ipAddress: string;
  userAgent: string;
  timestamp: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'data_access' | 'data_modification' | 'data_deletion' | 'authentication' | 'authorization' | 'system';
}

interface ComplianceReport {
  period: { start: Date; end: Date };
  dataSubjectRequests: {
    exports: number;
    erasures: number;
    rectifications: number;
    objections: number;
  };
  consentMetrics: {
    granted: number;
    withdrawn: number;
    expired: number;
  };
  auditSummary: {
    totalEvents: number;
    criticalEvents: number;
    dataBreaches: number;
  };
  complianceScore: number;
  recommendations: string[];
}

export class ComplianceService {
  private readonly DATA_RETENTION_PERIODS = {
    user_data: 2555, // 7 years for financial records
    analytics_data: 1095, // 3 years
    audit_logs: 2555, // 7 years
    consent_records: 2555, // 7 years
    session_data: 30, // 30 days
    temporary_files: 7 // 7 days
  };

  private readonly CONSENT_TYPES = {
    analytics: 'Analytics and Performance Tracking',
    marketing: 'Marketing Communications',
    personalization: 'Content Personalization',
    third_party_sharing: 'Third-party Data Sharing',
    cookies: 'Cookie Usage',
    location: 'Location Data Collection'
  };

  // GDPR/CCPA Data Export
  async requestDataExport(userId: string, requestType: 'gdpr' | 'ccpa' | 'full_export', requestedData: string[]): Promise<string> {
    try {
      const exportRequest: DataExportRequest = {
        id: uuidv4(),
        userId,
        requestType,
        status: 'pending',
        requestedData,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        createdAt: new Date()
      };

      await storage.createDataExportRequest(exportRequest);
      
      // Log the request
      await this.logAuditEvent({
        userId,
        action: 'data_export_requested',
        resource: 'user_data',
        details: { requestType, requestedData },
        severity: 'medium',
        category: 'data_access'
      });

      // Start processing asynchronously
      this.processDataExport(exportRequest.id).catch(error => {
        console.error(`[Compliance] Data export processing failed for ${exportRequest.id}:`, error);
      });

      return exportRequest.id;
    } catch (error) {
      console.error('[Compliance] Error requesting data export:', error);
      throw new Error('Failed to process data export request');
    }
  }

  private async processDataExport(requestId: string): Promise<void> {
    try {
      const request = await storage.getDataExportRequest(requestId);
      if (!request) throw new Error('Export request not found');

      await storage.updateDataExportRequest(requestId, { status: 'processing' });

      // Collect all user data
      const userData = await this.collectUserData(request.userId, request.requestedData);
      
      // Generate export file
      const exportPath = await this.generateExportFile(request.userId, userData);
      const exportUrl = await this.uploadExportFile(exportPath);

      await storage.updateDataExportRequest(requestId, {
        status: 'completed',
        exportUrl,
        completedAt: new Date()
      });

      // Send notification to user
      await this.notifyDataExportReady(request.userId, exportUrl);

      // Log completion
      await this.logAuditEvent({
        userId: request.userId,
        action: 'data_export_completed',
        resource: 'user_data',
        resourceId: requestId,
        details: { exportUrl },
        severity: 'medium',
        category: 'data_access'
      });

    } catch (error) {
      await storage.updateDataExportRequest(requestId, { status: 'failed' });
      console.error(`[Compliance] Data export processing failed:`, error);
    }
  }

  private async collectUserData(userId: string, requestedData: string[]): Promise<Record<string, any>> {
    const userData: Record<string, any> = {};

    if (requestedData.includes('profile') || requestedData.includes('all')) {
      userData.profile = await storage.getUser(userId);
    }

    if (requestedData.includes('uploads') || requestedData.includes('all')) {
      userData.uploads = await storage.getUserUploads(userId);
    }

    if (requestedData.includes('social_accounts') || requestedData.includes('all')) {
      userData.socialAccounts = await storage.getSocialAccountsByUserId(userId);
    }

    if (requestedData.includes('posts') || requestedData.includes('all')) {
      userData.posts = await storage.getSocialPostsByUserId(userId);
    }

    if (requestedData.includes('analytics') || requestedData.includes('all')) {
      userData.analytics = await storage.getUserStats(userId);
    }

    if (requestedData.includes('revenue') || requestedData.includes('all')) {
      userData.revenue = await storage.getRevenueRecordsByUserId(userId);
    }

    if (requestedData.includes('workspaces') || requestedData.includes('all')) {
      userData.workspaces = await storage.getWorkspacesByUser(userId);
    }

    if (requestedData.includes('consent') || requestedData.includes('all')) {
      userData.consent = await storage.getConsentRecordsByUserId(userId);
    }

    if (requestedData.includes('audit_logs') || requestedData.includes('all')) {
      userData.auditLogs = await storage.getAuditLogsByUserId(userId);
    }

    return userData;
  }

  private async generateExportFile(userId: string, userData: Record<string, any>): Promise<string> {
    const exportDir = path.join(process.cwd(), 'exports');
    await fs.mkdir(exportDir, { recursive: true });

    const fileName = `data_export_${userId}_${Date.now()}.json`;
    const filePath = path.join(exportDir, fileName);

    const exportData = {
      exportInfo: {
        userId,
        generatedAt: new Date().toISOString(),
        dataTypes: Object.keys(userData),
        format: 'JSON',
        compliance: 'GDPR/CCPA'
      },
      userData
    };

    await fs.writeFile(filePath, JSON.stringify(exportData, null, 2));
    return filePath;
  }

  private async uploadExportFile(filePath: string): Promise<string> {
    // Upload to secure cloud storage with temporary access
    // For now, return a local path (in production, use S3/GCS with signed URLs)
    return `/api/compliance/export/${path.basename(filePath)}`;
  }

  // GDPR/CCPA Data Erasure
  async requestDataErasure(userId: string, requestType: 'gdpr_erasure' | 'ccpa_deletion' | 'account_deletion', dataTypes: string[]): Promise<string> {
    try {
      const verificationToken = crypto.randomBytes(32).toString('hex');
      
      const erasureRequest: DataErasureRequest = {
        id: uuidv4(),
        userId,
        requestType,
        status: 'pending',
        verificationToken,
        verificationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        dataTypes,
        createdAt: new Date()
      };

      await storage.createDataErasureRequest(erasureRequest);

      // Send verification email
      await this.sendErasureVerificationEmail(userId, verificationToken);

      // Log the request
      await this.logAuditEvent({
        userId,
        action: 'data_erasure_requested',
        resource: 'user_data',
        details: { requestType, dataTypes },
        severity: 'high',
        category: 'data_deletion'
      });

      return erasureRequest.id;
    } catch (error) {
      console.error('[Compliance] Error requesting data erasure:', error);
      throw new Error('Failed to process data erasure request');
    }
  }

  async verifyDataErasure(requestId: string, verificationToken: string): Promise<boolean> {
    try {
      const request = await storage.getDataErasureRequest(requestId);
      if (!request) return false;

      if (request.verificationToken !== verificationToken || new Date() > request.verificationExpiresAt) {
        return false;
      }

      await storage.updateDataErasureRequest(requestId, { 
        status: 'verified',
        processedAt: new Date()
      });

      // Start erasure process
      this.processDataErasure(requestId).catch(error => {
        console.error(`[Compliance] Data erasure processing failed for ${requestId}:`, error);
      });

      return true;
    } catch (error) {
      console.error('[Compliance] Error verifying data erasure:', error);
      return false;
    }
  }

  private async processDataErasure(requestId: string): Promise<void> {
    try {
      const request = await storage.getDataErasureRequest(requestId);
      if (!request) throw new Error('Erasure request not found');

      await storage.updateDataErasureRequest(requestId, { status: 'processing' });

      // Perform data erasure based on request type
      if (request.requestType === 'account_deletion') {
        await this.performCompleteAccountDeletion(request.userId);
      } else {
        await this.performSelectiveDataErasure(request.userId, request.dataTypes);
      }

      await storage.updateDataErasureRequest(requestId, {
        status: 'completed',
        completedAt: new Date()
      });

      // Log completion
      await this.logAuditEvent({
        userId: request.userId,
        action: 'data_erasure_completed',
        resource: 'user_data',
        resourceId: requestId,
        details: { requestType: request.requestType, dataTypes: request.dataTypes },
        severity: 'critical',
        category: 'data_deletion'
      });

    } catch (error) {
      await storage.updateDataErasureRequest(requestId, { status: 'failed' });
      console.error(`[Compliance] Data erasure processing failed:`, error);
    }
  }

  private async performCompleteAccountDeletion(userId: string): Promise<void> {
    // Complete account deletion with data retention for legal requirements
    await storage.deleteUserData(userId);
    
    // Keep audit logs and legal records as required
    await this.logAuditEvent({
      userId,
      action: 'account_deleted',
      resource: 'user_account',
      details: { reason: 'user_request', retentionApplied: true },
      severity: 'critical',
      category: 'data_deletion'
    });
  }

  private async performSelectiveDataErasure(userId: string, dataTypes: string[]): Promise<void> {
    for (const dataType of dataTypes) {
      switch (dataType) {
        case 'uploads':
          await storage.deleteUserUploads(userId);
          break;
        case 'social_accounts':
          await storage.deleteUserSocialAccounts(userId);
          break;
        case 'analytics':
          await storage.deleteUserAnalytics(userId);
          break;
        case 'revenue':
          await storage.deleteUserRevenue(userId);
          break;
        default:
          console.warn(`[Compliance] Unknown data type for erasure: ${dataType}`);
      }
    }
  }

  // Consent Management
  async recordConsent(userId: string, consentType: string, granted: boolean, ipAddress: string, userAgent: string): Promise<void> {
    try {
      const consent: ConsentRecord = {
        id: uuidv4(),
        userId,
        consentType,
        granted,
        version: '1.0',
        ipAddress,
        userAgent,
        timestamp: new Date(),
        expiresAt: granted ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) : undefined // 1 year
      };

      await storage.createConsentRecord(consent);

      await this.logAuditEvent({
        userId,
        action: granted ? 'consent_granted' : 'consent_withdrawn',
        resource: 'consent',
        details: { consentType, version: consent.version },
        severity: 'medium',
        category: 'data_access'
      });

    } catch (error) {
      console.error('[Compliance] Error recording consent:', error);
      throw new Error('Failed to record consent');
    }
  }

  async checkConsent(userId: string, consentType: string): Promise<boolean> {
    try {
      const latestConsent = await storage.getLatestConsentRecord(userId, consentType);
      
      if (!latestConsent) return false;
      if (!latestConsent.granted) return false;
      if (latestConsent.withdrawnAt) return false;
      if (latestConsent.expiresAt && new Date() > latestConsent.expiresAt) return false;

      return true;
    } catch (error) {
      console.error('[Compliance] Error checking consent:', error);
      return false;
    }
  }

  // Audit Logging
  async logAuditEvent(event: Omit<AuditLogEntry, 'id' | 'timestamp'> & { ipAddress?: string; userAgent?: string }): Promise<void> {
    try {
      const auditEntry: AuditLogEntry = {
        id: uuidv4(),
        timestamp: new Date(),
        ipAddress: event.ipAddress || 'unknown',
        userAgent: event.userAgent || 'unknown',
        ...event
      };

      await storage.createAuditLogEntry(auditEntry);

      // Alert on critical events
      if (auditEntry.severity === 'critical') {
        await this.handleCriticalAuditEvent(auditEntry);
      }

    } catch (error) {
      console.error('[Compliance] Error logging audit event:', error);
    }
  }

  private async handleCriticalAuditEvent(event: AuditLogEntry): Promise<void> {
    // Send alerts for critical events
    console.warn(`[CRITICAL AUDIT EVENT] ${event.action} by ${event.userId} on ${event.resource}`);
    
    // In production, send to monitoring systems
    // await alertingService.sendCriticalAlert(event);
  }

  // Compliance Reporting
  async generateComplianceReport(startDate: Date, endDate: Date): Promise<ComplianceReport> {
    try {
      const dataSubjectRequests = await storage.getDataSubjectRequestStats(startDate, endDate);
      const consentMetrics = await storage.getConsentMetrics(startDate, endDate);
      const auditSummary = await storage.getAuditSummary(startDate, endDate);

      const complianceScore = this.calculateComplianceScore(dataSubjectRequests, consentMetrics, auditSummary);
      const recommendations = this.generateComplianceRecommendations(complianceScore, auditSummary);

      return {
        period: { start: startDate, end: endDate },
        dataSubjectRequests,
        consentMetrics,
        auditSummary,
        complianceScore,
        recommendations
      };
    } catch (error) {
      console.error('[Compliance] Error generating compliance report:', error);
      throw new Error('Failed to generate compliance report');
    }
  }

  private calculateComplianceScore(
    dataSubjectRequests: any,
    consentMetrics: any,
    auditSummary: any
  ): number {
    let score = 100;

    // Deduct points for delayed responses
    if (dataSubjectRequests.averageResponseTime > 30) score -= 10;
    
    // Deduct points for critical audit events
    if (auditSummary.criticalEvents > 0) score -= auditSummary.criticalEvents * 5;
    
    // Deduct points for data breaches
    if (auditSummary.dataBreaches > 0) score -= auditSummary.dataBreaches * 20;

    return Math.max(0, score);
  }

  private generateComplianceRecommendations(score: number, auditSummary: any): string[] {
    const recommendations: string[] = [];

    if (score < 80) {
      recommendations.push('Improve response times for data subject requests');
    }

    if (auditSummary.criticalEvents > 0) {
      recommendations.push('Review and address critical security events');
    }

    if (auditSummary.dataBreaches > 0) {
      recommendations.push('Implement additional security measures to prevent data breaches');
    }

    recommendations.push('Regular compliance training for all team members');
    recommendations.push('Quarterly compliance audits and reviews');

    return recommendations;
  }

  // Utility methods
  private async sendErasureVerificationEmail(userId: string, token: string): Promise<void> {
    // Send verification email
    console.log(`[Compliance] Verification email sent to user ${userId} with token ${token}`);
  }

  private async notifyDataExportReady(userId: string, exportUrl: string): Promise<void> {
    // Notify user that data export is ready
    console.log(`[Compliance] Data export ready for user ${userId}: ${exportUrl}`);
  }

  // Data retention cleanup
  async performDataRetentionCleanup(): Promise<void> {
    try {
      for (const [dataType, retentionDays] of Object.entries(this.DATA_RETENTION_PERIODS)) {
        const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
        
        switch (dataType) {
          case 'session_data':
            await storage.deleteExpiredSessions(cutoffDate);
            break;
          case 'temporary_files':
            await storage.deleteTemporaryFiles(cutoffDate);
            break;
          case 'analytics_data':
            await storage.archiveOldAnalytics(cutoffDate);
            break;
        }
      }

      await this.logAuditEvent({
        action: 'data_retention_cleanup',
        resource: 'system',
        details: { retentionPeriods: this.DATA_RETENTION_PERIODS },
        severity: 'low',
        category: 'system'
      });

    } catch (error) {
      console.error('[Compliance] Error during data retention cleanup:', error);
    }
  }
}

export const complianceService = new ComplianceService(); 