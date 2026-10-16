'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'

export type ElementSize = {
  ref: RefObject<HTMLDivElement | null>
  width: number
  height: number
}

/**
 * Tracks an element's content-box size with a `ResizeObserver`, so a canvas can
 * be sized in real pixels. Returns `0` until the first measurement, which lets
 * callers skip rendering until the element has a real size.
 */
export function useElementSize(): ElementSize {
  const ref = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const element = ref.current
    if (element === null) {
      return
    }

    const measure = () => {
      const width = element.clientWidth
      const height = element.clientHeight
      setSize((current) =>
        current.width === width && current.height === height ? current : { width, height },
      )
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)

    return () => observer.disconnect()
  }, [])

  return { ref, width: size.width, height: size.height }
}
