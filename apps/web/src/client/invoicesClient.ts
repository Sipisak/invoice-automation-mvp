// Drop into the generated webpart under api/invoicesClient.ts.
// In production, use SPFx HttpClient instead of fetch (auth handling differs).

const API_BASE = 'http://localhost:7071/api';

export interface InvoiceDto {
  id: string;
  fileName: string;
  businessStatus: string;
  technicalStatus: string;
  ruleMatched: boolean;
  routingToPohoda: boolean;
  routingToIntranet: boolean;
  extractedData: string | null; // JSON; parse on the client
  createdAt: string;
}

export async function listInvoices(status?: string): Promise<InvoiceDto[]> {
  const url = status ? `${API_BASE}/invoices?status=${encodeURIComponent(status)}` : `${API_BASE}/invoices`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`listInvoices ${res.status}`);
  return res.json();
}

export async function getInvoice(id: string): Promise<InvoiceDto> {
  const res = await fetch(`${API_BASE}/invoices/${id}`);
  if (!res.ok) throw new Error(`getInvoice ${res.status}`);
  return res.json();
}

export async function approveInvoice(id: string, actor: string): Promise<void> {
  const res = await fetch(`${API_BASE}/invoices/${id}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actor }),
  });
  if (!res.ok) throw new Error(`approveInvoice ${res.status}`);
}
