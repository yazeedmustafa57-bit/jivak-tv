import React from 'react'

// Minimaler, sicherer Text-Block-Renderer für Artikel-Inhalte.
// Unterstützt Absätze, "## "-Überschriften, "- "-Listen, "> "-Zitate und **Fett**.
// Ausgabe erfolgt als React-Elemente (kein dangerouslySetInnerHTML).

function inline(text) {
  return String(text).split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    return part
  })
}

export function headingId(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\u0600-\u06ff\u0640-\u065f -]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'abschnitt'
}

export function renderBody(body, options = {}) {
  const lines = String(body || '').split('\n')
  const blocks = []
  let i = 0
  while (i < lines.length) {
    const trimmed = lines[i].trim()
    if (!trimmed) {
      i += 1
      continue
    }
    if (trimmed.startsWith('# ') && !trimmed.startsWith('## ')) {
      blocks.push({ type: 'h2', text: trimmed.slice(2) })
    } else if (trimmed.startsWith('## ')) {
      blocks.push({ type: 'h', text: trimmed.slice(3) })
    } else if (trimmed.startsWith('> ')) {
      blocks.push({ type: 'quote', text: trimmed.slice(2) })
    } else if (/^[-*] /.test(trimmed)) {
      const items = []
      while (i < lines.length && /^[-*] /.test(lines[i].trim())) {
        items.push(lines[i].trim().slice(2))
        i += 1
      }
      blocks.push({ type: 'list', items })
      continue
    } else {
      blocks.push({ type: 'p', text: trimmed })
    }
    i += 1
  }

  return blocks.map((block, idx) => {
    switch (block.type) {
      case 'h2':
        return (
          <h2 key={idx} id={options.withIds ? headingId(block.text) : undefined}>
            {inline(block.text)}
          </h2>
        )
      case 'h':
        return (
          <h3 key={idx} id={options.withIds ? headingId(block.text) : undefined}>
            {inline(block.text)}
          </h3>
        )
      case 'quote':
        return <blockquote key={idx}>{inline(block.text)}</blockquote>
      case 'list':
        return (
          <ul key={idx}>
            {block.items.map((item, j) => (
              <li key={j}>{inline(item)}</li>
            ))}
          </ul>
        )
      default:
        return <p key={idx}>{inline(block.text)}</p>
    }
  })
}
