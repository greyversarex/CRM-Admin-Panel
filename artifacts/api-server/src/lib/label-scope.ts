import { db, labelsTable } from "@workspace/db";
import { collectLabelTreeIds } from "./label-tree";

export async function resolveLabelTreeIds(rootId: number): Promise<number[]> {
  const rows = await db
    .select({ id: labelsTable.id, parentLabelId: labelsTable.parentLabelId })
    .from(labelsTable);
  return collectLabelTreeIds(rows, rootId);
}
