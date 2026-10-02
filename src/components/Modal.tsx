import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
// Native modal dialog provides background inertness, focus containment, Escape and focus restoration.
export default function Modal({ title, onClose, children, className = '' }: { title: string; onClose: () => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null), opener = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const dialog = ref.current!; opener.current = document.activeElement as HTMLElement
    dialog.showModal()
    return () => { dialog.close(); if (opener.current?.isConnected) opener.current.focus({ preventScroll: true }) }
  }, [])
  return <dialog ref={ref} className={`app-dialog ${className}`} aria-label={title} onCancel={(event) => { if (event.target !== event.currentTarget) return; event.preventDefault(); event.stopPropagation(); onClose() }} onKeyDown={(event) => event.stopPropagation()}>
    <div className="dialog-heading"><h2>{title}</h2><button className="panel-close" aria-label={`Close ${title}`} onClick={onClose}>×</button></div>{children}
  </dialog>
}
