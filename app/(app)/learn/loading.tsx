import { Skeleton, SkeletonCard, SkeletonPage } from '@/components/Skeleton'

// The dashboard is force-dynamic and fans out to five Mongo queries, so there's
// a real gap before first paint. This mirrors its layout: greeting, goal card,
// stat row, practice shortcuts, deck grid.
export default function LearnLoading() {
  return (
    <SkeletonPage label="Loading your dashboard">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <Skeleton className="h-3 w-20 mb-3" />
        <Skeleton className="h-11 w-72 max-w-full mb-8" />

        <div className="border-[2.5px] border-line rounded-[24px] p-6 mb-8 flex flex-col sm:flex-row items-center gap-6">
          <Skeleton className="w-[132px] h-[132px] rounded-full shrink-0" />
          <div className="flex-1 w-full">
            <Skeleton className="h-6 w-48 mb-3" />
            <Skeleton className="h-3 w-full max-w-md mb-5" />
            <Skeleton className="h-11 w-44" />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="border-[2.5px] border-line rounded-[24px] p-4">
              <Skeleton className="h-3 w-16 mb-3" />
              <Skeleton className="h-8 w-12" />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
          {Array.from({ length: 4 }, (_, i) => <SkeletonCard key={i} />)}
        </div>

        <Skeleton className="h-3 w-32 mb-3" />
        <Skeleton className="h-6 w-full mb-10" />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: 4 }, (_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    </SkeletonPage>
  )
}
