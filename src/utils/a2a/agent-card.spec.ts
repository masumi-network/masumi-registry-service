import { agentCardSchema } from './agent-card';

const VERSION_COUNT = 512;
const MAX_MEMBERSHIP_CHECKS = VERSION_COUNT * 4;

function validCard() {
  const protocolVersions = Array.from(
    { length: VERSION_COUNT },
    (_, index) => `${index}.0`
  );
  return {
    name: 'Agent',
    description: 'Agent',
    version: '1',
    protocolVersions,
    supportedInterfaces: protocolVersions.map((protocolVersion) => ({
      url: 'https://agent.example/rpc',
      protocolBinding: 'JSONRPC',
      protocolVersion,
    })),
    capabilities: {},
    defaultInputModes: [],
    defaultOutputModes: [],
    skills: [
      {
        id: 'task',
        name: 'Task',
        description: 'Task',
        tags: [],
        inputModes: [],
        outputModes: [],
      },
    ],
  };
}

describe('Agent Card protocol membership', () => {
  it('bounds cross-field membership work linearly for a large valid card', () => {
    let membershipChecks = 0;
    const originalSome = Array.prototype.some;
    const originalIncludes = Array.prototype.includes;
    const someSpy = jest
      .spyOn(Array.prototype, 'some')
      .mockImplementation(function (
        this: Array<{ protocolVersion?: string }>,
        callback,
        thisArg
      ) {
        const isInterfaceList =
          this.length === VERSION_COUNT && this[0]?.protocolVersion === '0.0';
        return originalSome.call(this, (value, index, values) => {
          if (isInterfaceList) membershipChecks++;
          return callback.call(thisArg, value, index, values);
        });
      });
    const includesSpy = jest
      .spyOn(Array.prototype, 'includes')
      .mockImplementation(function (this: unknown[], value, fromIndex) {
        if (this.length === VERSION_COUNT && this[0] === '0.0') {
          for (let index = fromIndex ?? 0; index < this.length; index++) {
            membershipChecks++;
            if (this[index] === value) break;
          }
        }
        return originalIncludes.call(this, value, fromIndex);
      });
    const originalHas = Set.prototype.has;
    const hasSpy = jest
      .spyOn(Set.prototype, 'has')
      .mockImplementation(function (this: Set<unknown>, value) {
        if (typeof value === 'string' && /^[0-9]+\.0$/.test(value))
          membershipChecks++;
        return originalHas.call(this, value);
      });
    let parsed: ReturnType<typeof agentCardSchema.safeParse>;
    try {
      parsed = agentCardSchema.safeParse(validCard());
    } finally {
      someSpy.mockRestore();
      includesSpy.mockRestore();
      hasSpy.mockRestore();
    }
    expect(parsed.success).toBe(true);
    expect(membershipChecks).toBeGreaterThanOrEqual(VERSION_COUNT * 2);
    expect(membershipChecks).toBeLessThanOrEqual(MAX_MEMBERSHIP_CHECKS);
  });

  it('retains both mismatch issue paths', () => {
    const card = validCard();
    card.supportedInterfaces[0].protocolVersion = '999.0';
    const parsed = agentCardSchema.safeParse(card);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.map((issue) => issue.path)).toEqual([
        ['protocolVersions', 0],
        ['supportedInterfaces', 0, 'protocolVersion'],
      ]);
    }
  });
});
