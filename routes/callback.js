const express = require("express");
const Iyzipay = require("iyzipay");

const router = express.Router();

const createIyzipayClient = () => {
  return new Iyzipay({
    apiKey: process.env.IYZIPAY_API_KEY,
    secretKey: process.env.IYZIPAY_SECRET_KEY,
    uri: process.env.IYZIPAY_BASE_URL || "https://sandbox-api.iyzipay.com",
  });
};

router.post("/", async (req, res) => {
  const { token, paymentId, conversationId } = req.body;
  const appointmentId = req.query.appointmentId;
  const redirectBase = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  console.log("📥 Callback verisi:", {
    token,
    paymentId,
    conversationId,
    appointmentId,
  });

  if ((!token && !paymentId) || !conversationId || !appointmentId) {
    console.warn("⚠️ Eksik veri:", { token, paymentId, conversationId, appointmentId });
    return res.status(400).send("Eksik veri");
  }

  const iyzipay = createIyzipayClient();

  const request = {
    locale: Iyzipay.LOCALE.TR,
    conversationId,
    ...(token ? { token } : { paymentId }), // token varsa onu, yoksa paymentId'yi kullan
  };

  iyzipay.threedsPayment.create(request, async (err, result) => {
    if (err || result.status !== "success") {
      console.error("❌ 3D onay hatası:", err || result);
      return res.redirect(`${redirectBase}/payment-failed`);
    }

    console.log("✅ 3D onay başarılı:", {
      appointmentId,
      paidPrice: result.paidPrice,
    });

    // ✅ Randevuyu güncelle
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/payment/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appointmentId,
          paidPrice: result.paidPrice,
        }),
      });
      console.log("🟢 Randevu durumu COMPLETED olarak güncellendi.");
    } catch (updateErr) {
      console.error("⚠️ Randevu güncelleme hatası:", updateErr);
    }

    return res.redirect(
      `${redirectBase}/success?appointmentId=${appointmentId}&paidPrice=${result.paidPrice}`
    );
  });
});

module.exports = router;
