import { apiRequest } from "./queryClient";

export async function publishNow(postId: string) {
  return apiRequest('/api/publish/now', 'POST', { postId });
}
