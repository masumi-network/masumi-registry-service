// All TanStack Query keys live here, so invalidation can target a whole domain.
// Feature slices add their own entries next to the hooks that use them.
export const queryKeys = {
  health: ['health'] as const,
  apiKeyStatus: ['api-key-status'] as const,
};
