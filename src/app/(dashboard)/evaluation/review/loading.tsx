export default function ReviewQueueLoading() {
  return (
    <div className="mx-auto max-w-4xl animate-pulse px-4 py-8">
      <div className="mb-2 h-8 w-48 rounded bg-slate-200" />
      <div className="mb-6 h-4 w-72 rounded bg-slate-100" />
      <div className="mb-6 grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border bg-white p-4">
            <div className="mb-2 h-3 w-24 rounded bg-slate-200" />
            <div className="h-8 w-12 rounded bg-slate-200" />
          </div>
        ))}
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="mb-6 h-48 rounded-lg border bg-white" />
      ))}
    </div>
  );
}
