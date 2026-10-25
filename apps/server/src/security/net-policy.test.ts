import { describe, expect, it } from 'vitest';
import { classifyAddress, validateTarget } from './net-policy';

describe('network policy', () => {
  it('classifies blocked address families', () => {
    expect(classifyAddress('127.0.0.1')).toBe('loopback');
    expect(classifyAddress('10.0.0.1')).toBe('private');
    expect(classifyAddress('169.254.169.254')).toBe('metadata');
  });

  it('rejects unsupported schemes', async () => {
    await expect(validateTarget('file:///tmp/test', false)).rejects.toMatchObject({ code: 'UNSUPPORTED_PROTOCOL' });
  });

  it('rejects loopback by default', async () => {
    await expect(validateTarget('http://127.0.0.1:4310', false)).rejects.toMatchObject({ code: 'TARGET_BLOCKED' });
  });

  it('allows loopback only with explicit development opt-in', async () => {
    await expect(validateTarget('http://127.0.0.1:4310', true)).resolves.toMatchObject({ url: expect.any(URL) });
  });

  it('rejects a hostname when any resolved address is unsafe', async () => {
    const lookup = async () => [
      { address: '93.184.216.34', family: 4 as const },
      { address: '127.0.0.1', family: 4 as const }
    ];
    await expect(validateTarget('http://mixed.test', false, lookup)).rejects.toMatchObject({ code: 'TARGET_BLOCKED' });
  });
});
