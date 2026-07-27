import { useState, useEffect } from 'react'

export default function TypewriterText({ text, active }: { text: string; active: boolean }) {
  const [displayed, setDisplayed] = useState(() => active ? '' : text)
  useEffect(() => {
    if (!text || displayed.length >= text.length) return
    const t = setTimeout(() => setDisplayed(text.slice(0, displayed.length + 2)), 10)
    return () => clearTimeout(t)
  }, [text, displayed])
  if (!displayed) return active ? <span className="animate-pulse text-gray-400">▌</span> : null
  return <>{displayed}</>
}
