"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto max-w-lg px-8 py-24">
      <h1 className="text-2xl font-semibold">
        Workspace temporarily unavailable
      </h1>
      <p className="my-5 text-sm leading-7 text-muted-foreground">
        We couldn’t load your workspace. Please try again. If this continues,
        contact your administrator.
      </p>
      <button
        onClick={reset}
        className="rounded-md bg-primary px-4 py-2 text-sm text-white"
      >
        Try again
      </button>
    </main>
  );
}
