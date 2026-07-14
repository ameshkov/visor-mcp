// Shared test support — mock provider. Knip excludes `src/test/**` from its
// analysis.

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface CapturedRequest {
  method: string;
  path: string;
  authorization: string | undefined;
  body: unknown;
}

type RouteEntry = {
  readonly status: number;
  readonly body?: unknown;
  readonly headers?: Record<string, string>;
  readonly delayMs?: number;
  readonly hangMs?: number;
  /**
   * Write the status/headers and the first half of the body, then hang
   * (without calling `res.end()`) for this many ms before destroying the
   * socket. Lets callers simulate a mid-body cancellation: the client
   * receives headers + a partial body, so `response.json()` blocks waiting
   * for the rest, and aborting the external signal during that window
   * exercises the body-read cancellation path.
   */
  readonly partialBodyMs?: number;
};

export interface MockProvider {
  readonly url: string;
  readonly requests: CapturedRequest[];
  readonly aborts: number;
  setResponse(status: number, body: unknown): void;
  setResponseSequence(responses: readonly RouteEntry[]): void;
  close(): Promise<void>;
}

const DEFAULT_BODY = {
  choices: [{ message: { content: 'mock analysis result' } }],
};

export function startMockProvider(initial?: {
  status?: number;
  body?: unknown;
}): Promise<MockProvider> {
  const requests: CapturedRequest[] = [];
  let staticStatus = initial?.status ?? 200;
  let staticBody: unknown = initial && 'body' in initial ? initial.body : DEFAULT_BODY;
  let sequence: RouteEntry[] = [];
  let seqIndex = 0;
  let aborts = 0;

  const server: Server = createServer((req, res) => {
    // Track client-abort: if req closes before res.end()/res.destroy() has
    // been called, the client gave up (cancellation).
    req.on('close', () => {
      if (!res.writableEnded) aborts++;
    });
    let data = '';
    req.on('data', (chunk) => {
      data += chunk.toString('utf8');
    });
    req.on('end', async () => {
      let parsed: unknown = data;
      if (data.length > 0) {
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = data;
        }
      }
      requests.push({
        method: req.method ?? '',
        path: req.url ?? '',
        authorization: req.headers.authorization,
        body: parsed,
      });

      // Pick the current route entry from the sequence if populated,
      // otherwise fall back to the static response.
      let entry: RouteEntry;
      if (sequence.length > 0) {
        entry = sequence[Math.min(seqIndex, sequence.length - 1)];
        seqIndex++;
      } else {
        entry = { status: staticStatus, body: staticBody };
      }

      if (entry.hangMs !== undefined) {
        // Hang without responding — the client's timeout or cancel will
        // close the connection. Keep the socket open but do not write.
        await new Promise<void>((r) => setTimeout(r, entry.hangMs));
        res.destroy();
        return;
      }

      if (entry.partialBodyMs !== undefined) {
        // Send headers + the first half of the body, then hang without
        // ending the response. The client gets a partial body, so a
        // mid-read abort lands inside response.json() rather than fetch.
        res.writeHead(entry.status, entry.headers ?? { 'content-type': 'application/json' });
        const bodyStr = typeof entry.body === 'string' ? entry.body : JSON.stringify(entry.body);
        res.write(bodyStr.slice(0, Math.ceil(bodyStr.length / 2)));
        await new Promise<void>((r) => setTimeout(r, entry.partialBodyMs));
        res.destroy();
        return;
      }

      if (entry.delayMs !== undefined) {
        await new Promise<void>((r) => setTimeout(r, entry.delayMs));
      }

      const body = entry.body;
      res.writeHead(
        entry.status,
        entry.headers ?? {
          'content-type': 'application/json',
        },
      );
      res.end(typeof body === 'string' ? body : JSON.stringify(body));
    });
  });

  return new Promise<MockProvider>((resolveListen) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      resolveListen({
        url: `http://127.0.0.1:${addr.port}`,
        requests,
        get aborts() {
          return aborts;
        },
        setResponse(nextStatus: number, nextBody: unknown) {
          staticStatus = nextStatus;
          staticBody = nextBody;
        },
        setResponseSequence(responses: readonly RouteEntry[]) {
          sequence = [...responses];
          seqIndex = 0;
        },
        close: () =>
          new Promise<void>((r) => {
            server.close(() => r());
          }),
      });
    });
  });
}
