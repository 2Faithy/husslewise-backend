import { Router, Response } from "express";
import { requireAuth, AuthedRequest } from "../middleware/requireAuth";
import { analyzeProductPhoto } from "../lib/gemini";

const router = Router();

router.post("/vision", requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const { image, mimeType } = req.body;
    if (!image || !mimeType) {
      return res.status(400).json({ error: "Image data and mime type are required." });
    }

    // Strip the "data:image/jpeg;base64," prefix if present — Gemini wants raw base64
    const base64Data = image.includes(",") ? image.split(",")[1] : image;

    const result = await analyzeProductPhoto(base64Data, mimeType);
    res.json(result);
  } catch (err: any) {
    console.error("Vision analysis error:", err);
    res.status(500).json({ error: err.message || "Something went wrong analyzing the photo." });
  }
});

export default router;