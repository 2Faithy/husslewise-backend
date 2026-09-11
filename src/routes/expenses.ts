import { Router, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/requireAuth";

const router = Router();

router.get("/", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const expenses = await prisma.expense.findMany({
      where: { businessId: req.businessId },
      orderBy: { date: "desc" },
    });
    res.json(expenses);
  } catch (err) {
    console.error("Get expenses error:", err);
    res.status(500).json({ error: "Something went wrong loading expenses." });
  }
});

router.post("/", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const { type, amount, description, recurring, date } = req.body;
    if (!type || amount === undefined || !date) {
      return res.status(400).json({ error: "Type, amount, and date are required." });
    }

    const expense = await prisma.expense.create({
      data: {
        type,
        amount: Number(amount),
        description: description || null,
        recurring: Boolean(recurring),
        date: new Date(date),
        businessId: req.businessId!,
      },
    });

    res.status(201).json(expense);
  } catch (err) {
    console.error("Create expense error:", err);
    res.status(500).json({ error: "Something went wrong creating the expense." });
  }
});

router.delete("/:id", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!id) {
      return res.status(400).json({ error: "Invalid expense ID." });
    }

    const expense = await prisma.expense.findUnique({ where: { id } });
    if (!expense || expense.businessId !== req.businessId) {
      return res.status(404).json({ error: "Expense not found." });
    }

    await prisma.expense.delete({ where: { id } });
    res.json({ message: "Expense deleted." });
  } catch (err) {
    console.error("Delete expense error:", err);
    res.status(500).json({ error: "Something went wrong deleting the expense." });
  }
});

export default router;