import { capabilityRepository } from '@/repositories/capability';
function getCapabilities(cursorId: string | undefined, limit: number) {
  return capabilityRepository.getCapabilities(cursorId, limit);
}
export const capabilityService = { getCapabilities };
