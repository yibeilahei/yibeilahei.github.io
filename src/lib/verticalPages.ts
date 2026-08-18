/**
 * Pack 縦書き columns into page windows so a column is never sliced
 * at the left/right edge of the device page. Rects that share a `group`
 * (a <ruby> and its ふりがな) stay on the same page.
 */

export type ColumnRect = { left: number; right: number; group?: string };

export type PageWindow = {
  /** translateX applied to the flow so this page’s first column meets the clip’s right edge */
  shift: number;
  /** clip width: span of the columns that fit, never wider than the usable page */
  width: number;
};

function shareGroup(a: Iterable<string> | undefined, b: Iterable<string> | undefined): boolean {
  if (!a || !b) return false;
  const set = a instanceof Set ? a : new Set(a);
  for (const g of b) {
    if (set.has(g)) return true;
  }
  return false;
}

export function clusterColumns(rects: ColumnRect[], pitch: number): ColumnRect[] {
  const usable = rects.filter((r) => r.right - r.left > 0.5);
  if (!usable.length) return [];

  const tol = Math.max(4, pitch * 0.75);
  const items = usable
    .map((r) => ({
      left: r.left,
      right: r.right,
      mid: (r.left + r.right) / 2,
      groups: new Set(r.group ? [r.group] : []),
      n: 1,
    }))
    .sort((a, b) => b.mid - a.mid);

  const bands: typeof items = [];
  for (const r of items) {
    const g = bands[bands.length - 1];
    if (g && (Math.abs(g.mid - r.mid) <= tol || shareGroup(g.groups, r.groups))) {
      g.left = Math.min(g.left, r.left);
      g.right = Math.max(g.right, r.right);
      r.groups.forEach((id) => g.groups.add(id));
      g.n += 1;
      g.mid = (g.mid * (g.n - 1) + r.mid) / g.n;
    } else {
      bands.push({
        left: r.left,
        right: r.right,
        mid: r.mid,
        groups: new Set(r.groups),
        n: 1,
      });
    }
  }

  // Merge any bands that share a ruby group even if they are not adjacent in x.
  for (let i = 0; i < bands.length; i++) {
    for (let j = i + 1; j < bands.length; j++) {
      if (!shareGroup(bands[i].groups, bands[j].groups)) continue;
      bands[i].left = Math.min(bands[i].left, bands[j].left);
      bands[i].right = Math.max(bands[i].right, bands[j].right);
      bands[j].groups.forEach((id) => bands[i].groups.add(id));
      bands.splice(j, 1);
      j = i;
    }
  }

  bands.sort((a, b) => b.right - a.right || b.mid - a.mid);

  const cols: ColumnRect[] = [];
  for (const g of bands) {
    const prev = cols[cols.length - 1];
    const overlap = prev
      ? Math.min(prev.right, g.right) - Math.max(prev.left, g.left)
      : 0;
    const minW = prev ? Math.min(prev.right - prev.left, g.right - g.left) : 0;
    const glued = prev && shareGroup(prev.group ? [prev.group] : [], g.groups);
    if (prev && (overlap > minW * 0.3 || glued)) {
      prev.left = Math.min(prev.left, g.left);
      prev.right = Math.max(prev.right, g.right);
      if (!prev.group && g.groups.size) prev.group = [...g.groups][0];
    } else {
      cols.push({
        left: g.left,
        right: g.right,
        group: g.groups.size ? [...g.groups][0] : undefined,
      });
    }
  }
  return cols;
}

export function packColumnPages(
  columns: ColumnRect[],
  usable: number,
  clipRight: number,
): PageWindow[] {
  if (usable <= 0) return [{ shift: 0, width: 1 }];
  if (!columns.length) return [{ shift: 0, width: Math.round(usable) }];

  const pages: PageWindow[] = [];
  let i = 0;
  while (i < columns.length) {
    const pageRight = columns[i].right;
    let j = i + 1;
    while (j < columns.length) {
      const next = columns[j];
      const fits = pageRight - next.left <= usable + 0.5;
      const glued = Boolean(next.group && columns[j - 1].group && next.group === columns[j - 1].group);
      if (fits) {
        j += 1;
        continue;
      }
      if (glued) {
        let start = j;
        while (start > i && columns[start - 1].group === next.group) start -= 1;
        if (start === i) {
          while (j < columns.length && columns[j].group === next.group) j += 1;
        } else {
          j = start;
        }
      }
      break;
    }
    const last = columns[j - 1];
    const width = Math.min(usable, Math.max(1, pageRight - last.left));
    pages.push({
      shift: Math.round(clipRight - pageRight),
      width: Math.max(1, Math.round(width)),
    });
    i = j;
  }
  return pages;
}

export function fallbackPageWindows(contentWidth: number, usable: number): PageWindow[] {
  const step = Math.max(1, usable);
  const n = Math.max(1, Math.ceil(Math.max(contentWidth, step) / step));
  return Array.from({ length: n }, (_, i) => ({ shift: i * step, width: step }));
}
