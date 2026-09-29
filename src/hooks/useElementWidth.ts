import { useEffect, useRef, useState } from 'react'

/** Track an element's width, so canvases can be sized to their container. */
export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const observer = new ResizeObserver(() => setWidth(element.clientWidth))
    observer.observe(element)
    setWidth(element.clientWidth)

    return () => observer.disconnect()
  }, [])

  return { ref, width }
}
