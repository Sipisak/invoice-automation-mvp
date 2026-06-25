import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { ControlExcelExportService } from '../services/ControlExcelExportService';

// POST /api/exports/control-excel -> writes the 3-sheet control workbook to data/output/.
export async function exportControlExcel(
  _req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  const result = await ControlExcelExportService.generate();
  return { jsonBody: result };
}

app.http('exportControlExcel', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'exports/control-excel',
  handler: exportControlExcel,
});
