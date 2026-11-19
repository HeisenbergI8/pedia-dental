/** D15: the Plans page in a new tab, so a half-filled form or the Plan screen stays as it is. */
export function ComparePlansLink() {
  return (
    <a href="/plans" target="_blank" rel="noreferrer" className="font-semibold text-brand underline underline-offset-2">
      Compare plans<span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
