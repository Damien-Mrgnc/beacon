export default function Loading() {
  return (
    <div className="px-10 py-10 max-w-5xl mx-auto animate-pulse">
      <div className="h-6 w-32 bg-surface rounded mb-2" />
      <div className="h-4 w-48 bg-surface rounded mb-10" />
      <div className="grid grid-cols-4 gap-4 mb-10">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-surface border border-border rounded-lg h-28" />
        ))}
      </div>
      <div className="bg-surface border border-border rounded-lg h-64" />
    </div>
  )
}
