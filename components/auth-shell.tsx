import { Brand } from "./brand";
import Link from "next/link";
import { ShieldCheck, Check, ArrowUpRight } from "lucide-react";
export function AuthShell({
  children,
  name,
}: {
  children: React.ReactNode;
  name: string;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[46%_54%]">
      <aside className="grid-pattern relative hidden overflow-hidden bg-brand-ink px-14 py-11 text-white lg:flex lg:flex-col">
        <Brand dark name={name} />
        <div className="absolute -right-32 top-44 h-[540px] w-[540px] rounded-full border border-white/10">
          <div className="absolute inset-16 rounded-full border border-white/10" />
          <div className="absolute inset-32 rounded-full border border-white/10" />
        </div>
        <div className="relative my-auto max-w-[420px] py-24">
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[10px] tracking-[1.7px] text-primary-light">
            <span className="h-1.5 w-1.5 rounded-full bg-primary-light" />
            YOUR CONNECTED WORKSPACE
          </div>
          <h2 className="text-[46px] font-medium leading-[1.15] tracking-[-1.6px]">
            One account.
            <br />
            Every possibility.
          </h2>
          <p className="mt-6 max-w-[330px] text-sm leading-7 text-slate-400">
            All the tools your team needs, together in one secure place. Less
            signing in. More getting things done.
          </p>
          <div className="mt-12 space-y-4 text-xs text-slate-300">
            {[
              "One secure identity for all your apps",
              "The right access, right when you need it",
              "Built around your team's security",
            ].map((text) => (
              <div key={text} className="flex items-center gap-3">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-primary/20 text-primary-light">
                  <Check size={11} />
                </span>
                {text}
              </div>
            ))}
          </div>
        </div>
        <div className="relative flex items-center gap-2 text-[11px] text-slate-500">
          <ShieldCheck size={14} />
          Private company workspace<span className="ml-auto">{name}</span>
        </div>
      </aside>
      <div className="flex min-h-screen flex-col bg-white">
        <header className="flex items-center justify-between p-7 lg:justify-end lg:px-12">
          <div className="lg:hidden">
            <Brand name={name} />
          </div>
          <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
            Secure employee access
            <ArrowUpRight size={12} />
          </span>
        </header>
        <main className="flex flex-1 items-center justify-center px-7 py-16">
          {children}
        </main>
        <footer className="p-8 text-center text-[11px] text-muted-foreground">
          Protected with encrypted sessions and multi-factor authentication.
          <Link
            href="/docs"
            className="mt-3 block text-primary hover:underline"
          >
            Integration docs
          </Link>
        </footer>
      </div>
    </div>
  );
}
