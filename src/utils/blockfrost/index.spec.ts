import { $Enums } from '@prisma/client';
import { logger } from '@/utils/logger';
import { getBlockfrostInstance } from '@/utils/blockfrost';

jest.mock('@/utils/logger', () => ({ logger: { info: jest.fn() } }));

describe('getBlockfrostInstance', () => {
  it('never writes the provider API key to the logs', () => {
    const apiKey = 'preprodSecretProjectId123';

    getBlockfrostInstance($Enums.Network.Preprod, apiKey);

    expect(logger.info).toHaveBeenCalled();
    expect(JSON.stringify((logger.info as jest.Mock).mock.calls)).not.toContain(
      apiKey
    );
  });
});
