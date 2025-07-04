import { storage } from './storage';
import { InsertFeatureFlag, FeatureFlag } from '@shared/schema';

interface RolloutRules {
  percentage?: number;
  users?: string[];
}

class FeatureFlagService {
  async listFlags(): Promise<FeatureFlag[]> {
    return storage.getFeatureFlags();
  }

  async getFlag(name: string): Promise<FeatureFlag | undefined> {
    return storage.getFeatureFlag(name);
  }

  async createFlag(data: InsertFeatureFlag): Promise<FeatureFlag> {
    return storage.createFeatureFlag(data);
  }

  async updateFlag(name: string, data: Partial<InsertFeatureFlag>): Promise<void> {
    await storage.updateFeatureFlag(name, data);
  }

  async deleteFlag(name: string): Promise<void> {
    await storage.deleteFeatureFlag(name);
  }

  async isEnabled(name: string, userId?: string): Promise<boolean> {
    const flag = await this.getFlag(name);
    if (!flag || !flag.enabled) return false;

    const rules = (flag.rolloutRules as RolloutRules) || {};
    if (rules.users && userId && rules.users.includes(userId)) {
      return true;
    }
    if (rules.percentage !== undefined) {
      if (!userId) {
        return Math.random() * 100 < rules.percentage;
      }
      const hash = this.hash(userId + name) % 100;
      return hash < rules.percentage;
    }
    return flag.enabled;
  }

  private hash(str: string): number {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(31, h) + str.charCodeAt(i) | 0;
    }
    return Math.abs(h);
  }
}

export const featureFlagService = new FeatureFlagService();
