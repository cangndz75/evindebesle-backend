const express = require("express");
const Iyzipay = require("iyzipay");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();

const router = express.Router();
const bodyParser = require("body-parser");
router.use("/callback", bodyParser.urlencoded({ extended: false }));

const formatDateForIyzipay = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
};

// Ödeme başlatma
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
    callbackUrl: `${process.env.NEXT_PUBLIC_API_URL}/api/payment/callback?appointmentId=${draftAppointmentId}`,
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

  console.log("📥 3D ödeme başlatılıyor:", { draftAppointmentId, finalPrice });
  console.log("📤 Oluşturulan callbackUrl:", request.callbackUrl);

  iyzipay.threedsInitialize.create(request, (err, result) => {
    if (err || result.status !== "success") {
      console.error("❌ 3D başlatma hatası:", err || result);
      return res
        .status(500)
        .json({ error: result?.errorMessage || "3D başlatılamadı" });
    }

    const token = result.token;
    console.log("🔑 Iyzico Token:", token);
    console.log("📄 Orijinal threeDSHtmlContent:", result.threeDSHtmlContent);

    const encodedHtml = Buffer.from(result.threeDSHtmlContent, "utf-8").toString("base64");
    return res.json({ paymentPageHtml: encodedHtml, token });
  });
});

// Callback
router.post("/callback", async (req, res) => {
  console.log("🔄 CALLBACK GELDİ");
  console.log("➡️ BODY:", req.body);
  console.log("➡️ QUERY:", req.query);

  const { paymentId, conversationId, status } = req.body;
  const { appointmentId } = req.query;
  const effectiveAppointmentId = appointmentId;

  console.log("🔍 Callback verileri:", { paymentId, conversationId, status, effectiveAppointmentId });

  const redirectBase = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  if (!paymentId || !conversationId || !effectiveAppointmentId) {
    console.warn("⚠️ Eksik callback verisi:", {
      paymentId,
      conversationId,
      effectiveAppointmentId,
    });
    return res.status(400).send("Eksik veri");
  }

  if (status !== "success") {
    console.error("❌ Ödeme durumu başarısız:", status);
    return res.redirect(`${redirectBase}/fail`);
  }

  const iyzipay = new Iyzipay({
    apiKey: process.env.IYZIPAY_API_KEY,
    secretKey: process.env.IYZIPAY_SECRET_KEY,
    uri: process.env.IYZIPAY_BASE_URL || "https://sandbox-api.iyzipay.com",
  });

  const request = {
    locale: Iyzipay.LOCALE.TR,
    conversationId,
    paymentId,
  };

  iyzipay.payment.retrieve(request, async (err, result) => {
    if (err || result.status !== "success") {
      console.error("❌ Ödeme onayı başarısız:", err || result);
      return res.redirect(`${redirectBase}/fail`);
    }

    try {
      const requestBody = {
        appointmentId: effectiveAppointmentId,
        paidPrice: result.paidPrice,
        conversationId: result.conversationId,
      };
      console.log("📤 Complete isteği gönderiliyor:", requestBody); // Gönderilen veriyi logla

      const completeResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/payment/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!completeResponse.ok) {
        const errorText = await completeResponse.text();
        console.error("❌ Complete endpoint hatası:", {
          status: completeResponse.status,
          statusText: completeResponse.statusText,
          body: errorText,
        });
        throw new Error("Randevu tamamlanamadı.");
      }

      const completeData = await completeResponse.json();
      console.log("🟢 Frontend'den gelen yanıt:", completeData);

      if (completeData.success && completeData.appointmentId) {
        return res.redirect(
          `${redirectBase}/success?appointmentId=${completeData.appointmentId}&paidPrice=${result.paidPrice}`
        );
      } else {
        throw new Error("Randevu oluşturma başarısız.");
      }
    } catch (error) {
      console.error("⚠️ Randevu güncelleme hatası:", error);
      return res.redirect(`${redirectBase}/fail`);
    }
  });
});

module.exports = router;