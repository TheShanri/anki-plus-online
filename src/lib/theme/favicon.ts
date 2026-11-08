// The browser-tab icon follows the theme: the same "A+" mark as the header (fill, ink and shape per theme).
const SHAPE: Record<string, string> = {
  "uvm-clinical": '<rect x="2" y="2" width="60" height="60" rx="13"/>',
  "dark-academia": '<circle cx="32" cy="32" r="30"/>',
  "synthwave-cortex": '<rect x="2" y="2" width="60" height="60" rx="8" transform="skewX(-8) translate(4 0)"/>',
};

export function applyThemeFavicon(theme: string): void {
  try {
    const css = getComputedStyle(document.documentElement);
    const fill = css.getPropertyValue("--accent-fill").trim() || "#154734";
    const ink = css.getPropertyValue("--accent-ink").trim() || "#ffffff";
    const ring = theme === "dark-academia" ? css.getPropertyValue("--gold").trim() : "";
    const shape = SHAPE[theme] ?? SHAPE["uvm-clinical"];
    const italic = theme === "dark-academia" ? ' font-style="italic"' : "";
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><g fill="${fill}"${ring ? ` stroke="${ring}" stroke-width="3"` : ""}>${shape}</g>` +
      `<text x="32" y="43" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="30"${italic} fill="${ink}">A+</text></svg>`;
    const href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"][data-theme-icon]');
    if (!link) {
      document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]').forEach((l) => l.remove());
      link = document.createElement("link");
      link.rel = "icon";
      link.type = "image/svg+xml";
      link.setAttribute("data-theme-icon", "");
      document.head.appendChild(link);
    }
    if (link.href !== href) link.href = href;
  } catch {
    /* the static icon stays */
  }
}
