import { Router, Request, Response } from "express";
import bcrypt from "bcrypt";
import { prisma } from "../lib/prisma";

const router = Router();

router.post("/accept-invite", async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ error: "Token and password are required." });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }

    const staff = await prisma.staff.findFirst({ where: { inviteToken: token } });
    if (!staff) {
      return res.status(404).json({ error: "Invalid or already-used invite link." });
    }
    if (!staff.inviteTokenExpires || staff.inviteTokenExpires < new Date()) {
      return res.status(400).json({ error: "This invite link has expired. Ask your business owner to resend it." });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await prisma.staff.update({
      where: { id: staff.id },
      data: {
        passwordHash,
        status: "active",
        inviteToken: null,
        inviteTokenExpires: null,
      },
    });

    res.json({ message: "Password set. You can now log in." });
  } catch (err) {
    console.error("Accept invite error:", err);
    res.status(500).json({ error: "Something went wrong setting your password." });
  }
});

export default router;