import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/requireAuth";
import { uploadPaymentProof } from "../lib/cloudinary";
import { sendRegistrationReceivedEmail } from "../lib/email";

const router = Router();

router.get("/", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const registration = await prisma.businessRegistration.findUnique({
      where: { businessId: req.businessId },
    });
    res.json(registration);
  } catch (err) {
    console.error("Get registration error:", err);
    res.status(500).json({ error: "Something went wrong loading your registration." });
  }
});

router.post("/", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const { businessName, businessType, ownerFullName, ownerNIN, documentsConfirmed, paymentProof } = req.body;

    if (!businessName || !businessType || !ownerFullName || !ownerNIN || !documentsConfirmed) {
      return res.status(400).json({ error: "All fields are required." });
    }
    if (!paymentProof) {
      return res.status(400).json({ error: "Please upload proof of payment." });
    }

    const existing = await prisma.businessRegistration.findUnique({ where: { businessId: req.businessId } });
    if (existing) {
      return res.status(409).json({ error: "You already have a registration in progress." });
    }

    let proofUrl: string;
    try {
      proofUrl = await uploadPaymentProof(paymentProof);
    } catch (uploadErr) {
      console.error("Cloudinary upload failed:", uploadErr);
      return res.status(500).json({ error: "Could not upload payment proof. Please try again." });
    }

    const estimated = new Date();
    estimated.setDate(estimated.getDate() + 10);

    const registration = await prisma.businessRegistration.create({
      data: {
        businessName,
        businessType,
        ownerFullName,
        ownerNIN,
        documentsConfirmed,
        paymentProof: proofUrl,
        status: "submitted",
        estimatedCompletionDate: estimated,
        businessId: req.businessId!,
      },
    });

    const business = await prisma.business.findUnique({ where: { id: req.businessId } });
    if (business) {
      sendRegistrationReceivedEmail(business.email, businessName, ownerFullName).catch((err) =>
        console.error("Registration confirmation email failed to send:", err)
      );
    }

    res.status(201).json(registration);
  } catch (err) {
    console.error("Create registration error:", err);
    res.status(500).json({ error: "Something went wrong submitting your registration." });
  }
});

export default router;