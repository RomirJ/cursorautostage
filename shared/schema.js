// JavaScript version of schema for server compatibility
export const users = {
  name: 'users',
  columns: {
    id: { type: 'string', primaryKey: true },
    email: { type: 'string', nullable: true },
    firstName: { type: 'string', nullable: true },
    lastName: { type: 'string', nullable: true },
    profileImageUrl: { type: 'string', nullable: true },
    stripeCustomerId: { type: 'string', nullable: true },
    stripeSubscriptionId: { type: 'string', nullable: true },
    subscriptionStatus: { type: 'string', nullable: true },
    subscriptionTier: { type: 'string', nullable: true },
    createdAt: { type: 'timestamp', nullable: true },
    updatedAt: { type: 'timestamp', nullable: true }
  }
};

export const uploads = {
  name: 'uploads',
  columns: {
    id: { type: 'string', primaryKey: true },
    userId: { type: 'string', nullable: true },
    originalName: { type: 'string', nullable: true },
    fileName: { type: 'string', nullable: true },
    filePath: { type: 'string', nullable: true },
    fileSize: { type: 'integer', nullable: true },
    mimeType: { type: 'string', nullable: true },
    status: { type: 'string', nullable: true },
    uploadId: { type: 'string', nullable: true },
    createdAt: { type: 'timestamp', nullable: true },
    updatedAt: { type: 'timestamp', nullable: true }
  }
};

export const transcriptions = {
  name: 'transcriptions',
  columns: {
    id: { type: 'string', primaryKey: true },
    uploadId: { type: 'string', nullable: true },
    text: { type: 'text', nullable: true },
    wordTimestamps: { type: 'json', nullable: true },
    language: { type: 'string', nullable: true },
    confidence: { type: 'real', nullable: true },
    status: { type: 'string', nullable: true },
    createdAt: { type: 'timestamp', nullable: true }
  }
};

// Export all tables as a schema object
export const schema = {
  users,
  uploads,
  transcriptions
};

// Type definitions for TypeScript compatibility
export const User = {
  id: 'string',
  email: 'string | null',
  firstName: 'string | null',
  lastName: 'string | null',
  profileImageUrl: 'string | null',
  stripeCustomerId: 'string | null',
  stripeSubscriptionId: 'string | null',
  subscriptionStatus: 'string | null',
  subscriptionTier: 'string | null',
  createdAt: 'Date | null',
  updatedAt: 'Date | null'
};

export const Upload = {
  id: 'string',
  userId: 'string | null',
  originalName: 'string | null',
  fileName: 'string | null',
  filePath: 'string | null',
  fileSize: 'number | null',
  mimeType: 'string | null',
  status: 'string | null',
  uploadId: 'string | null',
  createdAt: 'Date | null',
  updatedAt: 'Date | null'
};

export const Transcription = {
  id: 'string',
  uploadId: 'string | null',
  text: 'string | null',
  wordTimestamps: 'any | null',
  language: 'string | null',
  confidence: 'number | null',
  status: 'string | null',
  createdAt: 'Date | null'
}; 