import express from "express";
import cors from "cors";
import "dotenv/config";
import { prisma } from "./lib/prisma";
import authRoutes from "./routes/auth";
import businessProfileRoutes from "./routes/businessProfile";
import salesRoutes from "./routes/sales";
import expensesRoutes from "./routes/expenses";
import inventoryRoutes from "./routes/inventory";
import debtsRoutes from "./routes/debts";
import publicRoutes from "./routes/public";
import storefrontOrdersRoutes from "./routes/storefrontOrders";
import registrationRoutes from "./routes/registration";
import assistantRoutes from "./routes/assistant";
import staffRoutes from "./routes/staff";
import staffAuthRoutes from "./routes/staffAuth";

const app = express();
const PORT = process.env.PORT || 4000;

const allowedOrigins = [
  "http://localhost:5173",
  "https://hussle-wise.vercel.app/", 
];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true, 
  })
);
app.use(express.json({ limit: "10mb" })); 
app.use("/api/auth", authRoutes);
app.use("/api/business-profile", businessProfileRoutes);
app.use("/api/sales", salesRoutes);
app.use("/api/expenses", expensesRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/debts", debtsRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/storefront-orders", storefrontOrdersRoutes);
app.use("/api/registration", registrationRoutes);
app.use("/api/assistant", assistantRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/staff-auth", staffAuthRoutes);

app.get("/api/health", async (_req, res) => {
  try {
    // Confirms both the server AND the DB connection are alive —
    // useful given Neon's cold-start behavior on the free tier.
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", db: "connected" });
  } catch (err) {
    console.error("Health check DB error:", err);
    res.status(503).json({ status: "error", db: "unreachable" });
  }
});

app.listen(PORT, () => {
  console.log(`Husslewise API listening on http://localhost:${PORT}`);
});