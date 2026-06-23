import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { InvoiceRepository } from '../repositories/InvoiceRepository';

// GET /api/invoices?status=K_ODSOUHLASENI
export async function getInvoices(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  const status = req.query.get('status') ?? undefined;
  const invoices = await InvoiceRepository.list(status);
  return { jsonBody: invoices };
}

app.http('getInvoices', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'invoices',
  handler: getInvoices,
});
