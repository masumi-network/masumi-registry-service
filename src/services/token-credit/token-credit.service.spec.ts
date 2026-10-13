/* eslint-disable @typescript-eslint/no-require-imports */
import { tokenCreditService } from './token-credit.service';

jest.mock('@/repositories/creditTokens', () => ({
  creditTokenRepository: {
    handleCreditUsage: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('tokenCreditService', () => {
  const { creditTokenRepository } = require('@/repositories/creditTokens');
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('handleTokenCredits', () => {
    const mockUser = {
      id: 'test-id',
      permissions: [],
      accumulatedUsageCredits: 0,
      maxUsageCredits: 100,
      usageLimited: true,
    };
    it('should charge credits for normal users', async () => {
      await tokenCreditService.handleTokenCredits(mockUser, 50, 'test');
      expect(creditTokenRepository.handleCreditUsage).toHaveBeenCalledWith(
        'test-id',
        50,
        'test'
      );
    });

    it('should throw error when not enough credits', async () => {
      const userWithLowCredits = {
        ...mockUser,
        accumulatedUsageCredits: 90,
        maxUsageCredits: 100,
      };

      await expect(
        tokenCreditService.handleTokenCredits(userWithLowCredits, 20, 'test')
      ).rejects.toThrow('Not enough tokens to call endpoint for id: test-id');
    });

    it('should allow unlimited usage when usageLimited is false', async () => {
      const unlimitedUser = {
        ...mockUser,
        usageLimited: false,
        accumulatedUsageCredits: 1000,
        maxUsageCredits: 100,
      };

      await tokenCreditService.handleTokenCredits(unlimitedUser, 50, 'test');
      expect(creditTokenRepository.handleCreditUsage).toHaveBeenCalledWith(
        'test-id',
        50,
        'test'
      );
    });

    it('should handle null maxUsageCredits', async () => {
      const userWithNullMax = {
        ...mockUser,
        maxUsageCredits: null,
      };

      await expect(
        tokenCreditService.handleTokenCredits(userWithNullMax, 50, 'test')
      ).rejects.toThrow('Not enough tokens to call endpoint for id: test-id');
    });
  });
});
