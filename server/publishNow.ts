import { Request, Response } from 'express';
import type { IStorage } from './storage';
import type { postingService } from './postingService';

export interface PublishDeps {
  storage: IStorage;
  postingService: typeof postingService;
}

export function createPublishNowHandler(deps: PublishDeps) {
  return async function publishNow(req: Request, res: Response) {
    try {
      const { postId } = req.body as { postId?: string };
      if (!postId) {
        return res.status(400).json({ message: 'postId required' });
      }
      const post = await deps.storage.getSocialPost(postId);
      if (!post) {
        return res.status(404).json({ message: 'Post not found' });
      }
      await deps.storage.updateSocialPost(postId, { scheduledFor: null });
      const result = await deps.postingService.publishPostById(postId);
      res.json({ success: true, result });
    } catch (error) {
      console.error('Error publishing now:', error);
      res.status(500).json({ message: 'Failed to publish post' });
    }
  };
}
