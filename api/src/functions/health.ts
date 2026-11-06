import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

async function handler(_req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  return { status: 200, jsonBody: { ok: true } };
}

app.http('health', { methods: ['GET', 'HEAD'], authLevel: 'anonymous', route: 'health', handler });
