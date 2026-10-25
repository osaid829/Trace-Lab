import { describe, expect, it } from 'vitest';
import { interpolate, redactUrl, sanitizeErrorMessage, sanitizeRequestForHistory } from './index';

describe('shared request utilities', () => {
  it('interpolates variables and reports missing values', () => {
    expect(interpolate('https://{{host}}/{{missing}}', { host: 'example.test' })).toEqual({
      value: 'https://example.test/{{missing}}',
      missing: ['missing']
    });
  });

  it('redacts sensitive URL values', () => {
    expect(redactUrl('https://example.test/?api_key=secret&safe=yes')).toContain('api_key=%5BREDACTED%5D');
    expect(redactUrl('https://example.test/?api_key=one&api_key=two')).toContain('api_key=%5BREDACTED%5D&api_key=%5BREDACTED%5D');
    expect(redactUrl('https://user:password@example.test/path')).toBe('https://example.test/path');
  });

  it('removes credentials from history request snapshots', () => {
    const request = {
      method: 'GET' as const,
      url: 'https://example.test',
      params: [],
      headers: [{ id: 'h', key: 'Authorization', value: 'Bearer secret', enabled: true }],
      auth: { type: 'bearer' as const, token: 'secret' },
      body: { type: 'none' as const },
      timeoutMs: 10_000
    };
    const sanitized = sanitizeRequestForHistory(request);
    expect(sanitized.auth).toEqual({ type: 'none' });
    expect(sanitized.headers[0]?.value).toBe('[REDACTED]');
  });

  it('does not leave bearer credentials in diagnostics', () => {
    expect(sanitizeErrorMessage('authorization: Bearer very-secret-token')).toBe('authorization=[REDACTED]');
    expect(sanitizeErrorMessage('request failed with token=very-secret')).toContain('token=[REDACTED]');
  });
});
