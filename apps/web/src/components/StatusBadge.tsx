// Czech label + colour per business status. Conservative statuses (to-control) read warm,
// approved/exported read cool — so a glance over the list shows what needs a human.
const STATUS_META: Record<string, { label: string; color: string }> = {
  K_ODSOUHLASENI: { label: 'K odsouhlasení', color: '#1f7a3d' },
  DOPLNIT_PRAVIDLO: { label: 'Doplnit pravidlo', color: '#b26a00' },
  NEPRECTENO_NEUPLNE: { label: 'Nepřečteno / neúplné', color: '#b00020' },
  DUPLICITA: { label: 'Duplicita', color: '#5f6368' },
  SCHVALENO: { label: 'Schváleno', color: '#1565c0' },
  EXPORTOVANO: { label: 'Exportováno', color: '#6a1b9a' },
};

export function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, color: '#5f6368' };
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 600,
        color: '#fff',
        backgroundColor: meta.color,
        whiteSpace: 'nowrap',
      }}
    >
      {meta.label}
    </span>
  );
}
