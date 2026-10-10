export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs)
    for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "html") el.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function")
        el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
export const frag = (...kids) => {
  const f = document.createDocumentFragment();
  for (const k of kids.flat()) {
    if (k == null || k === false) continue;
    f.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
  return f;
};
export const icon = (name, cls) =>
  h("i", { class: "fi fi-rr-" + name + (cls ? " " + cls : "") });
