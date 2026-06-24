// API client for the Functions backend. Local dev: API_BASE = '/api' and Vite proxies it to
// http://localhost:7071 (no CORS). Production: set VITE_API_BASE to the deployed API URL.

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api';

export interface InvoiceDto {
  id: string;
  fileName: string;
  businessStatus: string;
  technicalStatus: string;
  ruleMatched: boolean;
  ruleId: string | null;
  routingToPohoda: boolean;
  routingToIntranet: boolean;
  isHardDuplicate: boolean;
  missingFields: string | null; // JSON array; parse on the client (drives the "co chybí" hint)
  warnings: string | null; // JSON array
  extractedData: string | null; // JSON (ExtractedInvoiceData); parse on the client
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
}

async function asJson<T>(res: Response, label: string): Promise<T> {
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.json())?.error ?? '';
    } catch {
      /* no body */
    }
    throw new Error(`${label} ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  return res.json() as Promise<T>;
}

export async function listInvoices(status?: string): Promise<InvoiceDto[]> {
  const url = status ? `${API_BASE}/invoices?status=${encodeURIComponent(status)}` : `${API_BASE}/invoices`;
  return asJson(await fetch(url), 'listInvoices');
}

export async function getInvoice(id: string): Promise<InvoiceDto> {
  return asJson(await fetch(`${API_BASE}/invoices/${id}`), 'getInvoice');
}

export async function approveInvoice(id: string, actor: string): Promise<InvoiceDto> {
  const res = await fetch(`${API_BASE}/invoices/${id}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actor }),
  });
  return asJson(res, 'approveInvoice');
}

// Manual status move (ApprovalBar "Přesunout stav" / "Duplicita"). reason lands in the AuditLog.
export async function moveStatus(
  id: string,
  targetStatus: string,
  reason?: string,
  actor?: string,
): Promise<InvoiceDto> {
  const res = await fetch(`${API_BASE}/invoices/${id}/move-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetStatus, reason, actor }),
  });
  return asJson(res, 'moveStatus');
}

// Manual upload -> pipeline (handy for the demo; the timer also picks up data/input/).
export async function uploadInvoice(file: File): Promise<{ id: string; businessStatus: string }> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE}/invoices/upload`, { method: 'POST', body: form });
  return asJson(res, 'uploadInvoice');
}
