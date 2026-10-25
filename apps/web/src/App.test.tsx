import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

const emptyBootstrap = {
  collections: [],
  environments: [{ id: '11111111-1111-4111-8111-111111111111', name: 'Local', isLocal: true, variables: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
  history: []
};

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

describe('TraceLab workbench', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the honest empty response state after boot', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/api/csrf')) return jsonResponse({ token: 'test-token' });
      if (String(input).endsWith('/api/bootstrap')) return jsonResponse(emptyBootstrap);
      return jsonResponse({ error: { message: 'not found' } }, 404);
    }));
    render(<App />);
    expect(await screen.findByText('Run a request to inspect the result')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /new request/i })).toBeInTheDocument();
  });

  it('shows a real execution response and loading transition', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith('/api/csrf')) return jsonResponse({ token: 'test-token' });
      if (path.endsWith('/api/bootstrap')) return jsonResponse(emptyBootstrap);
      if (path.endsWith('/api/execute')) return jsonResponse({
        response: { statusCode: 200, statusText: 'OK', headers: [{ name: 'content-type', value: 'application/json' }], body: '{"ok":true}', bodyBase64: null, contentType: 'application/json', isBinary: false, responseBytes: 11, durationMs: 12, finalUrl: 'https://example.test', redirectCount: 0, truncated: false },
        error: null,
        history: { id: '22222222-2222-4222-8222-222222222222', requestId: null, executedAt: '2026-01-01T00:00:00.000Z', method: 'GET', url: 'https://example.test', statusCode: 200, statusText: 'OK', durationMs: 12, responseBytes: 11, outcome: 'success', errorSummary: null, requestSnapshot: null }
      });
      return jsonResponse({ error: { message: 'not found' } }, 404);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    const url = await screen.findByRole('textbox', { name: 'Request URL' });
    fireEvent.change(url, { target: { value: 'https://example.test' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));
    await waitFor(() => expect(screen.getByText('Captured from the local execution service')).toBeInTheDocument());
    expect(screen.getByText('200')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/execute', expect.objectContaining({ method: 'POST' }));
  });
});
