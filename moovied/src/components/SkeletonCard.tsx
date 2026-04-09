export default function SkeletonCard() {
  return (
    <div className="flex-shrink-0 w-36 sm:w-44">
      <div className="aspect-[2/3] bg-zinc-900 rounded-xl animate-pulse" />
    </div>
  );
}

export function SkeletonRow({ count = 6 }: { count?: number }) {
  return (
    <div className="mb-10">
      <div className="h-7 w-48 bg-zinc-900 rounded mb-4 mx-4 sm:mx-6 lg:mx-8 animate-pulse" />
      <div className="flex gap-3 px-4 sm:px-6 lg:px-8 overflow-hidden">
        {Array.from({ length: count }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
