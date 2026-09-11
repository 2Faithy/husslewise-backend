import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/requireAuth";

const router = Router();

router.get("/", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const orders = await prisma.storefrontOrder.findMany({
      where: { businessId: req.businessId },
      orderBy: { date: "desc" },
    });
    res.json(orders);
  } catch (err) {
    console.error("Get storefront orders error:", err);
    res.status(500).json({ error: "Something went wrong loading orders." });
  }
});

router.patch("/:id/confirm", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const order = await prisma.storefrontOrder.findUnique({ where: { id } });
    
    if (!order || order.businessId !== req.businessId) {
      return res.status(404).json({ error: "Order not found." });
    }
    if (order.paymentMethod !== "transfer") {
      return res.status(400).json({ error: "Only transfer-based orders need payment confirmation." });
    }

    const items = order.items as unknown as { name: string; price: number; quantity: number }[];

    const updated = await prisma.$transaction(async (tx) => {
      for (const line of items) {
        await tx.sale.create({
          data: {
            item: line.name,
            amount: line.price * line.quantity,
            paymentMethod: "transfer",
            category: "Storefront Order",
            date: new Date(),
            businessId: req.businessId!,
          },
        });
      }
      return tx.storefrontOrder.update({
        where: { id },
        data: { paymentConfirmed: true, status: "confirmed" },
      });
    });

    res.json(updated);
  } catch (err) {
    console.error("Confirm order error:", err);
    res.status(500).json({ error: "Something went wrong confirming the order." });
  }
});

router.patch("/:id/complete", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const { deliveryFee } = req.body;
    const order = await prisma.storefrontOrder.findUnique({ where: { id } });
    
    if (!order || order.businessId !== req.businessId) {
      return res.status(404).json({ error: "Order not found." });
    }

    const items = order.items as unknown as { name: string; price: number; quantity: number }[];

    const updated = await prisma.$transaction(async (tx) => {
      // Cash-on-pickup orders haven't had sales recorded yet — do it now
      if (order.paymentMethod === "pay_on_pickup" && !order.paymentConfirmed) {
        for (const line of items) {
          await tx.sale.create({
            data: {
              item: line.name,
              amount: line.price * line.quantity,
              paymentMethod: "cash",
              category: "Storefront Order",
              date: new Date(),
              businessId: req.businessId!,
            },
          });
        }
      }

      return tx.storefrontOrder.update({
        where: { id },
        data: {
          status: "completed",
          paymentConfirmed: true,
          deliveryFee: deliveryFee !== undefined ? Number(deliveryFee) : (order.deliveryFee ?? 0),
        },
      });
    });

    res.json(updated);
  } catch (err) {
    console.error("Complete order error:", err);
    res.status(500).json({ error: "Something went wrong completing the order." });
  }
});

router.patch("/:id/decline", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const order = await prisma.storefrontOrder.findUnique({ where: { id } });
    
    if (!order || order.businessId !== req.businessId) {
      return res.status(404).json({ error: "Order not found." });
    }

    const items = order.items as unknown as { itemId: string; quantity: number }[];

    const updated = await prisma.$transaction(async (tx) => {
      for (const line of items) {
        await tx.inventoryItem.update({
          where: { id: line.itemId },
          data: { quantity: { increment: line.quantity } },
        });
      }
      return tx.storefrontOrder.update({
        where: { id },
        data: { status: "declined" },
      });
    });

    res.json(updated);
  } catch (err) {
    console.error("Decline order error:", err);
    res.status(500).json({ error: "Something went wrong declining the order." });
  }
});

export default router;