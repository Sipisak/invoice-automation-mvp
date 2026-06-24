import { useCallback, useEffect, useRef, useState } from 'react';
import { listInvoices, uploadInvoice, type InvoiceDto } from './client/invoicesClient';
import { InvoiceList } from './components/InvoiceList';
import { InvoiceDetail } from './components/InvoiceDetail';
import { ApprovalBar } from './components/ApprovalBar';

const POLL_MS = 5000; // invoices arrive via the timer trigger, so the list must self-refresh (§13.6)
const ACTOR = 'demo-user'; // MVP has no auth (§14); a real actor comes from SSO in production

export function App() {
  const [invoices, setInvoices] = useState<InvoiceDto[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      setInvoices(await listInvoices(statusFilter || undefined));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [statusFilter]);

  // Poll while mounted; re-arms whenever the filter changes.
  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  const selected = invoices.find((i) => i.id === selectedId) ?? null;

  async function onUpload(file: File) {
    setError(null);
    try {
      await uploadInvoice(file);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    if (fileInput.current) fileInput.current.value = '';
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', color: '#222', maxWidth: 1100, margin: '0 auto', padding: 16 }}>
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Kontrola faktur</h1>
        <span style={{ fontSize: 12, color: '#888' }}>CFIG · MVP</span>
        <label style={{ marginLeft: 'auto', fontSize: 13 }}>
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf"
            style={{ display: 'none' }}
            onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
          />
          <button onClick={() => fileInput.current?.click()} style={{ padding: '6px 12px', borderRadius: 4, cursor: 'pointer' }}>
            Nahrát fakturu
          </button>
        </label>
      </header>

      {error && (
        <div style={{ background: '#b0002011', borderLeft: '4px solid #b00020', padding: '8px 12px', fontSize: 13, marginBottom: 12 }}>
          Chyba API: {error}. Běží backend na <code>localhost:7071</code>?
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: 24, alignItems: 'start' }}>
        <InvoiceList
          invoices={invoices}
          selectedId={selectedId}
          statusFilter={statusFilter}
          onSelect={setSelectedId}
          onFilterChange={setStatusFilter}
        />

        <div style={{ border: '1px solid #eee', borderRadius: 6, padding: 16, minHeight: 200 }}>
          {selected ? (
            <>
              <InvoiceDetail invoice={selected} />
              <ApprovalBar invoice={selected} actor={ACTOR} onChanged={refresh} />
            </>
          ) : (
            <div style={{ color: '#888', fontSize: 14 }}>Vyber fakturu vlevo.</div>
          )}
        </div>
      </div>
    </div>
  );
}
