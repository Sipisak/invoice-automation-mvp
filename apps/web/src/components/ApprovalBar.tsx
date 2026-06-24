import { useState } from 'react';
import type { InvoiceDto } from '../client/invoicesClient';
import { approveInvoice, moveStatus } from '../client/invoicesClient';
import { BUSINESS_STATUSES } from '../types';

interface Props {
  invoice: InvoiceDto;
  actor: string;
  onChanged: () => void; // refresh after a successful action
}

export function ApprovalBar({ invoice, actor, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<string>('');

  const isApproved = invoice.businessStatus === 'SCHVALENO' || invoice.businessStatus === 'EXPORTOVANO';
  const canApprove = invoice.businessStatus === 'K_ODSOUHLASENI';

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ borderTop: '1px solid #ddd', marginTop: 16, paddingTop: 12 }}>
      {error && <div style={{ color: '#b00020', fontSize: 13, marginBottom: 8 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          disabled={busy || !canApprove}
          title={canApprove ? '' : 'Schválit lze jen fakturu ve stavu K odsouhlasení'}
          onClick={() => act(() => approveInvoice(invoice.id, actor))}
          style={{ background: '#1f7a3d', color: '#fff', border: 0, padding: '6px 14px', borderRadius: 4, cursor: canApprove ? 'pointer' : 'not-allowed' }}
        >
          Schválit
        </button>

        <button
          disabled={busy || invoice.businessStatus === 'DUPLICITA'}
          onClick={() => act(() => moveStatus(invoice.id, 'DUPLICITA', 'označeno ručně jako duplicita', actor))}
          style={{ background: '#5f6368', color: '#fff', border: 0, padding: '6px 14px', borderRadius: 4, cursor: 'pointer' }}
        >
          Duplicita
        </button>

        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <select value={target} onChange={(e) => setTarget(e.target.value)} disabled={busy}>
            <option value="">Přesunout stav…</option>
            {BUSINESS_STATUSES.filter((s) => s !== invoice.businessStatus).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            disabled={busy || !target}
            onClick={() => act(() => moveStatus(invoice.id, target, 'ruční přesun z UI', actor).then(() => setTarget('')))}
            style={{ padding: '6px 12px', borderRadius: 4, cursor: target ? 'pointer' : 'not-allowed' }}
          >
            Přesunout
          </button>
        </span>
      </div>

      {isApproved && (
        <div style={{ fontSize: 12, color: '#1565c0', marginTop: 8 }}>
          Faktura je {invoice.businessStatus === 'EXPORTOVANO' ? 'exportovaná' : 'schválená'}
          {invoice.approvedBy ? ` (${invoice.approvedBy})` : ''}.
        </div>
      )}
    </div>
  );
}
