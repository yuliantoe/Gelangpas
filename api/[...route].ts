import type { IncomingMessage, ServerResponse } from 'node:http';
import { createGelangPassApp } from '../src/server/app.ts';

const { app } = createGelangPassApp();

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return app(req as Parameters<typeof app>[0], res as Parameters<typeof app>[1]);
}
