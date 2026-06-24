import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { InvoiceActionsService, ActionError } from '../services/InvoiceActionsService';

async function readJson(req: HttpRequest): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

// POST /api/invoices/{id}/move-status   body: { targetStatus, reason?, actor? }
// Thin wrapper (§17): parse request -> service -> map ActionError to status.
export async function moveStatus(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  const body = await readJson(req);
  const targetStatus = typeof body.targetStatus === 'string' ? body.targetStatus : '';
  const reason = typeof body.reason === 'string' ? body.reason : undefined;
  const actor = typeof body.actor === 'string' ? body.actor : undefined;
  try {
    const updated = await InvoiceActionsService.moveStatus(req.params.id, targetStatus, { reason, actor });
    return { jsonBody: updated };
  } catch (err) {
    if (err instanceof ActionError) {
      return { status: err.status, jsonBody: { error: err.message, id: req.params.id } };
    }
    throw err;
  }
}

app.http('moveStatus', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'invoices/{id}/move-status',
  handler: moveStatus,
});
