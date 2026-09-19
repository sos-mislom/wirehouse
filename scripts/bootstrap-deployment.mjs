// One-time seed before publishing the virtual host. Never use default demo passwords online.
import { config } from "../apps/api/src/config.js";
import { openDatabase } from "../apps/api/src/persistence/database.js";
import { hashPassword } from "../apps/api/src/auth.js";
import crypto from "node:crypto";
if (
  !process.env.INITIAL_ADMIN_PASSWORD ||
  process.env.INITIAL_ADMIN_PASSWORD.length < 16
)
  throw new Error("INITIAL_ADMIN_PASSWORD must be at least 16 characters");
const db = await openDatabase(config);
try {
  await db.requestScope({ readOnly: false }, () => {
    if (db.data.users.length)
      throw new Error(
        "Database already initialized; refusing to overwrite users",
      );
    db.transaction(() => {
      db.ensureSeedData();
      db.ensureRichDemoData();
      db.ensureDemoBackfill();
      db.ensureTicketOperationsBackfill();
      db.ensureBillingBackfill();
      for (const user of db.data.users) {
        user.password_hash = hashPassword(
          user.role === "admin"
            ? process.env.INITIAL_ADMIN_PASSWORD
            : crypto.randomBytes(32).toString("hex"),
        );
      }
    });
  });
} finally {
  await db.close();
}
console.log(
  "Initialized demo portfolio with private credentials. Demo OTP is disabled.",
);
