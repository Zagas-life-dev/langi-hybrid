// The five Leitner boxes as bright tiles: box colour, word count, and an ink
// "N due" pill when anything in that box is waiting. Shared by Today and Progress.

export const BOX_META = [
  { box: 1, label: 'New + slip-ups', bg: 'bg-pink' },
  { box: 2, label: 'Starting to stick', bg: 'bg-orange' },
  { box: 3, label: 'Getting there', bg: 'bg-yellow' },
  { box: 4, label: 'Almost yours', bg: 'bg-lime' },
  { box: 5, label: 'Know it cold', bg: 'bg-sky' },
]

export default function BoxTiles({
  boxes,
  dueByBox,
}: {
  boxes: Record<number, number>
  dueByBox?: Record<number, number>
}) {
  return (
    <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
      {BOX_META.map(({ box, label, bg }) => {
        const due = dueByBox?.[box] || 0
        return (
          <li key={box}
            className={`${bg} fill-card rounded-[28px] p-5 flex flex-col gap-2.5 ${box === 5 ? 'col-span-2 sm:col-span-1' : ''}`}>
            <div className="flex items-center justify-between font-extrabold">
              Box {box}
              {due > 0 && <span className="rounded-full bg-[#1b1530] text-white text-xs font-bold px-2.5 py-0.5">{due} due</span>}
            </div>
            <span className="display text-[3.4rem] leading-none">{boxes[box] || 0}</span>
            <span className="text-sm font-semibold">{label}</span>
          </li>
        )
      })}
    </ul>
  )
}
