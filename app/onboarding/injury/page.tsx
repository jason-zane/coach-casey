import { InjuryForm } from "./_injury-form";

export default function InjuryPage() {
  return (
    <div className="space-y-10">
      <header className="space-y-4">
        <p className="font-mono text-xs uppercase tracking-wider text-ink-subtle">
          One more thing
        </p>
        <h1 className="font-serif text-3xl leading-tight text-ink md:text-4xl">
          Anything physical I should know about?
        </h1>
        <p className="prose-serif text-ink-muted max-w-prose">
          A niggle, an old injury, something you&rsquo;re managing. Anything
          that shapes how you&rsquo;re running right now. You know your body
          better than I do, this is just context.
        </p>
      </header>

      <InjuryForm />
    </div>
  );
}
