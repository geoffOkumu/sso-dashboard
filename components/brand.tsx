import { Layers3 } from "lucide-react";
export function Brand({
  name = "Company Access",
  dark = false,
}: {
  name?: string;
  dark?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2.5 font-semibold tracking-tight ${dark ? "text-white" : "text-slate-900"}`}
    >
      <span
        className={`grid h-9 w-9 place-items-center rounded-lg ${dark ? "bg-white/15" : "bg-primary"}`}
      >
        <Layers3 size={20} strokeWidth={2} className="text-white" />
      </span>
      <span className="text-[15px]">{name}</span>
    </div>
  );
}
