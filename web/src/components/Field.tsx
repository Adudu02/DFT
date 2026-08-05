export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-3 text-xs">
      <span className="text-term-muted">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
