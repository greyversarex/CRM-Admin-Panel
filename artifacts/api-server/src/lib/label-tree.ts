export type LabelTreeNode = {
  id: number;
  parentLabelId: number | null;
};

/** Collects the root label and all of its descendants without trusting depth. */
export function collectLabelTreeIds(rows: LabelTreeNode[], rootId: number): number[] {
  const allowed = new Set<number>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (row.parentLabelId != null && allowed.has(row.parentLabelId) && !allowed.has(row.id)) {
        allowed.add(row.id);
        changed = true;
      }
    }
  }
  return Array.from(allowed);
}
