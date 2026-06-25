import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { PohodaXmlExportService } from '../services/PohodaXmlExportService';

// POST /api/exports/pohoda-xml-preview -> one Pohoda dataPack per accounting unit for the
// export-eligible invoices (SCHVALENO + routingToPohoda). Preview only — does NOT mutate state.
export async function exportPohodaXml(
  _req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  const result = await PohodaXmlExportService.generate();
  return { jsonBody: result };
}

app.http('exportPohodaXml', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'exports/pohoda-xml-preview',
  handler: exportPohodaXml,
});
