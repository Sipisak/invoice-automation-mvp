import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

export async function health(
  _req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  return { jsonBody: { status: 'ok', time: new Date().toISOString() } };
}

app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler: health,
});
