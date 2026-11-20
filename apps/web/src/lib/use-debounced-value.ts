import { useEffect, useState } from 'react'

export const useDebouncedValue = <A>(value: A, delayMs: number): A => {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
