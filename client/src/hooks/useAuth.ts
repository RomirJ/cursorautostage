import { useQuery } from "@tanstack/react-query";

export function useAuth() {
  const { data: user, isLoading, error } = useQuery({
    queryKey: ["/api/auth/user"],
    retry: false,
    // Don't throw errors for auth failures - just treat as unauthenticated
    throwOnError: false,
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user && !error,
  };
}
