export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: asociación implícita válida — children contiene el control
    <label className="block mb-3 text-xs">
      <span className="text-term-muted">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
