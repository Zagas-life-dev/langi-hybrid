import { Skeleton, SkeletonPage } from '@/components/Skeleton'

// Videos hits YouTube + several Mongo collections, so show the page's shape
// while it loads: title, a row of tab chips, then the thumbnail grid.
export default function VideosLoading() {
  return (
    <SkeletonPage label="Loading videos">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <Skeleton className="h-3 w-24 mb-2" />
        <Skeleton className="h-9 w-40 mb-5" />
        <div className="flex gap-2 overflow-hidden mb-6">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-24 shrink-0 rounded-full" />
          ))}
        </div>
        <div className="grid gap-x-5 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i}>
              <Skeleton className="aspect-video mb-3 rounded-[18px]" />
              <div className="flex gap-3">
                <Skeleton className="w-9 h-9 shrink-0 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-3.5 w-full mb-2" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </SkeletonPage>
  )
}
