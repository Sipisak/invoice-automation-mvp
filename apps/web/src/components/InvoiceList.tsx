import type { InvoiceDto } from '../client/invoicesClient';
import { parseExtracted, BUSINESS_STATUSES } from '../types';
import { StatusBadge } from './StatusBadge';

interface Props {
  invoices: InvoiceDto[];
  selectedId: string | null;
  statusFilter: string;
  onSelect: (id: string) => void;
  onFilterChange: (status: string) => void;
}

function supplierOf(inv: InvoiceDto): string {
  return parseExtracted(inv.extractedData).supplier?.normalizedValue ?? '—';
}

function amountOf(inv: InvoiceDto): string {
  const d = parseExtracted(inv.extractedData);
  const amount = d.totalAmount?.normalizedValue;
  if (amount == null) return '—';
  const currency = d.currency?.normalizedValue ?? '';
  return `${amount.toLocaleString('cs-CZ')} ${currency}`.trim();
}

export function InvoiceList({ invoices, selectedId, statusFilter, onSelect, onFilterChange }: Props) {
  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <label style={{ fontSize: 13, marginRight: 6 }}>Stav:</label>
        <select value={statusFilter} onChange={(e) => onFilterChange(e.target.value)}>
          <option value="">Všechny</option>
          {BUSINESS_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
            <th style={{ padding: '6px 8px' }}>Dodavatel</th>
            <th style={{ padding: '6px 8px' }}>Částka</th>
            <th style={{ padding: '6px 8px' }}>Stav</th>
          </tr>
        </thead>
        <tbody>
          {invoices.length === 0 && (
            <tr>
              <td colSpan={3} style={{ padding: 16, color: '#888', textAlign: 'center' }}>
                Žádné faktury — přetáhni PDF do <code>data/input/</code> nebo nahraj výše.
              </td>
            </tr>
          )}
          {invoices.map((inv) => (
            <tr
              key={inv.id}
              onClick={() => onSelect(inv.id)}
              style={{
                cursor: 'pointer',
                borderBottom: '1px solid #eee',
                background: inv.id === selectedId ? '#eef4ff' : 'transparent',
              }}
            >
              <td style={{ padding: '6px 8px' }}>
                <div>{supplierOf(inv)}</div>
                <div style={{ fontSize: 11, color: '#999' }}>{inv.fileName}</div>
              </td>
              <td style={{ padding: '6px 8px' }}>{amountOf(inv)}</td>
              <td style={{ padding: '6px 8px' }}>
                <StatusBadge status={inv.businessStatus} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
