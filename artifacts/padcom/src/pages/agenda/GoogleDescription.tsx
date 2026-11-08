import { createElement, Fragment, useMemo, type ReactNode } from "react";

// O Google permite HTML em descrições. O template é inerte; somente texto e
// elementos de apresentação sem atributos são recriados em React.
function safeDescription(description: string): ReactNode {
  if (!/<\/?[a-z][^>]*>/i.test(description)) return description;
  const template = document.createElement("template");
  template.innerHTML = description;
  const allowed = new Set(["b", "strong", "i", "em", "br", "p", "div", "ul", "ol", "li", "span"]);
  const omitted = new Set(["script", "style", "iframe", "object", "embed", "svg", "math", "template", "img"]);
  function convert(node: Node, key: string): ReactNode {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    const tag = (node as Element).tagName.toLowerCase();
    if (omitted.has(tag)) return null;
    const children = Array.from(node.childNodes).map((child, i) => convert(child, `${key}-${i}`));
    return createElement(allowed.has(tag) ? tag : Fragment, { key }, ...children);
  }
  return Array.from(template.content.childNodes).map((node, i) => convert(node, String(i)));
}

export function GoogleDescription({ description }: { description: string }) {
  const content = useMemo(() => safeDescription(description), [description]);
  return <div className="bevel-3d p-3 max-h-72 overflow-auto whitespace-pre-wrap break-words text-sm leading-relaxed">{content}</div>;
}
