// CMS content store: defaults -> live override from Supabase; edit mode for admin
import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { DEFAULTS } from '../data/defaults.js'
import { rest } from './api.js'

const Ctx = createContext({ c: DEFAULTS, editing: false, setKey: () => {} })

let cache = null

export function ContentProvider({ children, editing = false, onDirty }) {
  const [c, setC] = useState(() => cache || DEFAULTS)

  useEffect(() => {
    if (cache) return
    rest('site_content?select=key,value')
      .then((rows) => {
        const over = {}
        for (const r of rows) over[r.key] = r.value
        cache = { ...DEFAULTS, ...over }
        setC(cache)
      })
      .catch(() => {})
  }, [])

  const setKey = useCallback((key, value) => {
    setC((prev) => {
      const next = { ...prev, [key]: value }
      cache = next
      return next
    })
    onDirty?.(key, value)
  }, [onDirty])

  return <Ctx.Provider value={{ c, editing, setKey }}>{children}</Ctx.Provider>
}

export function useContent() { return useContext(Ctx) }

// Editable text node. In edit mode renders contenteditable.
export function T({ k, as: Tag = 'span', className, style }) {
  const { c, editing, setKey } = useContent()
  const text = c[k] ?? ''
  if (!editing) return <Tag className={className} style={style}>{text}</Tag>
  return (
    <Tag
      className={className}
      style={{ ...style, outline: '1px dashed rgba(200,16,46,.55), ', outlineOffset: 2, cursor: 'text', minWidth: 10 }}
      contentEditable
      suppressContentEditableWarning
      data-edit={k}
      onBlur={(e) => setKey(k, e.currentTarget.textContent)}
    >{text}</Tag>
  )
}
