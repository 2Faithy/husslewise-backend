import { Router } from "express";
import bcrypt from "bcrypt";
import { prisma } from "../lib/prisma";
import { generateVerificationCode, sendVerificationEmail, sendPasswordResetEmail } from "../lib/email";
import { signAccessToken, signRefreshToken, verifyRefreshToken, JwtPayload } from "../lib/jwt";

const router = Router();

router.post("/signup", async (req, res) => {
  try {
    const { businessName, fullName, email, phone, password } = req.body;

    if (!businessName || !fullName || !email || !phone || !password) {
      return res.status(400).json({ error: "All fields are required." });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }

    const existing = await prisma.business.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const code = generateVerificationCode();
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    const baseSlug = businessName.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-");
    const storefrontSlug = `${baseSlug}-${Math.floor(Math.random() * 10000)}`;

    const business = await prisma.business.create({
      data: {
        businessName,
        fullName,
        email,
        passwordHash,
        phone,
        storefrontSlug,
        emailVerified: false,
        verificationCode: code,
        verificationCodeExpires: expires,
      },
    });

    await sendVerificationEmail(email, code);

    res.status(201).json({
      message: "Account created. Check your email for a verification code.",
      businessId: business.id,
      email: business.email,
    });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ error: "Something went wrong creating your account." });
  }
});

router.post("/verify-email", async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ error: "Email and code are required." });
    }

    const business = await prisma.business.findUnique({ where: { email } });
    if (!business) {
      return res.status(404).json({ error: "No account found for this email." });
    }
    if (business.emailVerified) {
      return res.status(400).json({ error: "This account is already verified." });
    }
    if (!business.verificationCode || !business.verificationCodeExpires) {
      return res.status(400).json({ error: "No pending verification for this account." });
    }
    if (business.verificationCodeExpires < new Date()) {
      return res.status(400).json({ error: "Code expired. Please request a new one." });
    }
    if (business.verificationCode !== code) {
      return res.status(400).json({ error: "Incorrect code." });
    }

    await prisma.business.update({
      where: { email },
      data: {
        emailVerified: true,
        verificationCode: null,
        verificationCodeExpires: null,
      },
    });

    res.json({ message: "Email verified. You can now log in." });
  } catch (err) {
    console.error("Verify email error:", err);
    res.status(500).json({ error: "Something went wrong verifying your email." });
  }
});

router.post("/resend-verification", async (req, res) => {
  try {
    const { email } = req.body;
    const business = await prisma.business.findUnique({ where: { email } });

    if (!business) {
      return res.status(404).json({ error: "No account found for this email." });
    }
    if (business.emailVerified) {
      return res.status(400).json({ error: "This account is already verified." });
    }

    const code = generateVerificationCode();
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    await prisma.business.update({
      where: { email },
      data: { verificationCode: code, verificationCodeExpires: expires },
    });

    await sendVerificationEmail(email, code);
    res.json({ message: "A new code has been sent." });
  } catch (err) {
    console.error("Resend verification error:", err);
    res.status(500).json({ error: "Something went wrong resending the code." });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const business = await prisma.business.findUnique({ where: { email } });

    if (business) {
      const passwordMatch = await bcrypt.compare(password, business.passwordHash);
      if (!passwordMatch) {
        return res.status(401).json({ error: "Invalid email or password." });
      }
      if (!business.emailVerified) {
        return res.status(403).json({ error: "Please verify your email before logging in.", code: "EMAIL_NOT_VERIFIED" });
      }

      const accessToken = signAccessToken({ businessId: business.id });
      const refreshToken = signRefreshToken({ businessId: business.id });

      return res.json({
        message: "Login successful.",
        accessToken,
        refreshToken,
        userType: "owner",
        business: {
          id: business.id,
          businessName: business.businessName,
          fullName: business.fullName,
          email: business.email,
          onboardingComplete: business.onboardingComplete,
        },
      });
    }

    // Not a business owner — check if this is a staff login using findFirst (or findUnique if email is @unique)
    const staff = await prisma.staff.findFirst({ where: { email } });
    if (!staff) {
      return res.status(401).json({ error: "Invalid email or password." });
    }
    if (!staff.passwordHash) {
      return res.status(403).json({ error: "Please accept your invite email and set a password first." });
    }
    if (staff.status === "suspended") {
      return res.status(403).json({ error: "Your access has been suspended. Contact your business owner." });
    }

    const passwordMatch = await bcrypt.compare(password, staff.passwordHash);
    if (!passwordMatch) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const business2 = await prisma.business.findUnique({ where: { id: staff.businessId } });

    const accessToken = signAccessToken({ businessId: staff.businessId, staffId: staff.id, role: staff.role });
    const refreshToken = signRefreshToken({ businessId: staff.businessId, staffId: staff.id, role: staff.role });

    res.json({
      message: "Login successful.",
      accessToken,
      refreshToken,
      userType: "staff",
      role: staff.role,
      staffName: staff.name,
      business: {
        id: staff.businessId,
        businessName: business2?.businessName || "",
        fullName: staff.name,
        email: staff.email,
        onboardingComplete: true, // staff never go through onboarding
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Something went wrong logging in." });
  }
});

router.post("/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: "Refresh token is required." });
    }

    let payload: JwtPayload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      return res.status(401).json({ error: "Invalid or expired refresh token." });
    }

    const business = await prisma.business.findUnique({ where: { id: payload.businessId } });
    if (!business) {
      return res.status(401).json({ error: "Account no longer exists." });
    }

    const accessToken = signAccessToken({
      businessId: business.id,
      staffId: payload.staffId,
      role: payload.role,
    });
    res.json({ accessToken });
  } catch (err) {
    console.error("Refresh error:", err);
    res.status(500).json({ error: "Something went wrong refreshing your session." });
  }
});

router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email is required." });
    }

    const business = await prisma.business.findUnique({ where: { email } });

    if (!business) {
      return res.json({ message: "If an account exists for this email, a reset code has been sent." });
    }

    const code = generateVerificationCode();
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    await prisma.business.update({
      where: { email },
      data: { resetCode: code, resetCodeExpires: expires },
    });

    await sendPasswordResetEmail(email, code);

    res.json({ message: "If an account exists for this email, a reset code has been sent." });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: "Email, code, and new password are required." });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }

    const business = await prisma.business.findUnique({ where: { email } });
    if (!business) {
      return res.status(404).json({ error: "No account found for this email." });
    }
    if (!business.resetCode || !business.resetCodeExpires) {
      return res.status(400).json({ error: "No pending password reset for this account." });
    }
    if (business.resetCodeExpires < new Date()) {
      return res.status(400).json({ error: "Code expired. Please request a new one." });
    }
    if (business.resetCode !== code) {
      return res.status(400).json({ error: "Incorrect code." });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await prisma.business.update({
      where: { email },
      data: {
        passwordHash,
        resetCode: null,
        resetCodeExpires: null,
      },
    });

    res.json({ message: "Password reset successfully. You can now log in." });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ error: "Something went wrong resetting your password." });
  }
});

export default router;