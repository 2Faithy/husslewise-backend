import { Router, Response } from "express";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/requireAuth";
import { sendStaffInviteEmail } from "../lib/email";

const router = Router();

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

router.get("/", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const staff = await prisma.staff.findMany({
      where: { businessId: req.businessId },
      orderBy: { dateAdded: "desc" },
    });
    res.json(staff);
  } catch (err) {
    console.error("Get staff error:", err);
    res.status(500).json({ error: "Something went wrong loading staff." });
  }
});

router.post("/", requireAuth, requireRole("admin"), async (req: AuthedRequest, res: Response) => {
  try {
    const { name, email, phone, role } = req.body;
    if (!name || !email || !role) {
      return res.status(400).json({ error: "Name, email, and role are required." });
    }

    const existingBusiness = await prisma.business.findUnique({ where: { email } });
    // Use findFirst to bypass unique input type requirements if email isn't globally unique on Staff
    const existingStaff = await prisma.staff.findFirst({ where: { email } });
    if (existingBusiness || existingStaff) {
      return res.status(409).json({ error: "This email is already in use." });
    }

    const business = await prisma.business.findUnique({ where: { id: req.businessId } });
    const inviteToken = crypto.randomBytes(32).toString("hex");
    const inviteTokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const staff = await prisma.staff.create({
      data: {
        name,
        email,
        phone: phone || null,
        role,
        status: "pending",
        inviteToken,
        inviteTokenExpires,
        businessId: req.businessId!,
      },
    });

    const inviteLink = `${FRONTEND_URL}/staff-invite?token=${inviteToken}`;
    sendStaffInviteEmail(email, name, business?.businessName || "your team", inviteLink).catch((err) =>
      console.error("Staff invite email failed to send:", err)
    );

    res.status(201).json(staff);
  } catch (err) {
    console.error("Add staff error:", err);
    res.status(500).json({ error: "Something went wrong adding this staff member." });
  }
});

router.patch("/:id/role", requireAuth, requireRole("admin"), async (req: AuthedRequest, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { role } = req.body;

    const staff = await prisma.staff.findUnique({ where: { id } });
    if (!staff || staff.businessId !== req.businessId) {
      return res.status(404).json({ error: "Staff member not found." });
    }

    const updated = await prisma.staff.update({ where: { id }, data: { role } });
    res.json(updated);
  } catch (err) {
    console.error("Update staff role error:", err);
    res.status(500).json({ error: "Something went wrong updating this staff member's role." });
  }
});

router.patch("/:id/status", requireAuth, requireRole("admin"), async (req: AuthedRequest, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    const staff = await prisma.staff.findUnique({ where: { id } });
    if (!staff || staff.businessId !== req.businessId) {
      return res.status(404).json({ error: "Staff member not found." });
    }

    const newStatus = staff.status === "suspended" ? "active" : "suspended";
    const updated = await prisma.staff.update({ where: { id }, data: { status: newStatus } });
    res.json(updated);
  } catch (err) {
    console.error("Toggle staff status error:", err);
    res.status(500).json({ error: "Something went wrong updating this staff member's status." });
  }
});

router.delete("/:id", requireAuth, requireRole("admin"), async (req: AuthedRequest, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    const staff = await prisma.staff.findUnique({ where: { id } });
    if (!staff || staff.businessId !== req.businessId) {
      return res.status(404).json({ error: "Staff member not found." });
    }

    await prisma.staff.delete({ where: { id } });
    res.json({ message: "Staff member removed." });
  } catch (err) {
    console.error("Remove staff error:", err);
    res.status(500).json({ error: "Something went wrong removing this staff member." });
  }
});

export default router;