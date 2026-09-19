import { config } from "../apps/api/src/config.js";
import { openDatabase } from "../apps/api/src/persistence/database.js";

const fullName = String(process.env.INITIAL_ADMIN_NAME ?? "").trim();
const email = String(process.env.INITIAL_ADMIN_EMAIL ?? "")
  .trim()
  .toLowerCase();
const password = String(process.env.INITIAL_ADMIN_PASSWORD ?? "");

if (!fullName) throw new Error("INITIAL_ADMIN_NAME is required");
if (!/^\S+@\S+\.\S+$/.test(email))
  throw new Error("INITIAL_ADMIN_EMAIL must be a valid email");
if (password.length < 16)
  throw new Error("INITIAL_ADMIN_PASSWORD must be at least 16 characters");

const db = await openDatabase(config);
try {
  await db.requestScope({}, () => {
    if (db.listUsers().length)
      throw new Error("Database already contains users");
    db.createUser({
      fullName,
      email,
      password,
      role: "admin",
      propertyId: null,
    });
  });
} finally {
  await db.close();
}

console.log(`Initial administrator created: ${email}`);
