import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

export function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits
}

export async function sendVerificationEmail(to: string, code: string) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    throw new Error("GMAIL_USER or GMAIL_APP_PASSWORD environment variable is missing.");
  }

  await transporter.sendMail({
    from: `"Husslewise" <${process.env.GMAIL_USER}>`,
    to,
    subject: "Verify your Husslewise account",
    html: `
      <div style="font-family: sans-serif; padding: 24px; color: #0e1b1a;">
        <h2 style="color: #1c5b56;">Verify your email</h2>
        <p>Enter this code in the app to activate your Husslewise account:</p>
        <p style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #1c5b56;">${code}</p>
        <p style="color: #666; font-size: 13px;">This code expires in 15 minutes. If you didn't sign up for Husslewise, you can ignore this email.</p>
      </div>
    `,
  });
}

export async function sendPasswordResetEmail(to: string, code: string) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    throw new Error("GMAIL_USER or GMAIL_APP_PASSWORD environment variable is missing.");
  }

  await transporter.sendMail({
    from: `"Husslewise" <${process.env.GMAIL_USER}>`,
    to,
    subject: "Reset your Husslewise password",
    html: `
      <div style="font-family: sans-serif; padding: 24px; color: #0e1b1a;">
        <h2 style="color: #1c5b56;">Reset your password</h2>
        <p>Enter this code in the app to reset your Husslewise password:</p>
        <p style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #1c5b56;">${code}</p>
        <p style="color: #666; font-size: 13px;">This code expires in 15 minutes. If you didn't request a password reset, you can ignore this email — your password will not be changed.</p>
      </div>
    `,
  });
}

export async function sendNewOrderEmail(
  to: string,
  businessName: string,
  customerName: string,
  total: number,
  hasProof: boolean
) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return;

  await transporter.sendMail({
    from: `"Husslewise" <${process.env.GMAIL_USER}>`,
    to,
    subject: `New order on your Husslewise store!`,
    html: `
      <div style="font-family: sans-serif; padding: 24px; color: #0e1b1a;">
        <h2 style="color: #1c5b56;">You've got a new order 🎉</h2>
        <p><strong>${customerName}</strong> just placed an order on your ${businessName} store.</p>
        <p style="font-size: 22px; font-weight: bold; color: #1c5b56;">₦${total.toLocaleString('en-NG')}</p>
        <p>${hasProof ? 'They uploaded a payment proof — check it and confirm in your Storefront Manager.' : 'They chose to pay on pickup — call them to arrange collection.'}</p>
        <p style="color: #666; font-size: 13px;">Log in to Husslewise to view the full order.</p>
      </div>
    `,
  });
}

export async function sendRegistrationReceivedEmail(
  to: string,
  businessName: string,
  ownerFullName: string
) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return;

  await transporter.sendMail({
    from: `"Husslewise" <${process.env.GMAIL_USER}>`,
    to,
    subject: `We've received your CAC registration application`,
    html: `
      <div style="font-family: sans-serif; padding: 24px; color: #0e1b1a;">
        <h2 style="color: #1c5b56;">Application received ✅</h2>
        <p>Hi ${ownerFullName},</p>
        <p>We've received your CAC registration application for <strong>${businessName}</strong> and your payment.</p>
        <p>Our team is now reviewing your documents. Here's what happens next:</p>
        <ol style="color: #333; line-height: 1.8;">
          <li>Document Review (1–2 business days)</li>
          <li>Filed with CAC (3–5 business days)</li>
          <li>Approved — your certificate and RC/BN number will be emailed to you</li>
        </ol>
        <p>You can track progress anytime in your Husslewise app under Business Registration.</p>
        <p style="color: #666; font-size: 13px;">Estimated total turnaround: 7–10 business days.</p>
      </div>
    `,
  });
}

export async function sendStaffInviteEmail(to: string, staffName: string, businessName: string, inviteLink: string) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return;

  await transporter.sendMail({
    from: `"Husslewise" <${process.env.GMAIL_USER}>`,
    to,
    subject: `${businessName} invited you to Husslewise`,
    html: `
      <div style="font-family: sans-serif; padding: 24px; color: #0e1b1a;">
        <h2 style="color: #1c5b56;">You've been invited!</h2>
        <p>Hi ${staffName},</p>
        <p><strong>${businessName}</strong> has added you as a team member on Husslewise.</p>
        <p>Click below to set your password and get started:</p>
        <p><a href="${inviteLink}" style="display:inline-block; background:#1c5b56; color:#ecba91; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:bold;">Set Your Password</a></p>
        <p style="color: #666; font-size: 13px;">This link expires in 7 days. If you weren't expecting this, you can ignore this email.</p>
      </div>
    `,
  });
}