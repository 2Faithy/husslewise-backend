const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

export interface PhotoAnalysisResult {
  name: string;
  quantity: number;
  unit: string;
  costPrice: number;
  sellingPrice: number;
}

export async function analyzeProductPhoto(base64Image: string, mimeType: string): Promise<PhotoAnalysisResult> {
  const prompt = `You are helping a small Nigerian business owner add a product to their inventory from a photo.
Look at the image and identify the product. Respond with ONLY a JSON object, no markdown, no explanation, in exactly this shape:
{"name": "product name", "quantity": estimated count visible as a number, "unit": "pieces/baskets/bags/etc", "costPrice": 0, "sellingPrice": 0}
If you can't confidently estimate a price, use 0 for costPrice and sellingPrice — the owner will fill those in themselves.`;

  const res = await fetch(`${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType, data: base64Image } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${errBody}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

  // Strip markdown code fences if Gemini wraps the JSON despite instructions
  const cleaned = text.replace(/```json|```/g, "").trim();

  try {
    const parsed = JSON.parse(cleaned);
    return {
      name: parsed.name || "Unknown Product",
      quantity: Number(parsed.quantity) || 1,
      unit: parsed.unit || "pieces",
      costPrice: Number(parsed.costPrice) || 0,
      sellingPrice: Number(parsed.sellingPrice) || 0,
    };
  } catch {
    throw new Error("Could not understand the image. Please try a clearer photo.");
  }
}