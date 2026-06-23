import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { InvoiceRepository } from '../repositories/InvoiceRepository';

// GET /api/invoices/{id}
export async function getInvoice(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  const id = req.params.id;
  const invoice = await InvoiceRepository.findById(id);
  if (!invoice) return { status: 404, jsonBody: { error: 'invoice not found', id } };
  return { jsonBody: invoice };
}

app.http('getInvoice', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'invoices/{id}',
  handler: getInvoice,
});
