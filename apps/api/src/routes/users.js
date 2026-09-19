import { parseJsonBody } from "../http/body.js";
import { publicUser } from "../operations.js";
export function createUsersRoutes({
  requirePortfolioWriteAccess,
  validateRequired,
  badRequest,
  forbidden,
  db,
  created,
  sanitizeUser,
  conflict,
}) {
  return async function usersRoutes(request, response, url) {
    const pathname = url.pathname;
    const method = request.method;
    if (method === "POST" && pathname === "/api/users") {
      const user = requirePortfolioWriteAccess(request, response);
      if (!user) {
        return true;
      }

      const body = await parseJsonBody(request);
      const missing = validateRequired(body, [
        "fullName",
        "email",
        "password",
        "role",
      ]);
      if (missing) {
        badRequest(response, `Missing field: ${missing}`);
        return true;
      }

      if (body.role !== "admin" && !body.propertyId) {
        badRequest(response, "Missing field: propertyId");
        return true;
      }

      if (user.role === "manager" && body.role !== "worker") {
        forbidden(response);
        return true;
      }

      if (
        user.role === "manager" &&
        (!user.property_id || body.propertyId !== user.property_id)
      ) {
        forbidden(response);
        return true;
      }

      try {
        if (String(body.password).length < 10) {
          badRequest(response, "Пароль должен содержать не менее 10 символов");
          return true;
        }
        const createdUser = db.createUser({
          fullName: String(body.fullName),
          email: String(body.email).toLowerCase(),
          phone: body.phone ? String(body.phone) : null,
          password: String(body.password),
          role: String(body.role),
          propertyId: body.role === "admin" ? null : String(body.propertyId),
        });

        db.audit(user, "user_created", "user", createdUser.id, {
          user: publicUser(createdUser),
        });
        db.save();
        created(response, {
          item: sanitizeUser(createdUser),
        });
      } catch (caughtError) {
        conflict(
          response,
          caughtError instanceof Error
            ? caughtError.message
            : "Create user failed",
        );
      }
      return true;
    }
    return false;
  };
}
