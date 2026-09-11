import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/requireAuth";

const router = Router();

router.get("/", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const business = await prisma.business.findUnique({
      where: { id: req.businessId },
      select: {
        id: true,
        businessName: true,
        fullName: true,
        email: true,
        phone: true,
        address: true,
        bankName: true,
        accountNumber: true,
        accountName: true,
        businessLogo: true,
        category: true,
        businessType: true,
        state: true,
        teamSize: true,
        yearsOperating: true,
        monthlyRevenueRange: true,
        goals: true,
        storefrontSlug: true,
        storefrontOpen: true,
        onboardingComplete: true,
        about: true,
        notifyLowStock: true,
        notifyOverdueDebts: true,
        notifyDailySummary: true,
        notifyGrowthTips: true,
      },
    });

    if (!business) {
      return res.status(404).json({ error: "Business not found." });
    }

    res.json(business);
  } catch (err) {
    console.error("Get business profile error:", err);
    res.status(500).json({ error: "Something went wrong loading your profile." });
  }
});

router.patch("/", requireAuth, requireRole("admin"), async (req: AuthedRequest, res: Response) => {
  try {
    // Whitelist of fields the client is allowed to update — prevents
    // someone from PATCHing in fields like passwordHash or email directly.
    const allowedFields = [
      "businessName",
      "phone",
      "address",
      "bankName",
      "accountNumber",
      "accountName",
      "businessLogo",
      "category",
      "businessType",
      "state",
      "teamSize",
      "yearsOperating",
      "monthlyRevenueRange",
      "goals",
      "storefrontOpen",
      "onboardingComplete",
      "offersDelivery",
      "about",
      "notifyLowStock",
      "notifyOverdueDebts",
      "notifyDailySummary",
      "notifyGrowthTips",
    ] as const;

    const data: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in req.body) {
        data[field] = req.body[field];
      }
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "No valid fields provided to update." });
    }

    const business = await prisma.business.update({
      where: { id: req.businessId },
      data,
      select: {
        id: true,
        businessName: true,
        fullName: true,
        email: true,
        phone: true,
        address: true,
        bankName: true,
        accountNumber: true,
        accountName: true,
        businessLogo: true,
        category: true,
        businessType: true,
        state: true,
        teamSize: true,
        yearsOperating: true,
        monthlyRevenueRange: true,
        goals: true,
        storefrontSlug: true,
        storefrontOpen: true,
        onboardingComplete: true,
        about: true,
        notifyLowStock: true,
        notifyOverdueDebts: true,
        notifyDailySummary: true,
        notifyGrowthTips: true,
      },
    });

    res.json(business);
  } catch (err) {
    console.error("Update business profile error:", err);
    res.status(500).json({ error: "Something went wrong updating your profile." });
  }
});

router.delete("/", requireAuth, requireRole("admin"), async (req: AuthedRequest, res: Response) => {
  try {
    // onDelete: Cascade on every related model (Sale, Expense, Debt,
    // InventoryItem, Staff, StorefrontOrder) means this one call
    // cleans up everything tied to this business.
    await prisma.business.delete({ where: { id: req.businessId } });
    res.json({ message: "Account and all associated data deleted." });
  } catch (err) {
    console.error("Delete account error:", err);
    res.status(500).json({ error: "Something went wrong deleting your account." });
  }
});

export default router;