export function Panel({ title, children, className = "" }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`card2 fade-in min-w-0 p-6 ${className}`}>
      {title && <h2 className="kicker mb-3">{title}</h2>}
      {children}
    </div>
  );
}
