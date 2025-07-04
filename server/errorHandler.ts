import { ErrorInfo, ErrorCategory, mapErrorToUserFriendly, ErrorRegistry } from './errorTypes';
import { storage } from './storage';

export interface ErrorContext {
  userId?: string;
  uploadId?: string;
  action?: string;
  platform?: string;
  userAgent?: string;
  ip?: string;
  timestamp: Date;
  retryCount?: number;
}

export interface ProcessedError {
  errorInfo: ErrorInfo;
  context: ErrorContext;
  errorId: string;
  shouldRetry: boolean;
  retryCount?: number;
  userResponse: {
    message: string;
    recoverySteps: string[];
    isRetryable: boolean;
    errorCode: string;
  };
  technicalResponse?: {
    originalError: any;
    stack?: string;
    additionalContext?: any;
  };
}

export class ErrorHandler {
  private static instance: ErrorHandler;
  private errorLog: Map<string, ProcessedError> = new Map();

  static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  async processError(
    error: any, 
    context: Partial<ErrorContext> = {}
  ): Promise<ProcessedError> {
    const errorId = this.generateErrorId();
    const fullContext: ErrorContext = {
      timestamp: new Date(),
      ...context
    };

    // Map error to user-friendly format
    const errorInfo = mapErrorToUserFriendly(error);
    
    // Determine if this should be retried
    const shouldRetry = errorInfo.isRetryable && 
      (context.retryCount === undefined || context.retryCount < (errorInfo.maxRetries || 3));

    // Create processed error
    const processedError: ProcessedError = {
      errorInfo,
      context: fullContext,
      errorId,
      shouldRetry,
      retryCount: context.retryCount || 0,
      userResponse: {
        message: errorInfo.userMessage,
        recoverySteps: errorInfo.recoverySteps,
        isRetryable: errorInfo.isRetryable,
        errorCode: errorInfo.code
      },
      technicalResponse: {
        originalError: error,
        stack: error.stack,
        additionalContext: context
      }
    };

    // Log the error
    await this.logError(processedError);

    // Update upload status if applicable
    if (context.uploadId && errorInfo.category === ErrorCategory.FILE_PROCESSING) {
      await this.updateUploadStatus(context.uploadId, 'failed', errorInfo.code);
    }

    return processedError;
  }

  async processUploadError(
    error: any, 
    uploadId: string, 
    userId: string,
    retryCount: number = 0
  ): Promise<ProcessedError> {
    return this.processError(error, {
      uploadId,
      userId,
      action: 'upload',
      retryCount
    });
  }

  async processProcessingError(
    error: any, 
    uploadId: string, 
    userId: string,
    stage: string,
    retryCount: number = 0
  ): Promise<ProcessedError> {
    return this.processError(error, {
      uploadId,
      userId,
      action: `processing_${stage}`,
      retryCount
    });
  }

  async processPlatformError(
    error: any, 
    platform: string, 
    userId: string,
    action: string
  ): Promise<ProcessedError> {
    return this.processError(error, {
      platform,
      userId,
      action: `platform_${action}`
    });
  }

  private async logError(processedError: ProcessedError): Promise<void> {
    try {
      // Store in memory for immediate access
      this.errorLog.set(processedError.errorId, processedError);

      // Log to database for persistence
      await this.logToDatabase(processedError);

      // Log to console for debugging
      this.logToConsole(processedError);

      // Send to external monitoring if critical
      if (processedError.errorInfo.severity === 'critical') {
        await this.sendToMonitoring(processedError);
      }
    } catch (logError) {
      console.error('Failed to log error:', logError);
    }
  }

  private async logToDatabase(processedError: ProcessedError): Promise<void> {
    try {
      // Create error log entry in database
      const errorLogEntry = {
        id: processedError.errorId,
        userId: processedError.context.userId,
        uploadId: processedError.context.uploadId,
        errorCode: processedError.errorInfo.code,
        category: processedError.errorInfo.category,
        severity: processedError.errorInfo.severity,
        userMessage: processedError.userResponse.message,
        technicalDetails: JSON.stringify(processedError.technicalResponse),
        context: JSON.stringify(processedError.context),
        createdAt: processedError.context.timestamp
      };

      // Store in database (you'll need to create this table)
      // await storage.createErrorLog(errorLogEntry);
      
      // For now, just log to console
      console.log('Error logged to database:', errorLogEntry);
    } catch (error) {
      console.error('Failed to log error to database:', error);
    }
  }

  private logToConsole(processedError: ProcessedError): void {
    const { errorInfo, context, errorId } = processedError;
    
    console.error(`[ErrorHandler] ${errorId} - ${errorInfo.code}`, {
      category: errorInfo.category,
      severity: errorInfo.severity,
      userMessage: errorInfo.userMessage,
      context: {
        userId: context.userId,
        uploadId: context.uploadId,
        action: context.action,
        platform: context.platform
      },
      timestamp: context.timestamp.toISOString()
    });
  }

  private async sendToMonitoring(processedError: ProcessedError): Promise<void> {
    // Send critical errors to external monitoring service
    // This could be Sentry, DataDog, etc.
    console.error('CRITICAL ERROR - Should send to monitoring:', processedError);
  }

  private async updateUploadStatus(
    uploadId: string, 
    status: string, 
    errorCode?: string
  ): Promise<void> {
    try {
      await storage.updateUploadStatus(uploadId, status);
      
      // Store error code if provided
      if (errorCode) {
        // await storage.updateUploadError(uploadId, errorCode);
        console.log(`Updated upload ${uploadId} status to ${status} with error ${errorCode}`);
      }
    } catch (error) {
      console.error('Failed to update upload status:', error);
    }
  }

  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Get error statistics
  async getErrorStats(userId?: string, timeRange?: { start: Date; end: Date }): Promise<any> {
    const errors = Array.from(this.errorLog.values());
    
    let filteredErrors = errors;
    
    if (userId) {
      filteredErrors = filteredErrors.filter(e => e.context.userId === userId);
    }
    
    if (timeRange) {
      filteredErrors = filteredErrors.filter(e => 
        e.context.timestamp >= timeRange.start && e.context.timestamp <= timeRange.end
      );
    }

    const stats = {
      total: filteredErrors.length,
      byCategory: {} as Record<string, number>,
      bySeverity: {} as Record<string, number>,
      byCode: {} as Record<string, number>,
      retryable: filteredErrors.filter(e => e.shouldRetry).length,
      critical: filteredErrors.filter(e => e.errorInfo.severity === 'critical').length
    };

    filteredErrors.forEach(error => {
      const category = error.errorInfo.category;
      const severity = error.errorInfo.severity;
      const code = error.errorInfo.code;

      stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;
      stats.bySeverity[severity] = (stats.bySeverity[severity] || 0) + 1;
      stats.byCode[code] = (stats.byCode[code] || 0) + 1;
    });

    return stats;
  }

  // Get recent errors for a user
  async getUserErrors(userId: string, limit: number = 10): Promise<ProcessedError[]> {
    const errors = Array.from(this.errorLog.values())
      .filter(e => e.context.userId === userId)
      .sort((a, b) => b.context.timestamp.getTime() - a.context.timestamp.getTime())
      .slice(0, limit);

    return errors;
  }

  // Get error details by ID
  getErrorById(errorId: string): ProcessedError | undefined {
    return this.errorLog.get(errorId);
  }

  // Clear old errors (cleanup)
  clearOldErrors(olderThan: Date): void {
    const now = new Date();
    for (const [errorId, error] of this.errorLog.entries()) {
      if (error.context.timestamp < olderThan) {
        this.errorLog.delete(errorId);
      }
    }
  }
}

// Export singleton instance
export const errorHandler = ErrorHandler.getInstance();

// Helper function for Express error handling
export function createErrorResponse(processedError: ProcessedError) {
  return {
    success: false,
    error: {
      code: processedError.userResponse.errorCode,
      message: processedError.userResponse.message,
      recoverySteps: processedError.userResponse.recoverySteps,
      isRetryable: processedError.userResponse.isRetryable,
      errorId: processedError.errorId
    }
  };
}

// Express middleware for error handling
export function errorHandlerMiddleware() {
  return async (error: any, req: any, res: any, next: any) => {
    try {
      const context: Partial<ErrorContext> = {
        userId: req.user?.id,
        userAgent: req.headers['user-agent'],
        ip: req.ip,
        action: `${req.method} ${req.path}`
      };

      const processedError = await errorHandler.processError(error, context);
      
      // Don't expose technical details in production
      const response = createErrorResponse(processedError);
      
      res.status(500).json(response);
    } catch (handlerError) {
      console.error('Error handler failed:', handlerError);
      res.status(500).json({
        success: false,
        error: {
          code: 'UNKNOWN_ERROR',
          message: 'An unexpected error occurred',
          recoverySteps: ['Please try again', 'Contact support if problem persists'],
          isRetryable: true
        }
      });
    }
  };
} 