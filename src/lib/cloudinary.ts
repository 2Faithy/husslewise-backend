import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function uploadPaymentProof(base64Image: string): Promise<string> {
  const result = await cloudinary.uploader.upload(base64Image, {
    folder: "husslewise/payment-proofs",
    resource_type: "image",
  });
  return result.secure_url;
}