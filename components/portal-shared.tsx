"use client";
import { useEffect, useRef, useState } from "react";
import {
  BriefcaseBusiness,
  ChartNoAxesCombined,
  Layers3,
  Code2,
  BookOpen,
  Folder,
  Globe,
  Headphones,
  Search,
  Loader2,
  X,
  Inbox,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
export async function api<T = Record<string, unknown>>(
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Unable to complete request");
  return data;
}
export function useData<T>(path: string, version = 0) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api<T>(path)
      .then((data) => {
        if (active) {
          setData(data);
          setError("");
        }
      })
      .catch((error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, [path, version]);
  return { data, error };
}
export function AppIcon({
  icon,
  small = false,
}: {
  icon: string;
  small?: boolean;
}) {
  const icons = {
    briefcase: BriefcaseBusiness,
    chart: ChartNoAxesCombined,
    layers: Layers3,
    code: Code2,
    book: BookOpen,
    folder: Folder,
    globe: Globe,
    headphones: Headphones,
  };
  const Icon = icons[icon as keyof typeof icons] || Layers3;
  const colors = {
    briefcase: "bg-primary-soft text-primary",
    chart: "bg-violet-50 text-violet-600",
    layers: "bg-orange-50 text-orange-600",
    code: "bg-slate-100 text-slate-600",
    book: "bg-emerald-50 text-emerald-600",
    folder: "bg-amber-50 text-amber-600",
    globe: "bg-cyan-50 text-cyan-600",
    headphones: "bg-rose-50 text-rose-600",
  };
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-xl ${small ? "h-9 w-9" : "h-12 w-12"} ${colors[icon as keyof typeof colors] || colors.layers}`}
    >
      <Icon size={small ? 18 : 23} strokeWidth={1.7} />
    </span>
  );
}
export function SearchBox({
  value,
  onChange,
  placeholder = "Search...",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative w-full sm:max-w-[280px]">
      <Search
        size={15}
        className="absolute left-3 top-3 text-muted-foreground"
      />
      <Input
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 pl-9 text-xs"
      />
    </div>
  );
}
export function Empty({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center px-5 py-12 text-center">
      <span className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-muted">
        <Inbox size={21} className="text-muted-foreground" />
      </span>
      <h3 className="text-sm font-medium">{title}</h3>
      {description && (
        <p className="mt-2 max-w-sm text-xs leading-6 text-muted-foreground">
          {description}
        </p>
      )}
      {children}
    </div>
  );
}
export function Loading() {
  return (
    <div
      role="status"
      className="flex min-h-52 items-center justify-center gap-3 text-sm text-muted-foreground"
    >
      <Loader2 size={18} className="animate-spin" />
      Loading your workspace…
    </div>
  );
}
export function ErrorNotice({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="my-4 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-xs leading-6 text-red-700"
    >
      {message}
    </div>
  );
}
export function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`overflow-hidden rounded-xl border border-border bg-white ${className}`}
    >
      {children}
    </section>
  );
}
export function PageTitle({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="text-[27px] font-semibold tracking-[-.8px]">{title}</h1>
        <p className="mt-2 text-[13px] text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block space-y-2 text-xs font-medium">
      <span>{label}</span>
      {children}
      {hint && (
        <span className="block text-[11px] font-normal leading-5 text-muted-foreground">
          {hint}
        </span>
      )}
    </label>
  );
}
export function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: React.ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={close}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
      className="fixed m-auto w-[520px]"
    >
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <h2 className="text-base font-semibold">{title}</h2>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close dialog"
          onClick={close}
        >
          <X size={17} />
        </Button>
      </div>
      <div className="max-h-[75vh] overflow-y-auto p-6">{children}</div>
    </dialog>
  );
}
export function Pagination({
  page,
  total,
  setPage,
}: {
  page: number;
  total: number;
  setPage: (page: number) => void;
}) {
  return (
    <div className="flex items-center justify-between border-t border-border px-5 py-3 text-[11px] text-muted-foreground">
      <span>
        {total} result{total === 1 ? "" : "s"} · Page {page} of{" "}
        {Math.max(1, Math.ceil(total / 20))}
      </span>
      <div className="flex gap-1">
        <Button
          variant="ghost"
          size="icon"
          disabled={page === 1}
          onClick={() => setPage(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft size={15} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          disabled={page * 20 >= total}
          onClick={() => setPage(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight size={15} />
        </Button>
      </div>
    </div>
  );
}
export function DateText({ value }: { value: string }) {
  return (
    <time dateTime={value} title={new Date(value).toLocaleString()}>
      {new Date(value).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })}
    </time>
  );
}
