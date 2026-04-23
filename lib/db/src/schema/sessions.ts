import { pgTable, varchar, json, timestamp, index } from "drizzle-orm/pg-core";

// Managed by `connect-pg-simple` — declared here so drizzle-kit push does not
// try to drop it. Do NOT change column names/types: connect-pg-simple writes
// to this exact shape.
export const sessionTable = pgTable(
  "session",
  {
    sid: varchar("sid").primaryKey(),
    sess: json("sess").notNull(),
    expire: timestamp("expire", { precision: 6, withTimezone: false }).notNull(),
  },
  (t) => [index("IDX_session_expire").on(t.expire)],
);
