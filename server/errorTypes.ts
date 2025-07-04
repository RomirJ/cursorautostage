export enum ErrorCategory {
  // Upload & File Errors
  FILE_UPLOAD = 'file_upload',
  FILE_PROCESSING = 'file_processing',
  FILE_FORMAT = 'file_format',
  FILE_SIZE = 'file_size',
  
  // Authentication & Authorization
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  SESSION_EXPIRED = 'session_expired',
  
  // Network & Infrastructure
  NETWORK = 'network',
  TIMEOUT = 'timeout',
  SERVER_ERROR = 'server_error',
  
  // Platform Integration
  PLATFORM_AUTH = 'platform_auth',
  PLATFORM_API = 'platform_api',
  PLATFORM_RATE_LIMIT = 'platform_rate_limit',
  
  // Processing Pipeline
  TRANSCRIPTION = 'transcription',
  SEGMENTATION = 'segmentation',
  CLIP_GENERATION = 'clip_generation',
  CONTENT_GENERATION = 'content_generation',
  
  // Storage & Database
  STORAGE = 'storage',
  DATABASE = 'database',
  
  // User Input
  VALIDATION = 'validation',
  MISSING_DATA = 'missing_data',
  
  // External Services
  OPENAI_API = 'openai_api',
  ASSEMBLYAI_API = 'assemblyai_api',
  STRIPE_API = 'stripe_api',
  
  // Unknown
  UNKNOWN = 'unknown'
}

export interface ErrorInfo {
  category: ErrorCategory;
  code: string;
  userMessage: string;
  recoverySteps: string[];
  isRetryable: boolean;
  maxRetries?: number;
  technicalDetails?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export class ErrorRegistry {
  private static errors: Map<string, ErrorInfo> = new Map();

  static register(errorCode: string, errorInfo: ErrorInfo) {
    this.errors.set(errorCode, errorInfo);
  }

  static get(errorCode: string): ErrorInfo | undefined {
    return this.errors.get(errorCode);
  }

  static getByCategory(category: ErrorCategory): ErrorInfo[] {
    return Array.from(this.errors.values()).filter(e => e.category === category);
  }

  static getAll(): ErrorInfo[] {
    return Array.from(this.errors.values());
  }
}

// Initialize error registry with all possible errors
export function initializeErrorRegistry() {
  // File Upload Errors
  ErrorRegistry.register('UPLOAD_FILE_TOO_LARGE', {
    category: ErrorCategory.FILE_SIZE,
    code: 'UPLOAD_FILE_TOO_LARGE',
    userMessage: 'File is too large. Maximum size is 500MB.',
    recoverySteps: [
      'Compress your video/audio file to reduce size',
      'Split large files into smaller segments',
      'Use a different file format (MP4 instead of MOV)'
    ],
    isRetryable: false,
    severity: 'medium'
  });

  ErrorRegistry.register('UPLOAD_INVALID_FORMAT', {
    category: ErrorCategory.FILE_FORMAT,
    code: 'UPLOAD_INVALID_FORMAT',
    userMessage: 'File format not supported. Please use MP4, MOV, MP3, or WAV files.',
    recoverySteps: [
      'Convert your file to a supported format',
      'Use a video converter tool',
      'Check file extension matches actual format'
    ],
    isRetryable: false,
    severity: 'medium'
  });

  ErrorRegistry.register('UPLOAD_NETWORK_ERROR', {
    category: ErrorCategory.NETWORK,
    code: 'UPLOAD_NETWORK_ERROR',
    userMessage: 'Network error during upload. Please check your connection.',
    recoverySteps: [
      'Check your internet connection',
      'Try uploading again',
      'Use a different network if available',
      'Contact support if problem persists'
    ],
    isRetryable: true,
    maxRetries: 3,
    severity: 'medium'
  });

  ErrorRegistry.register('UPLOAD_CHUNK_FAILED', {
    category: ErrorCategory.FILE_UPLOAD,
    code: 'UPLOAD_CHUNK_FAILED',
    userMessage: 'Upload failed due to network interruption.',
    recoverySteps: [
      'Your upload will automatically retry',
      'Check your internet connection',
      'Wait a few minutes and try again'
    ],
    isRetryable: true,
    maxRetries: 3,
    severity: 'medium'
  });

  // Processing Errors
  ErrorRegistry.register('TRANSCRIPTION_FAILED', {
    category: ErrorCategory.TRANSCRIPTION,
    code: 'TRANSCRIPTION_FAILED',
    userMessage: 'Failed to transcribe your audio/video. The file may be corrupted or have poor audio quality.',
    recoverySteps: [
      'Check audio quality and volume levels',
      'Ensure file is not corrupted',
      'Try with a different file',
      'Contact support if problem persists'
    ],
    isRetryable: true,
    maxRetries: 2,
    severity: 'high'
  });

  ErrorRegistry.register('SEGMENTATION_FAILED', {
    category: ErrorCategory.SEGMENTATION,
    code: 'SEGMENTATION_FAILED',
    userMessage: 'Failed to analyze content structure. The content may be too short or unclear.',
    recoverySteps: [
      'Ensure content is at least 30 seconds long',
      'Check audio clarity and speech quality',
      'Try with content that has clear topics',
      'Contact support for assistance'
    ],
    isRetryable: true,
    maxRetries: 2,
    severity: 'medium'
  });

  ErrorRegistry.register('CLIP_GENERATION_FAILED', {
    category: ErrorCategory.CLIP_GENERATION,
    code: 'CLIP_GENERATION_FAILED',
    userMessage: 'Failed to generate video clips. This may be due to video processing issues.',
    recoverySteps: [
      'Check video file integrity',
      'Ensure video has clear visual content',
      'Try with a different video file',
      'Contact support for assistance'
    ],
    isRetryable: true,
    maxRetries: 2,
    severity: 'medium'
  });

  // Authentication Errors
  ErrorRegistry.register('AUTH_TOKEN_EXPIRED', {
    category: ErrorCategory.SESSION_EXPIRED,
    code: 'AUTH_TOKEN_EXPIRED',
    userMessage: 'Your session has expired. Please log in again.',
    recoverySteps: [
      'Click "Log In" to refresh your session',
      'Enter your credentials again',
      'Contact support if login issues persist'
    ],
    isRetryable: false,
    severity: 'low'
  });

  ErrorRegistry.register('PLATFORM_AUTH_REQUIRED', {
    category: ErrorCategory.PLATFORM_AUTH,
    code: 'PLATFORM_AUTH_REQUIRED',
    userMessage: 'Platform authorization required. Please connect your social media accounts.',
    recoverySteps: [
      'Go to Social Accounts page',
      'Connect your YouTube/Twitter/Instagram accounts',
      'Grant necessary permissions',
      'Try your action again'
    ],
    isRetryable: false,
    severity: 'medium'
  });

  ErrorRegistry.register('PLATFORM_TOKEN_EXPIRED', {
    category: ErrorCategory.PLATFORM_AUTH,
    code: 'PLATFORM_TOKEN_EXPIRED',
    userMessage: 'Your social media connection has expired. Please reconnect your accounts.',
    recoverySteps: [
      'Go to Social Accounts page',
      'Reconnect your accounts',
      'Grant permissions again',
      'Try your action again'
    ],
    isRetryable: false,
    severity: 'medium'
  });

  // API & External Service Errors
  ErrorRegistry.register('OPENAI_API_ERROR', {
    category: ErrorCategory.OPENAI_API,
    code: 'OPENAI_API_ERROR',
    userMessage: 'AI processing temporarily unavailable. Please try again in a few minutes.',
    recoverySteps: [
      'Wait 2-3 minutes and try again',
      'Check if you have sufficient credits',
      'Contact support if problem persists'
    ],
    isRetryable: true,
    maxRetries: 3,
    severity: 'medium'
  });

  ErrorRegistry.register('PLATFORM_RATE_LIMIT', {
    category: ErrorCategory.PLATFORM_RATE_LIMIT,
    code: 'PLATFORM_RATE_LIMIT',
    userMessage: 'Rate limit reached. Please wait before trying again.',
    recoverySteps: [
      'Wait 15-30 minutes before retrying',
      'Reduce frequency of requests',
      'Check platform-specific limits',
      'Contact support if limits seem incorrect'
    ],
    isRetryable: true,
    maxRetries: 1,
    severity: 'medium'
  });

  // Server & Infrastructure Errors
  ErrorRegistry.register('SERVER_ERROR', {
    category: ErrorCategory.SERVER_ERROR,
    code: 'SERVER_ERROR',
    userMessage: 'Server error occurred. Our team has been notified.',
    recoverySteps: [
      'Try again in a few minutes',
      'Check our status page for updates',
      'Contact support if problem persists'
    ],
    isRetryable: true,
    maxRetries: 3,
    severity: 'high'
  });

  ErrorRegistry.register('DATABASE_ERROR', {
    category: ErrorCategory.DATABASE,
    code: 'DATABASE_ERROR',
    userMessage: 'Database connection error. Please try again.',
    recoverySteps: [
      'Refresh the page and try again',
      'Wait a few minutes and retry',
      'Contact support if problem persists'
    ],
    isRetryable: true,
    maxRetries: 3,
    severity: 'high'
  });

  // Validation Errors
  ErrorRegistry.register('MISSING_REQUIRED_FIELD', {
    category: ErrorCategory.VALIDATION,
    code: 'MISSING_REQUIRED_FIELD',
    userMessage: 'Required information is missing. Please fill in all required fields.',
    recoverySteps: [
      'Check all required fields are filled',
      'Ensure file is selected',
      'Complete all form sections',
      'Try submitting again'
    ],
    isRetryable: false,
    severity: 'low'
  });

  // Unknown Error (fallback)
  ErrorRegistry.register('UNKNOWN_ERROR', {
    category: ErrorCategory.UNKNOWN,
    code: 'UNKNOWN_ERROR',
    userMessage: 'An unexpected error occurred. Please try again.',
    recoverySteps: [
      'Refresh the page and try again',
      'Clear browser cache and cookies',
      'Try a different browser',
      'Contact support with error details'
    ],
    isRetryable: true,
    maxRetries: 2,
    severity: 'medium'
  });
}

// Error mapping functions
export function mapErrorToUserFriendly(error: any): ErrorInfo {
  const errorMessage = error.message || error.toString();
  const errorCode = error.code || 'UNKNOWN_ERROR';
  
  // Try to find exact match
  let errorInfo = ErrorRegistry.get(errorCode);
  
  // If no exact match, try to categorize based on message
  if (!errorInfo) {
    errorInfo = categorizeErrorByMessage(errorMessage);
  }
  
  return errorInfo || ErrorRegistry.get('UNKNOWN_ERROR')!;
}

function categorizeErrorByMessage(message: string): ErrorInfo | undefined {
  const lowerMessage = message.toLowerCase();
  
  if (lowerMessage.includes('file too large') || lowerMessage.includes('size limit')) {
    return ErrorRegistry.get('UPLOAD_FILE_TOO_LARGE');
  }
  
  if (lowerMessage.includes('invalid format') || lowerMessage.includes('unsupported')) {
    return ErrorRegistry.get('UPLOAD_INVALID_FORMAT');
  }
  
  if (lowerMessage.includes('network') || lowerMessage.includes('connection')) {
    return ErrorRegistry.get('UPLOAD_NETWORK_ERROR');
  }
  
  if (lowerMessage.includes('transcription') || lowerMessage.includes('audio')) {
    return ErrorRegistry.get('TRANSCRIPTION_FAILED');
  }
  
  if (lowerMessage.includes('unauthorized') || lowerMessage.includes('forbidden')) {
    return ErrorRegistry.get('AUTH_TOKEN_EXPIRED');
  }
  
  if (lowerMessage.includes('rate limit') || lowerMessage.includes('too many requests')) {
    return ErrorRegistry.get('PLATFORM_RATE_LIMIT');
  }
  
  if (lowerMessage.includes('openai') || lowerMessage.includes('api key')) {
    return ErrorRegistry.get('OPENAI_API_ERROR');
  }
  
  return undefined;
}

// Initialize the registry when this module is imported
initializeErrorRegistry(); 