import type { IncomingMessage, ServerResponse } from 'node:http';
import { createGelangPassApp } from '../src/server/app.ts';

const { app } = createGelangPassApp();

export default function handler(req: IncomingMessage, res: ServerResponse) {
  const rawUrl = req.url || '/';
  try {
    const parsed = new URL(rawUrl, 'http://localhost');
    const gpPath = parsed.searchParams.get('__gp_path');
    if (gpPath) {
      parsed.searchParams.delete('__gp_path');
      const qs = parsed.searchParams.toString();
      const normalizedPath = gpPath.startsWith('/') ? gpPath : `/${gpPath}`;
      req.url = qs ? `${normalizedPath}?${qs}` : normalizedPath;
    }
  } catch {
    // Keep original req.url if URL parsing fails
  }

  return app(req as Parameters<typeof app>[0], res as Parameters<typeof app>[1]);
}
