import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { InvoiceActionsService, ActionError } from '../services/InvoiceActionsService';

async function readJson(req: HttpRequest): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

// POST /api/invoices/{id}/approve   body: { actor? }
// Thin wrapper (§17): parse request -> service -> map ActionError to status.
export async function approveInvoice(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  const body = await readJson(req);
  const actor = typeof body.actor === 'string' && body.actor.trim() ? body.actor : 'demo-user';
  try {
    return { jsonBody: await InvoiceActionsService.approve(req.params.id, actor) };
  } catch (err) {
    if (err instanceof ActionError) {
      return { status: err.status, jsonBody: { error: err.message, id: req.params.id } };
    }
    throw err;
  }
}

app.http('approveInvoice', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'invoices/{id}/approve',
  handler: approveInvoice,
});
