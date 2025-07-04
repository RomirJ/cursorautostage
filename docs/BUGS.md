# Bug & Issue List for ContentStageEngine

## UI/UX Bugs

1. **Processing Button Too Large**
   - The 'Processing' status button in the upload list is visually too big and should be styled to match other status indicators.

2. **Three-dot Menu/Action Buttons Not Working**
   - The three action buttons (download, share, more) on the right of uploaded content do not trigger any actions or open menus.

3. **No Feedback for Disabled Actions**
   - Download/share buttons are always disabled unless status is 'completed', but no tooltip or feedback is shown.

4. **No Error Message for Failed Uploads/Processing**
   - If upload or processing fails, the UI does not show a clear error or retry option.

5. **No Loading Indicator for Some Async Actions**
   - Some async actions (e.g., scheduling, sharing) do not show a spinner or loading state.

6. **No Confirmation for Destructive Actions**
   - Deleting uploads or content does not prompt for confirmation.

7. **Email Confirmation Link Fails**
   - Clicking the email confirmation link opens localhost, which fails for users not running the server locally. Needs a configurable frontend URL.

8. **No Mobile Responsiveness**
   - The UI is not fully responsive on mobile devices.

## Authentication & Session Bugs

9. **Logout Can Leave Stale Cookies**
   - Logging out may leave stale cookies, causing 403 errors until cookies are cleared. (Mitigated by recent improvements, but should be monitored.)

10. **401/403 Not Handled Gracefully**
    - If a session expires, the app may show a 403 error instead of redirecting to login/landing with a friendly message.

## Feature Gaps & Backend Issues

11. **Resumable Uploads Not Fully Implemented**
    - No retry logic or session persistence for large uploads (see `feature_gaps.md`).

12. **Speaker Diarization Not Implemented**
    - No AssemblyAI integration for advanced audio processing.

13. **No B-roll/Thumbnail Generation**
    - Derivative asset generation (B-roll, thumbnails) is missing or incomplete.

14. **No Real-Time Webhooks for All Platforms**
    - Only YouTube implemented; TikTok, Instagram, LinkedIn are stubbed.

15. **No OAuth Token Auto-Refresh for Some Platforms**
    - Some platforms lack token refresh logic, leading to failed scheduled posts.

16. **No A/B Testing Framework**
    - No automated A/B testing for content optimization.

17. **No PDF Analytics/Weekly Digest**
    - Analytics dashboard lacks heat maps and PDF export.

18. **No Workspace Role Enforcement**
    - Workspaces exist but no role-based access control in UI/API.

19. **No Feature Flag Persistence**
    - Feature flags are in-memory only, not persisted in Supabase.

20. **No GDPR/CCPA Audit Logging**
    - Data deletion endpoints exist but no audit trail or confirmation emails.

21. **No Plugin Architecture**
    - No system for adding new platform plugins or extensibility.

22. **No PWA/Offline Support**
    - No service worker or offline caching for mobile/PWA use.

## Testing & Error Handling

23. **No End-to-End Error Handling for Upload/Processing**
    - Errors in upload or processing pipeline are not surfaced to the user.

24. **No Retry Logic for Failed Jobs**
    - Failed jobs in the queue are not retried automatically.

25. **No User Feedback for API Errors**
    - API errors are not always shown to the user in a friendly way.

---

This list should be updated as bugs are fixed or new issues are discovered. Prioritize UI/UX and authentication/session bugs for immediate fixes, then address feature gaps and backend issues. 