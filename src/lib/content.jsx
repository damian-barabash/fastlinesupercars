// CMS content store: defaults -> live override from Supabase; edit mode for admin
import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { DEFAULTS } from '../data/defaults.js'
import { rest } from './api.js'

const Ctx = createContext({ c: DEFAULTS, editing: false, setKey: () => {}, onUpload: null })

let cache = null

export function ContentProvider({ children, editing = false, onDirty, onUpload = null }) {
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

  return <Ctx.Provider value={{ c, editing, setKey, onUpload }}>{children}</Ctx.Provider>
}

export function useContent() { return useContext(Ctx) }

// Editable image: same DOM as <img>, so page CSS keeps working.
// In edit mode: click the photo -> file picker -> upload -> preview + dirty key.
export function Img({ k, alt = '', className, style, ...rest }) {
  const { c, editing, setKey, onUpload } = useContext(Ctx)
  const src = c[k] || ''
  if (!editing || !onUpload) return <img src={src} alt={alt} className={className} style={style} {...rest} />
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={{ ...style, outline: '2px dashed rgba(225,6,0,.7)', outlineOffset: -2, cursor: 'pointer' }}
      title="Kliknij, aby zmienić zdjęcie"
      data-edit-img={k}
      onClick={(e) => {
        e.preventDefault(); e.stopPropagation()
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = 'image/*'
        input.onchange = async () => {
          const f = input.files?.[0]
          if (!f) return
          try {
            const url = await onUpload(f)
            setKey(k, url)
          } catch (err) { alert('Błąd wgrywania: ' + err.message) }
        }
        input.click()
      }}
      {...rest}
    />
  )
}

// Editable text node. In edit mode renders contenteditable.
export function T({ k, as: Tag = 'span', className, style }) {
  const { c, editing, setKey } = useContent()
  const text = c[k] ?? ''
  if (!editing) return <Tag className={className} style={style}>{text}</Tag>
  return (
    <Tag
      className={className}
      style={{ ...style, outline: '1.5px dashed rgba(225,6,0,.6)', outlineOffset: 3, cursor: 'text', minWidth: 10 }}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      data-edit={k}
      onBlur={(e) => setKey(k, e.currentTarget.textContent)}
    >{text}</Tag>
  )
}
