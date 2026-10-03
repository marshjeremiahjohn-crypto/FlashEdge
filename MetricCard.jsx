import { ArrowUpRight, Activity } from "lucide-react";

export function MetricCard({ label, value, detail, tone = "neutral", testId }) {
  let toneClass = "text-white";
  if (tone === "profit") {
    toneClass = "text-[#00FF66]";
  } else if (tone === "danger") {
    toneClass = "text-[#FF3B30]";
  }

  return (
    <section data-testid={testId} className="border border-[#2A2A2A] bg-[#121212] p-4 transition-[transform,border-color] duration-200 hover:-translate-y-1 hover:border-[#007AFF]">
      <div className="flex items-center justify-between gap-3">
        <p data-testid={`${testId}-label`} className="text-xs uppercase tracking-[0.2em] text-zinc-500">{label}</p>
        {tone === "profit" ? <ArrowUpRight data-testid={`${testId}-icon`} className="h-4 w-4 text-[#00FF66]" /> : <Activity data-testid={`${testId}-icon`} className="h-4 w-4 text-[#007AFF]" />}
      </div>
      <p data-testid={`${testId}-value`} className={`mt-3 font-mono text-2xl font-semibold ${toneClass}`}>{value}</p>
      <p data-testid={`${testId}-detail`} className="mt-1 text-sm text-zinc-400">{detail}</p>
    </section>
  );
}