import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { sendNewOrderEmail } from "../lib/email";
import { uploadPaymentProof } from "../lib/cloudinary";

const router = Router();

router.get("/store/:slug", async (req: Request, res: Response) => {
  try {
    const slug = req.params.slug as string;

    const business = await prisma.business.findUnique({
      where: { storefrontSlug: slug },
      select: {
        id: true,
        businessName: true,
        phone: true,
        address: true,
        bankName: true,
        accountNumber: true,
        accountName: true,
        businessLogo: true,
        storefrontOpen: true,
        storefrontSlug: true,
        offersDelivery: true,
      },
    });

    if (!business) {
      return res.status(404).json({ error: "Store not found." });
    }

    const products = await prisma.inventoryItem.findMany({
      where: { businessId: business.id },
      select: { id: true, name: true, sellingPrice: true, quantity: true, unit: true },
    });

    res.json({ business, products });
  } catch (err) {
    console.error("Get public store error:", err);
    res.status(500).json({ error: "Something went wrong loading the store." });
  }
});

router.post("/store/:slug/orders", async (req: Request, res: Response) => {
  try {
    const slug = req.params.slug as string;

    const {
      items, customerName, customerPhone,
      deliveryMethod, deliveryAddress,
      paymentMethod, paymentProof,
    } = req.body;

    if (!customerName || !customerPhone || !deliveryMethod || !paymentMethod) {
      return res.status(400).json({ error: "Missing required order details." });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Cart is empty." });
    }
    if (deliveryMethod === "delivery" && (!deliveryAddress || paymentMethod !== "transfer")) {
      return res.status(400).json({ error: "Delivery orders require an address and upfront transfer payment." });
    }
    if (paymentMethod === "transfer" && !paymentProof) {
      return res.status(400).json({ error: "Please upload proof of payment." });
    }

    const business = await prisma.business.findUnique({ where: { storefrontSlug: slug } });
    if (!business) {
      return res.status(404).json({ error: "Store not found." });
    }
    if (!business.storefrontOpen) {
      return res.status(400).json({ error: "This store is currently closed." });
    }

    // Upload the image to Cloudinary BEFORE opening the DB transaction —
    // this can take a couple seconds, and doing it inside the transaction
    // was exactly what blew past Prisma's timeout.
    let proofUrl: string | null = null;
    if (paymentProof) {
      try {
        proofUrl = await uploadPaymentProof(paymentProof);
      } catch (uploadErr) {
        console.error("Cloudinary upload failed:", uploadErr);
        return res.status(500).json({ error: "Could not upload payment proof. Please try again." });
      }
    }

    const order = await prisma.$transaction(
      async (tx) => {
        const lineItems = [];
        let total = 0;

        for (const line of items) {
          const invItem = await tx.inventoryItem.findUnique({ where: { id: line.itemId } });
          if (!invItem || invItem.businessId !== business.id) {
            throw new Error("One of the items in your cart is no longer available.");
          }
          const qty = Number(line.quantity) || 1;
          const lineTotal = invItem.sellingPrice * qty;
          total += lineTotal;

          lineItems.push({ itemId: invItem.id, name: invItem.name, price: invItem.sellingPrice, quantity: qty });

          await tx.inventoryItem.update({
            where: { id: invItem.id },
            data: { quantity: { decrement: qty } },
          });
        }

        return tx.storefrontOrder.create({
          data: {
            items: lineItems,
            total,
            customerName,
            customerPhone,
            deliveryMethod,
            deliveryAddress: deliveryAddress || null,
            paymentMethod,
            paymentProof: proofUrl,
            status: "pending",
            businessId: business.id,
          },
        });
      },
      { timeout: 10000 }
    );

    sendNewOrderEmail(business.email, business.businessName, customerName, order.total, !!paymentProof).catch((err) =>
      console.error("Order email failed to send:", err)
    );

    res.status(201).json({ message: "Order placed successfully.", orderId: order.id });
  } catch (err: any) {
    console.error("Place public order error:", err);
    res.status(500).json({ error: err.message || "Something went wrong placing your order." });
  }
});

export default router;