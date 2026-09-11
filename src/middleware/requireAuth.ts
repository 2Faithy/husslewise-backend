import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../lib/jwt";

export interface AuthedRequest extends Request {
  businessId?: string;
  staffId?: string;
  role?: string;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided." });
  }

  const token = authHeader.split(" ")[1];
  try {
    const payload = verifyAccessToken(token);
    req.businessId = payload.businessId;
    req.staffId = payload.staffId;
    req.role = payload.role;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}

// Restricts a route to specific staff roles. The business owner (no staffId
// on the token) always passes, since they have full access by definition.
export function requireRole(...allowedRoles: string[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.staffId) return next(); // owner
    if (req.role && allowedRoles.includes(req.role)) return next();
    return res.status(403).json({ error: "You don't have permission to do this." });
  };
}