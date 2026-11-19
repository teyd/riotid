const legacyCopy = (text: string): boolean => {
  if (typeof document === 'undefined') return false

  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'

  try {
    document.body.append(area)
    area.select()
    return document.execCommand('copy')
  } finally {
    area.remove()
  }
}

export const copyText = async (text: string): Promise<boolean> => {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      return legacyCopy(text)
    } catch {
      return false
    }
  }
}
