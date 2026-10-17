import Link from "next/link";
export default function NotFound() {
  return (
    <main className="mx-auto max-w-lg px-8 py-24">
      <p className="text-xs text-primary">404</p>
      <h1 className="my-4 text-2xl font-semibold">
        This page isn’t in your workspace
      </h1>
      <Link className="text-sm text-primary" href="/">
        Return to my apps
      </Link>
    </main>
  );
}
