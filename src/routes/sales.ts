import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/requireAuth";

const router = Router();

router.get("/", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const sales = await prisma.sale.findMany({
      where: { businessId: req.businessId },
      orderBy: { date: "desc" },
    });
    res.json(sales);
  } catch (err) {
    console.error("Get sales error:", err);
    res.status(500).json({ error: "Something went wrong loading sales." });
  }
});

router.post("/", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const { item, amount, paymentMethod, category, date, quantity, discount, inventoryItemId } = req.body;

    if (!paymentMethod || !category || !date) {
      return res.status(400).json({ error: "Payment method, category, and date are required." });
    }

    // ---- Inventory-linked sale: recompute the total server-side from
    // the item's real price, don't trust a client-sent amount, and
    // decrement stock in the same transaction so they never drift apart.
    if (inventoryItemId) {
      const invItem = await prisma.inventoryItem.findUnique({ where: { id: inventoryItemId } });
      if (!invItem || invItem.businessId !== req.businessId) {
        return res.status(404).json({ error: "Inventory item not found." });
      }
      if (!quantity || quantity <= 0) {
        return res.status(400).json({ error: "Quantity must be greater than 0." });
      }

      const discountAmount = Number(discount) || 0;
      const total = invItem.sellingPrice * Number(quantity) - discountAmount;

      const [sale] = await prisma.$transaction([
        prisma.sale.create({
          data: {
            item: invItem.name,
            amount: total,
            paymentMethod,
            category,
            date: new Date(date),
            quantity: Number(quantity),
            discount: discountAmount,
            inventoryItemId: invItem.id,
            businessId: req.businessId!,
          },
        }),
        prisma.inventoryItem.update({
          where: { id: invItem.id },
          data: { quantity: { decrement: Number(quantity) } }, // allowed to go negative — backorder is OK
        }),
      ]);

      return res.status(201).json(sale);
    }

    // ---- Custom sale (services, one-offs, not tied to stock) ----
    if (!item || amount === undefined) {
      return res.status(400).json({ error: "Item and amount are required for a custom sale." });
    }

    const sale = await prisma.sale.create({
      data: {
        item,
        amount: Number(amount),
        paymentMethod,
        category,
        date: new Date(date),
        discount: Number(discount) || 0,
        businessId: req.businessId!,
      },
    });

    res.status(201).json(sale);
  } catch (err) {
    console.error("Create sale error:", err);
    res.status(500).json({ error: "Something went wrong creating the sale." });
  }
});

router.post("/bulk", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const { items, paymentMethod, date } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "At least one item is required." });
    }
    if (!paymentMethod || !date) {
      return res.status(400).json({ error: "Payment method and date are required." });
    }

    const groupId = `grp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const createdSales = await prisma.$transaction(async (tx) => {
      const results = [];

      for (const line of items) {
        const { inventoryItemId, quantity, discount, item, amount, category } = line;

        if (inventoryItemId) {
          const invItem = await tx.inventoryItem.findUnique({ where: { id: inventoryItemId } });
          if (!invItem || invItem.businessId !== req.businessId) {
            throw new Error(`Inventory item not found: ${inventoryItemId}`);
          }
          if (!quantity || quantity <= 0) {
            throw new Error("Quantity must be greater than 0.");
          }

          const discountAmount = Number(discount) || 0;
          const total = invItem.sellingPrice * Number(quantity) - discountAmount;

          const sale = await tx.sale.create({
            data: {
              item: invItem.name,
              amount: total,
              paymentMethod,
              category: category || "Product Sales",
              date: new Date(date),
              quantity: Number(quantity),
              discount: discountAmount,
              inventoryItemId: invItem.id,
              groupId,
              businessId: req.businessId!,
            },
          });

          await tx.inventoryItem.update({
            where: { id: invItem.id },
            data: { quantity: { decrement: Number(quantity) } },
          });

          results.push(sale);
        } else {
          if (!item || amount === undefined) {
            throw new Error("Item and amount are required for a custom line.");
          }

          const sale = await tx.sale.create({
            data: {
              item,
              amount: Number(amount),
              paymentMethod,
              category: category || "Other",
              date: new Date(date),
              discount: Number(discount) || 0,
              groupId,
              businessId: req.businessId!,
            },
          });

          results.push(sale);
        }
      }

      return results;
    });

    res.status(201).json(createdSales);
  } catch (err: any) {
    console.error("Bulk sale error:", err);
    res.status(500).json({ error: err.message || "Something went wrong creating the sale." });
  }
});

router.delete("/:id", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!id) {
      return res.status(400).json({ error: "Invalid sale ID." });
    }

    const sale = await prisma.sale.findUnique({ where: { id } });
    if (!sale || sale.businessId !== req.businessId) {
      return res.status(404).json({ error: "Sale not found." });
    }

    // If this sale pulled from inventory, give the stock back on delete —
    // otherwise deleting a mistaken sale would leave inventory permanently short.
    if (sale.inventoryItemId && sale.quantity) {
      await prisma.$transaction([
        prisma.sale.delete({ where: { id } }),
        prisma.inventoryItem.update({
          where: { id: sale.inventoryItemId },
          data: { quantity: { increment: sale.quantity } },
        }),
      ]);
    } else {
      await prisma.sale.delete({ where: { id } });
    }

    res.json({ message: "Sale deleted." });
  } catch (err) {
    console.error("Delete sale error:", err);
    res.status(500).json({ error: "Something went wrong deleting the sale." });
  }
});

router.patch("/:id/receipt-sent", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!id) {
      return res.status(400).json({ error: "Invalid sale ID." });
    }

    const sale = await prisma.sale.findUnique({ where: { id } });
    if (!sale || sale.businessId !== req.businessId) {
      return res.status(404).json({ error: "Sale not found." });
    }

    const updated = await prisma.sale.update({
      where: { id },
      data: { receiptSent: true },
    });

    res.json(updated);
  } catch (err) {
    console.error("Mark receipt sent error:", err);
    res.status(500).json({ error: "Something went wrong marking the receipt as sent." });
  }
});

export default router;