import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/requireAuth";

const router = Router();

router.get("/", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const items = await prisma.inventoryItem.findMany({
      where: { businessId: req.businessId },
      orderBy: { createdAt: "desc" },
    });
    res.json(items);
  } catch (err) {
    console.error("Get inventory error:", err);
    res.status(500).json({ error: "Something went wrong loading inventory." });
  }
});

router.post("/", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const { name, quantity, unit, costPrice, sellingPrice, lowStockThreshold } = req.body;
    if (!name || quantity === undefined || !unit || costPrice === undefined || sellingPrice === undefined) {
      return res.status(400).json({ error: "Name, quantity, unit, cost price, and selling price are required." });
    }

    const item = await prisma.inventoryItem.create({
      data: {
        name,
        quantity: Number(quantity),
        unit,
        costPrice: Number(costPrice),
        sellingPrice: Number(sellingPrice),
        lowStockThreshold: lowStockThreshold !== undefined ? Number(lowStockThreshold) : 5,
        businessId: req.businessId!,
      },
    });

    res.status(201).json(item);
  } catch (err) {
    console.error("Create inventory item error:", err);
    res.status(500).json({ error: "Something went wrong adding the item." });
  }
});

router.patch("/:id", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!id) {
      return res.status(400).json({ error: "Invalid item ID." });
    }

    const existing = await prisma.inventoryItem.findUnique({ where: { id } });
    if (!existing || existing.businessId !== req.businessId) {
      return res.status(404).json({ error: "Item not found." });
    }

    const allowedFields = ["name", "quantity", "unit", "costPrice", "sellingPrice", "lowStockThreshold"] as const;
    const data: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in req.body) data[field] = req.body[field];
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "No valid fields provided to update." });
    }

    const item = await prisma.inventoryItem.update({
      where: { id },
      data,
    });

    res.json(item);
  } catch (err) {
    console.error("Update inventory item error:", err);
    res.status(500).json({ error: "Something went wrong updating the item." });
  }
});

router.delete("/:id", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!id) {
      return res.status(400).json({ error: "Invalid item ID." });
    }

    const item = await prisma.inventoryItem.findUnique({ where: { id } });
    if (!item || item.businessId !== req.businessId) {
      return res.status(404).json({ error: "Item not found." });
    }
    await prisma.inventoryItem.delete({ where: { id } });
    res.json({ message: "Item deleted." });
  } catch (err) {
    console.error("Delete inventory item error:", err);
    res.status(500).json({ error: "Something went wrong deleting the item." });
  }
});

export default router;