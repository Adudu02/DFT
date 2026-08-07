export function Panel({ title, children, className = "" }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`card2 min-w-0 p-6 ${className}`}>
      {title && <div className="kicker mb-3">{title}</div>}
      {children}
    </div>
  );
}
