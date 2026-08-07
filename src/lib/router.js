import { useEffect, useState } from 'react'

/**
 * Hash routing, hand-rolled — the app has nine destinations and no need for a
 * router dependency. Keeping URLs real means the browser's back button, the
 * "← Overview" links and the design's own #custody anchor all behave.
 */
export const navigate = (to) => {
  window.location.hash = to
}

export const parse = (hash) => {
  const [path, query = ''] = hash.replace(/^#/, '').split('?')
  const segments = path.split('/').filter(Boolean)
  return { segments, params: new URLSearchParams(query) }
}

export const useRoute = () => {
  const read = () => window.location.hash.replace(/^#/, '') || '/'
  const [hash, setHash] = useState(read)

  useEffect(() => {
    const onChange = () => {
      setHash(read())
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  return { hash, ...parse(hash) }
}
