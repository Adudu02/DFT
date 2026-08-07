export function Panel({ title, children, className = "" }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 bg-term-panel border border-term-border rounded p-4 ${className}`}>
      {title && <div className="text-term-muted text-xs uppercase tracking-widest mb-2">{title}</div>}
      {children}
    </div>
  );
}
