// Shared test support — mock image server. Knip excludes `src/test/**` from
// its analysis.

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Buffer } from 'node:buffer';

export interface CapturedImageRequest {
  method: string;
  path: string;
  authorization: string | undefined;
  cookie: string | undefined;
}

export interface MockImageRoute {
  readonly status: number;
  readonly headers?: Record<string, string>;
  readonly body?: Uint8Array | string;
  readonly delayMs?: number;
  readonly hangMs?: number;
  /**
   * Write the status/headers and the first half of the body, then hang
   * (without calling `res.end()`) for this many ms before destroying the
   * socket. Lets callers simulate a mid-body read failure: the client
   * receives headers + a partial body, so the body reader throws on a
   * later `read()`, exercising the mid-stream read-error path in
   * `readBoundedBody` (distinct from `hangMs`, which hangs before any
   * body byte is written and so only exercises the fetch/cancel path).
   */
  readonly partialBodyMs?: number;
}

export interface MockImageServer {
  url: string;
  requests: CapturedImageRequest[];
  aborts: number;
  setRoute(path: string, route: MockImageRoute): void;
  setRouteSequence(path: string, routes: readonly MockImageRoute[]): void;
  close(): Promise<void>;
}

export function startMockImageServer(): Promise<MockImageServer> {
  const routes = new Map<string, MockImageRoute>();
  const sequences = new Map<string, { entries: MockImageRoute[]; index: number }>();
  const requests: CapturedImageRequest[] = [];
  let aborts = 0;
  const server: Server = createServer((req, res) => {
    // Track client-abort: if req closes before res.end()/res.destroy() has
    // been called, the client gave up (cancellation).
    req.on('close', () => {
      if (!res.writableEnded) aborts++;
    });
    let data = '';
    req.on('data', (chunk: Buffer) => {
      data += chunk.toString('utf8');
    });
    req.on('end', async () => {
      const url = req.url ?? '';
      const matchPath = url.split('?')[0];
      requests.push({
        method: req.method ?? '',
        path: url,
        authorization: req.headers.authorization,
        cookie: req.headers.cookie,
      });
      void data;

      // Pick from sequence first, then fall back to static route.
      let route: MockImageRoute | undefined;
      const seq = sequences.get(matchPath);
      if (seq) {
        route = seq.entries[Math.min(seq.index, seq.entries.length - 1)];
        seq.index++;
      } else {
        route = routes.get(matchPath);
      }

      if (route === undefined) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not found');
        return;
      }

      if (route.hangMs !== undefined) {
        await new Promise<void>((r) => setTimeout(r, route.hangMs!));
        res.destroy();
        return;
      }

      if (route.partialBodyMs !== undefined) {
        // Send headers + the first half of the body, then hang without
        // ending the response. The client gets a partial body, so a
        // mid-read error lands inside the body reader rather than fetch.
        res.writeHead(route.status, route.headers ?? {});
        if (route.body !== undefined) {
          const bodyBuf =
            typeof route.body === 'string' ? Buffer.from(route.body) : Buffer.from(route.body);
          res.write(bodyBuf.subarray(0, Math.ceil(bodyBuf.length / 2)));
        }
        await new Promise<void>((r) => setTimeout(r, route.partialBodyMs));
        res.destroy();
        return;
      }

      if (route.delayMs !== undefined) {
        await new Promise<void>((r) => setTimeout(r, route.delayMs!));
      }

      res.writeHead(route.status, route.headers ?? {});
      if (route.body === undefined) {
        res.end();
      } else if (typeof route.body === 'string') {
        res.end(route.body);
      } else {
        res.end(Buffer.from(route.body));
      }
    });
  });

  return new Promise<MockImageServer>((resolveListen) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      resolveListen({
        url: `http://127.0.0.1:${addr.port}`,
        requests,
        get aborts() {
          return aborts;
        },
        setRoute(path: string, route: MockImageRoute) {
          routes.set(path, route);
        },
        setRouteSequence(path: string, routeEntries: readonly MockImageRoute[]) {
          sequences.set(path, {
            entries: [...routeEntries],
            index: 0,
          });
        },
        close: () =>
          new Promise<void>((r) => {
            server.close(() => r());
          }),
      });
    });
  });
}
