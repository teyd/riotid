declare global {
  interface Window {
    umami?: { track: () => void }
  }
}

let timer: ReturnType<typeof setTimeout> | undefined

export const trackPageview = (): void => {
  clearTimeout(timer)
  timer = setTimeout(() => window.umami?.track(), 1000)
}
