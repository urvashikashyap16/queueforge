import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

/** Accessible dialog built on the native <dialog> element (focus trap + Escape for free). */
export default function Modal({ open, title, onClose, children, width = 'max-w-xl' }) {
  const ref = useRef(null)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose() }}
      className={`w-[calc(100%-2rem)] ${width} rounded-lg border border-line bg-panel p-0 text-ink shadow-2xl backdrop:bg-ink/40`}
    >
      {open && (
        <div className="p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 className="text-xl font-semibold">{title}</h2>
            <button type="button" onClick={onClose} className="rounded p-1 text-steel hover:bg-sunk" aria-label="Close">
              <X size={18} />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  )
}
