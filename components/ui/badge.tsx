import { cn } from "@/lib/utils";
export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "green" | "blue" | "amber" | "red" | "neutral";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium",
        {
          green: "bg-emerald-50 text-emerald-700",
          blue: "bg-blue-50 text-blue-700",
          amber: "bg-amber-50 text-amber-700",
          red: "bg-red-50 text-red-700",
          neutral: "bg-slate-100 text-slate-600",
        }[tone],
      )}
    >
      {children}
    </span>
  );
}
