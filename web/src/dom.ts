type Child = Node | string | false | null | undefined

/** Creates an element; props are assigned as DOM properties, never as HTML. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { dataset?: Record<string, string> } = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const { dataset, ...rest } = props
  const node = Object.assign(document.createElement(tag), rest)
  if (dataset) Object.assign(node.dataset, dataset)
  node.append(...children.filter((c): c is Node | string => c !== false && c !== null && c !== undefined))
  return node
}

export function button(label: string, onClick: () => void, className = 'btn', title?: string): HTMLButtonElement {
  const b = el('button', { type: 'button', className, textContent: label })
  if (title) {
    b.title = title
    b.setAttribute('aria-label', title)
  }
  b.addEventListener('click', onClick)
  return b
}

/** Random id for a new app; crypto.randomUUID needs a secure context. */
export function newId(): string {
  if (typeof crypto.randomUUID === 'function' && window.isSecureContext) return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}
