# Feature Gaps and Failure Reasons

This document lists areas where the current code base does not fully implement the features described in `FEATURES.md` and outlines tasks required to make them production ready.

## 1. Ingestion
- **Session management for large uploads**: Partial implementation; resumable chunked uploads rely on simple metadata files and lack retry logic.
- **Platform-specific media helpers**: Only YouTube and X helpers exist; TikTok and Instagram multipart flows are not implemented.

## 2. Transcription & Pre-Processing
- **Speaker diarization**: No AssemblyAI integration in the repo.
- **Noise filtering & loudness normalization**: Basic FFmpeg pass; no configurable filters.

## 3. Semantic Chunking & AI Analysis
- **Brand voice matching**: Embedding averages stored but no continuous learning mechanism.

## 4. Derivative Asset Generation
- **B-roll intro/outro**: Placeholder comments only.
- **Thumbnail generator**: Missing Canva-style templates and frame extraction logic.
- **AI-powered ad-script generator for YouTube AdSense split tests**: Not present in the code base.

## 5. Scheduling & Multi-Platform Publishing
- **Best-time rules library**: Static set of rules; lacks user-level configuration.
- **OAuth token refresh**: Some platforms missing auto-refresh handlers.

## 6. Engagement Loop
- **Real-time webhooks**: Only YouTube implemented; other platforms stubbed.
- **Breakout detector**: Basic velocity check but no ad spend integration.

## 7. Monetization Layer
- **Sponsorship prospecting via Apollo/LinkedIn**: Search logic missing; only placeholder functions.
- **Per-asset CPM/RPM tracking**: Revenue model lacks historic trend storage.

## 8. Analytics & Reporting
- **Heat-map of watch-time drop-off**: Method stubbed in `analyticsService`.
- **Weekly PDF digest**: Report generation uses dummy data, PDF generation missing.

## 9. User & Project Management
- **Multi-brand workspaces**: CRUD endpoints exist but no role enforcement in UI.

## 10. Infrastructure & DevOps
- **Feature-flag service**: Only in-memory storage; no Supabase integration.

## 11. Compliance & Safety
- **GDPR/CCPA endpoints**: `delete-data` route exists but audit logging and confirmation emails missing.

## 12. Extensibility & Future Flags
- **Plugin interface for new platforms**: No plugin loader or interface defined.
- **Multilingual dubbing & subtitle export**: Only a TODO comment.

## 13. Mobile & Cross-Platform
- **PWA capabilities**: No service worker or offline caching.

## 14. Advanced Features
- **A/B hook tester**: Feature flag checked but no implementation to post two clips and measure results.
- **AI-powered ad-script generator**: Not implemented.

