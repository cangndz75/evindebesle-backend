const express = require("express");
const Iyzipay = require("iyzipay");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();

const router = express.Router();

const formatDateForIyzipay = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
};

// 1️⃣ Ödeme Başlatma
router.post("/initiate", (req, res) => {
  const {
    cardHolderName,
    cardNumber,
    expireMonth,
    expireYear,
    cvc,
    price,
    draftAppointmentId,
  } = req.body;

  if (!draftAppointmentId || !price) {
    return res
      .status(400)
      .json({ error: "Eksik veri: draftAppointmentId veya price yok." });
  }

  const finalPrice = parseFloat(price);
  if (isNaN(finalPrice) || finalPrice <= 0) {
    return res.status(400).json({ error: "Geçersiz fiyat." });
  }

  const iyzipay = new Iyzipay({
    apiKey: process.env.IYZIPAY_API_KEY,
    secretKey: process.env.IYZIPAY_SECRET_KEY,
    uri: process.env.IYZIPAY_BASE_URL || "https://sandbox-api.iyzipay.com",
  });

  const conversationId = uuidv4();

  const request = {
    locale: Iyzipay.LOCALE.TR,
    conversationId,
    price: finalPrice.toFixed(2),
    paidPrice: finalPrice.toFixed(2),
    currency: Iyzipay.CURRENCY.TRY,
    installment: "1",
    basketId: draftAppointmentId,
    paymentChannel: Iyzipay.PAYMENT_CHANNEL.WEB,
    paymentGroup: Iyzipay.PAYMENT_GROUP.PRODUCT,
    callbackUrl: `${process.env.NEXT_PUBLIC_API_URL}/api/payment/callback?draftAppointmentId=${draftAppointmentId}`,
    paymentCard: {
      cardHolderName: cardHolderName || "Test User",
      cardNumber: (cardNumber || "").replace(/\s/g, ""),
      expireMonth: expireMonth || "01",
      expireYear: expireYear || "30",
      cvc: cvc || "000",
      registerCard: 0,
    },
    buyer: {
      id: "BY789",
      name: "Test",
      surname: "User",
      gsmNumber: "+905350000000",
      email: "test@iyzico.com",
      identityNumber: "74300864791",
      lastLoginDate: formatDateForIyzipay(),
      registrationDate: formatDateForIyzipay(),
      registrationAddress: "Test Mah. No:1",
      ip:
        req.headers["x-forwarded-for"] ||
        req.socket.remoteAddress ||
        "127.0.0.1",
      city: "İstanbul",
      country: "Türkiye",
      zipCode: "34700",
    },
    shippingAddress: {
      contactName: "Test User",
      city: "İstanbul",
      country: "Türkiye",
      address: "Test Mah. No:1",
      zipCode: "34700",
    },
    billingAddress: {
      contactName: "Test User",
      city: "İstanbul",
      country: "Türkiye",
      address: "Test Mah. No:1",
      zipCode: "34700",
    },
    basketItems: [
      {
        id: "BI101",
        name: "Evcil Hayvan Hizmeti",
        category1: "Hizmet",
        itemType: Iyzipay.BASKET_ITEM_TYPE.VIRTUAL,
        price: finalPrice.toFixed(2),
      },
    ],
  };

  console.log("📥 3D ödeme isteği:", { draftAppointmentId, finalPrice });

  iyzipay.threedsInitialize.create(request, (err, result) => {
    if (err) {
      console.error("💥 3D başlatma hatası:", err);
      return res
        .status(500)
        .json({ error: "Sunucu hatası", detail: err.message });
    }

    if (result.status === "success") {
      return res.json({ paymentPageHtml: result.threeDSHtmlContent });
    } else {
      return res
        .status(400)
        .json({ error: result.errorMessage || "3D ödeme başlatılamadı" });
    }
  });
});

router.post(
  "/callback",
  express.urlencoded({ extended: false }),
  async (req, res) => {
    const { token, conversationId } = req.body;
    const draftAppointmentId =
      req.query.draftAppointmentId || req.query.appointmentId;
    const redirectBase =
      process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    if (!token || !conversationId || !draftAppointmentId) {
      console.warn("⚠️ Eksik callback verisi:", {
        token,
        conversationId,
        draftAppointmentId,
      });
      return res.status(400).send("Eksik veri");
    }

    const iyzipay = new Iyzipay({
      apiKey: process.env.IYZIPAY_API_KEY,
      secretKey: process.env.IYZIPAY_SECRET_KEY,
      uri: process.env.IYZIPAY_BASE_URL || "https://sandbox-api.iyzipay.com",
    });

    const request = {
      locale: Iyzipay.LOCALE.TR,
      conversationId,
      token,
    };

    iyzipay.threedsPayment.create(request, async (err, result) => {
      if (err || result.status !== "success") {
        console.error("❌ 3D ödeme onay hatası:", err || result);
        return res.redirect(`${redirectBase}/fail`);
      }

      try {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/payment/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            appointmentId: draftAppointmentId,
            paidPrice: result.paidPrice,
          }),
        });

        console.log("🟢 Randevu güncellendi.");
        return res.redirect(
          `${redirectBase}/success?appointmentId=${draftAppointmentId}&paidPrice=${result.paidPrice}`
        );
      } catch (updateErr) {
        console.error("⚠️ Güncelleme hatası:", updateErr);
        return res.redirect(`${redirectBase}/fail`);
      }
    });
  }
);


module.exports = router;
