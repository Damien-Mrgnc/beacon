function scoreColor(score: number): string {
  if (score >= 0.75) return '#22c55e'
  if (score >= 0.50) return '#f59e0b'
  return '#ef4444'
}

export function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  const color = scoreColor(score)

  return (
    <div className="flex items-center gap-3 w-full">
      <div className="flex-1 h-1 bg-border rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span
        className="text-xs font-mono tabular-nums w-10 text-right shrink-0"
        style={{ color }}
      >
        {score.toFixed(2)}
      </span>
    </div>
  )
}
