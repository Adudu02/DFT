export function Legend({ items }: { items: [string, string][] }) {
  return (
    <div className="flex gap-4 flex-wrap mt-3 text-xs text-term-muted">
      {items.map(([c, l]) => (
        <span key={l} className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full" style={{ background: c }} />
          {l}
        </span>
      ))}
    </div>
  );
}
