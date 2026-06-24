import type { ReactNode } from 'react';
import type { InvoiceDto } from '../client/invoicesClient';
import { parseExtracted, parseStringArray, type ExtractedValue } from '../types';
import { StatusBadge } from './StatusBadge';

// Field order matches what an accountant scans top-down (§5/§6). Each row shows the normalized
// value + an honest confidence bar so a low-confidence read is visible, not hidden (§18).
const FIELDS: { key: keyof ReturnType<typeof parseExtracted>; label: string }[] = [
  { key: 'ourCompany', label: 'Naše firma' },
  { key: 'supplier', label: 'Dodavatel' },
  { key: 'supplierIco', label: 'IČO dodavatele' },
  { key: 'invoiceNumber', label: 'Číslo faktury' },
  { key: 'variableSymbol', label: 'Variabilní symbol' },
  { key: 'issueDate', label: 'Datum vystavení' },
  { key: 'dueDate', label: 'Datum splatnosti' },
  { key: 'taxDate', label: 'DUZP' },
  { key: 'totalAmount', label: 'Částka celkem' },
  { key: 'currency', label: 'Měna' },
  { key: 'iban', label: 'IBAN' },
  { key: 'bankAccount', label: 'Účet' },
  { key: 'bankCode', label: 'Kód banky' },
];

function ConfidenceBar({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const color = confidence >= 0.7 ? '#1f7a3d' : confidence >= 0.5 ? '#b26a00' : '#b00020';
  return (
    <span title={`confidence ${pct} %`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 60, height: 6, background: '#eee', borderRadius: 3, overflow: 'hidden' }}>
        <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: color }} />
      </span>
      <span style={{ fontSize: 11, color: '#999' }}>{pct} %</span>
    </span>
  );
}

export function InvoiceDetail({ invoice }: { invoice: InvoiceDto }) {
  const data = parseExtracted(invoice.extractedData);
  const missing = parseStringArray(invoice.missingFields);
  const warnings = parseStringArray(invoice.warnings);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>{invoice.fileName}</h2>
        <StatusBadge status={invoice.businessStatus} />
      </div>
      <div style={{ fontSize: 12, color: '#777', marginBottom: 12 }}>
        technický stav: {invoice.technicalStatus}
        {invoice.approvedBy && ` · schválil: ${invoice.approvedBy}`}
      </div>

      {missing.length > 0 && (
        <Banner color="#b00020" title="Chybí / nečitelné">
          {missing.join(', ')}
        </Banner>
      )}
      {warnings.length > 0 && (
        <Banner color="#b26a00" title="Upozornění">
          {warnings.join(' · ')}
        </Banner>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 8 }}>
        <tbody>
          {FIELDS.map(({ key, label }) => {
            const v = data[key] as ExtractedValue<string | number> | undefined;
            if (!v) return null;
            return (
              <tr key={key} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ padding: '4px 8px', color: '#666', width: 150 }}>{label}</td>
                <td style={{ padding: '4px 8px', fontWeight: 500 }}>
                  {v.normalizedValue ?? <em style={{ color: '#b00020' }}>nepřečteno ({v.rawValue})</em>}
                </td>
                <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                  <ConfidenceBar confidence={v.confidence} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div style={{ marginTop: 12, fontSize: 13 }}>
        <strong>Routing:</strong> Pohoda {invoice.routingToPohoda ? '✓' : '✗'} · Intranet{' '}
        {invoice.routingToIntranet ? '✓' : '✗'}
        {invoice.ruleMatched && invoice.ruleId && (
          <span style={{ color: '#777' }}> · pravidlo: {invoice.ruleId}</span>
        )}
      </div>
    </div>
  );
}

function Banner({ color, title, children }: { color: string; title: string; children: ReactNode }) {
  return (
    <div style={{ borderLeft: `4px solid ${color}`, background: `${color}11`, padding: '6px 10px', margin: '6px 0', fontSize: 13 }}>
      <strong style={{ color }}>{title}:</strong> {children}
    </div>
  );
}
