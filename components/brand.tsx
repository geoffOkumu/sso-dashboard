import Image from "next/image";
export function Brand({
  name = "Permit Kit",
  dark = false,
}: {
  name?: string;
  dark?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 font-semibold tracking-tight ${dark ? "text-white" : "text-brand-ink"}`}
    >
      <Image
        src="/brand/mark.png"
        alt=""
        width={40}
        height={40}
        className="h-10 w-10 shrink-0"
      />
      <span className="text-xl font-bold tracking-[-0.7px]">{name}</span>
    </div>
  );
}
