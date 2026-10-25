import { describe, expect, it } from 'vitest';
import { parseUrlParamsIfValid, serializeUrlParams, updateRequestParams } from './request';
import { emptyRequest } from './request';

describe('request URL helpers', () => {
  it('preserves repeated query parameters and disabled rows', () => {
    const params = parseUrlParamsIfValid('https://example.test/search?tag=one&tag=two&disabled=yes');
    expect(params).toHaveLength(3);
    expect(serializeUrlParams('https://example.test/search?old=value#results', params!.map((item, index) => ({ ...item, enabled: index !== 2 })))).toBe('https://example.test/search?tag=one&tag=two#results');
  });

  it('reports invalid URL input without destroying the draft', () => {
    expect(parseUrlParamsIfValid('https://example.test/%')).toBeInstanceOf(Array);
    expect(parseUrlParamsIfValid('not a URL')).toBeNull();
  });

  it('serializes parameter edits into the request definition', () => {
    const request = { ...emptyRequest(), url: 'https://example.test/items' };
    const next = updateRequestParams(request, [{ id: 'a', key: 'q', value: 'hello world', enabled: true }]);
    expect(next.url).toBe('https://example.test/items?q=hello+world');
    expect(next.params[0]?.value).toBe('hello world');
  });
});
