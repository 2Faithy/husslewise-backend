import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/requireAuth";

const router = Router();

function computeStatus(amount: number, amountPaid: number, dueDate: Date): string {
  if (amountPaid >= amount) return "paid";
  return dueDate < new Date() ? "overdue" : "pending";
}

interface DebtLine {
  inventoryItemId?: string | null;
  name: string;
  quantity?: number | null;
  unitPrice?: number | null;
  discount: number;
  amount: number;
}

router.get("/", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const debts = await prisma.debt.findMany({
      where: { businessId: req.businessId },
      orderBy: { createdAt: "desc" },
    });
    res.json(debts);
  } catch (err) {
    console.error("Get debts error:", err);
    res.status(500).json({ error: "Something went wrong loading debts." });
  }
});

router.post("/", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const { customerName, phone, dueDate, items, amountPaid, paymentMethod } = req.body;

    if (!customerName || !dueDate) {
      return res.status(400).json({ error: "Customer name and due date are required." });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "At least one item is required." });
    }

    const initialPaid = Number(amountPaid) || 0;
    if (initialPaid > 0 && !paymentMethod) {
      return res.status(400).json({ error: "Payment method is required when recording an initial payment." });
    }

    const result = await prisma.$transaction(async (tx) => {
      const lineItems: DebtLine[] = [];

      for (const line of items) {
        if (line.inventoryItemId) {
          const invItem = await tx.inventoryItem.findUnique({ where: { id: String(line.inventoryItemId) } });
          if (!invItem || invItem.businessId !== req.businessId) {
            throw new Error(`Inventory item not found: ${line.inventoryItemId}`);
          }
          if (!line.quantity || line.quantity <= 0) {
            throw new Error("Quantity must be greater than 0 for each item.");
          }

          const discount = Number(line.discount) || 0;
          const amount = invItem.sellingPrice * Number(line.quantity) - discount;

          lineItems.push({
            inventoryItemId: invItem.id,
            name: invItem.name,
            quantity: Number(line.quantity),
            unitPrice: invItem.sellingPrice,
            discount,
            amount,
          });

          await tx.inventoryItem.update({
            where: { id: invItem.id },
            data: { quantity: { decrement: Number(line.quantity) } },
          });
        } else {
          if (!line.item || line.amount === undefined) {
            throw new Error("Item and amount are required for a custom line.");
          }
          lineItems.push({
            inventoryItemId: null,
            name: line.item,
            quantity: null,
            unitPrice: null,
            discount: 0,
            amount: Number(line.amount),
          });
        }
      }

      const totalAmount = lineItems.reduce((sum, l) => sum + l.amount, 0);
      const summaryLabel = lineItems.map((l) => l.name).join(", ");
      const status = computeStatus(totalAmount, initialPaid, new Date(dueDate));

      const debt = await tx.debt.create({
        data: {
          customerName,
          phone: phone || null,
          item: summaryLabel,
          amount: totalAmount,
          amountPaid: initialPaid,
          dueDate: new Date(dueDate),
          status,
          items: lineItems as any,
          // Single-item fallback fields, only populated when there's exactly one line
          quantity: lineItems.length === 1 ? lineItems[0].quantity : null,
          discount: lineItems.length === 1 ? lineItems[0].discount : 0,
          inventoryItemId: lineItems.length === 1 ? lineItems[0].inventoryItemId : null,
          businessId: req.businessId!,
        },
      });

      let sale = null;
      if (initialPaid > 0) {
        sale = await tx.sale.create({
          data: {
            item: `Debt Payment — ${customerName}`,
            amount: initialPaid,
            paymentMethod,
            category: "Debt Payment",
            date: new Date(),
            debtId: debt.id,
            businessId: req.businessId!,
          },
        });
      }

      return { debt, sale };
    });

    res.status(201).json(result);
  } catch (err: any) {
    console.error("Create debt error:", err);
    res.status(500).json({ error: err.message || "Something went wrong creating the debt record." });
  }
});

router.patch("/:id/payment", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { amount, paymentMethod } = req.body;
    if (!amount || amount <= 0 || !paymentMethod) {
      return res.status(400).json({ error: "A valid amount and payment method are required." });
    }

    const existing = await prisma.debt.findUnique({ where: { id } });
    if (!existing || existing.businessId !== req.businessId) {
      return res.status(404).json({ error: "Debt not found." });
    }

    const newPaid = existing.amountPaid + Number(amount);
    const status = computeStatus(existing.amount, newPaid, existing.dueDate);

    const result = await prisma.$transaction(async (tx) => {
      const debt = await tx.debt.update({
        where: { id },
        data: { amountPaid: newPaid, status },
      });

      const sale = await tx.sale.create({
        data: {
          item: `Debt Payment — ${existing.customerName}`,
          amount: Number(amount),
          paymentMethod,
          category: "Debt Payment",
          date: new Date(),
          debtId: existing.id,
          businessId: req.businessId!,
        },
      });

      return { debt, sale };
    });

    res.json(result);
  } catch (err) {
    console.error("Record debt payment error:", err);
    res.status(500).json({ error: "Something went wrong recording the payment." });
  }
});

router.delete("/:id", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const debt = await prisma.debt.findUnique({ where: { id } });
    if (!debt || debt.businessId !== req.businessId) {
      return res.status(404).json({ error: "Debt not found." });
    }

    await prisma.$transaction(async (tx) => {
      const lineItems = (debt.items as unknown as DebtLine[]) || [];

      if (lineItems.length > 0) {
        for (const line of lineItems) {
          if (line.inventoryItemId && line.quantity) {
            await tx.inventoryItem.update({
              where: { id: line.inventoryItemId },
              data: { quantity: { increment: line.quantity } },
            });
          }
        }
      } else if (debt.inventoryItemId && debt.quantity) {
        await tx.inventoryItem.update({
          where: { id: debt.inventoryItemId },
          data: { quantity: { increment: debt.quantity } },
        });
      }

      await tx.debt.delete({ where: { id } });
    });

    res.json({ message: "Debt record deleted." });
  } catch (err) {
    console.error("Delete debt error:", err);
    res.status(500).json({ error: "Something went wrong deleting the debt record." });
  }
});

export default router;