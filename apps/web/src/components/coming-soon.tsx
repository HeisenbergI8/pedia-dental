/** Placeholder for a feature screen that hasn't been built yet. */
export function ComingSoon({ title, covers }: { title: string; covers: string[] }) {
  return (
    <section className="space-y-3">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-ink-muted">This screen isn&apos;t built yet. It will cover:</p>
      <ul className="list-disc space-y-1 pl-5">
        {covers.map((c) => <li key={c}>{c}</li>)}
      </ul>
    </section>
  );
}
