import assert from "node:assert/strict";
import test from "node:test";
import { collectLabelTreeIds } from "./label-tree";

test("collects the root label and every nested sublabel", () => {
  const result = collectLabelTreeIds(
    [
      { id: 1, parentLabelId: null },
      { id: 2, parentLabelId: 1 },
      { id: 3, parentLabelId: 2 },
      { id: 4, parentLabelId: 1 },
      { id: 20, parentLabelId: null },
      { id: 21, parentLabelId: 20 },
    ],
    1,
  );

  assert.deepEqual(new Set(result), new Set([1, 2, 3, 4]));
});

test("does not cross into foreign trees or loop forever on cycles", () => {
  const result = collectLabelTreeIds(
    [
      { id: 5, parentLabelId: null },
      { id: 6, parentLabelId: 5 },
      { id: 30, parentLabelId: 31 },
      { id: 31, parentLabelId: 30 },
    ],
    5,
  );

  assert.deepEqual(new Set(result), new Set([5, 6]));
});
