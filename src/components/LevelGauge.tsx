type Props = {
  label: string;
  value: number;
  max: number;
  unit?: string;
  thresholds?: { warn: number; crit: number };
};

export function LevelGauge({
  label,
  value,
  max,
  unit = "cm",
  thresholds,
}: Props) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const isCrit = thresholds && value >= thresholds.crit;
  const isWarn = thresholds && !isCrit && value >= thresholds.warn;
  const barColor = isCrit
    ? "var(--color-destructive)"
    : isWarn
      ? "var(--color-warning)"
      : "var(--color-success)";

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
          {label}
        </span>
        <span className="text-2xl font-mono font-bold text-foreground">
          {value.toFixed(1)}
          <span className="text-sm text-muted-foreground ml-1">{unit}</span>
        </span>
      </div>
      <div className="h-3 w-full rounded-full bg-secondary overflow-hidden">
        <div
          className="h-full transition-all duration-500 ease-out rounded-full"
          style={{ width: `${pct}%`, backgroundColor: barColor }}
        />
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-muted-foreground font-mono">
        <span>0</span>
        {thresholds && (
          <>
            <span style={{ color: "var(--color-warning)" }}>
              ⚠ {thresholds.warn}
            </span>
            <span style={{ color: "var(--color-destructive)" }}>
              ⛔ {thresholds.crit}
            </span>
          </>
        )}
        <span>{max}</span>
      </div>
    </div>
  );
}
