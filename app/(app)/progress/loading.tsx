import { Skeleton, SkeletonPage } from '@/components/Skeleton'

export default function ProgressLoading() {
  return (
    <SkeletonPage label="Loading your progress">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <Skeleton className="h-3 w-20 mb-3" />
        <Skeleton className="h-11 w-64 max-w-full mb-8" />

        <div className="border-[2.5px] border-line rounded-[24px] p-6 mb-8 flex items-center gap-4">
          <Skeleton className="h-14 w-14" />
          <div className="flex-1">
            <Skeleton className="h-4 w-28 mb-2" />
            <Skeleton className="h-3 w-40" />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="border-[2.5px] border-line rounded-[24px] p-4">
              <Skeleton className="h-3 w-16 mb-3" />
              <Skeleton className="h-8 w-12" />
            </div>
          ))}
        </div>

        <Skeleton className="h-3 w-52 mb-3" />
        <Skeleton className="h-6 w-full mb-10" />

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      </div>
    </SkeletonPage>
  )
}
