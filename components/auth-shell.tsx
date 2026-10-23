import { Brand } from "./brand";

export function AuthShell({
  children,
  name,
}: {
  children: React.ReactNode;
  name: string;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-white px-6 py-10">
      <div className="w-full max-w-[360px]">
        <div className="mb-8 flex justify-center">
          <Brand name={name} />
        </div>
        {children}
      </div>
    </main>
  );
}
