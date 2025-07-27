const express = require("express");
const Iyzipay = require("iyzipay");
const { v4: uuidv4 } = require("uuid");
const bodyParser = require("body-parser");
const cors = require("cors");
require("dotenv").config();

const router = express.Router();

router.use(bodyParser.urlencoded({ extended: false }));
router.use(bodyParser.json());

const formatDateForIyzipay = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
};

// Ödeme başlatma (mevcut kod, threeDSHtmlContent düzenlemesi zaten var)
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
    console.warn("⚠️ Eksik veri:", { draftAppointmentId, price });
    return res
      .status(400)
      .json({ error: "Eksik veri: draftAppointmentId veya price yok." });
  }

  const finalPrice = parseFloat(price);
  if (isNaN(finalPrice) || finalPrice <= 0) {
    console.warn("⚠️ Geçersiz fiyat:", price);
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
    callbackUrl: `${process.env.API_URL}/api/payment/callback?appointmentId=${draftAppointmentId}`,
    threeDSVersion: "2",
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
      ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1",
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

  iyzipay.threedsInitialize.create(request, (err, resultRaw) => {
    if (err) {
      console.error("❌ 3D başlatma hatası:", err);
      return res
        .status(500)
        .json({ error: "3D başlatma sırasında hata oluştu" });
    }

    let result;
    try {
      result = typeof resultRaw === "string" ? JSON.parse(resultRaw) : resultRaw;
    } catch (parseError) {
      console.error("❌ Yanıt JSON parse edilemedi:", parseError);
      return res
        .status(500)
        .json({ error: "Ödeme ağ geçidinden geçersiz yanıt alındı." });
    }

    if (result.status !== "success") {
      console.error("❌ 3D başlatma başarısız:", result);
      return res
        .status(500)
        .json({ error: result.errorMessage || "3D başlatılamadı" });
    }

    let encodedHtml = result.threeDSHtmlContent;
    let decodedHtml = atob(encodedHtml);
    decodedHtml = decodedHtml.replace(
      /https:\/\/sandbox-api\.iyzipay\.com\/payment\/iyzipos\/callback3ds\/success\/\d/,
      `${process.env.API_URL}/api/payment/callback?appointmentId=${draftAppointmentId}`
    );
    decodedHtml = decodedHtml.replace(
      /https:\/\/sandbox-api\.iyzipay\.com\/payment\/mock\/confirm3ds/,
      `${process.env.API_URL}/api/payment/callback?appointmentId=${draftAppointmentId}`
    );
    encodedHtml = Buffer.from(decodedHtml).toString("base64");

    console.log("🔑 Token:", result.token || "Yok");
    console.log("📄 Düzenlenmiş HTML:", decodedHtml);

    return res.json({
      paymentPageHtml: encodedHtml,
      token: result.token || null,
    });
  });
});

// Callback
router.post("/callback", cors({ origin: "*" }), async (req, res) => {
  console.log("🔄 CALLBACK GELDİ", {
    body: JSON.stringify(req.body, null, 2),
    query: JSON.stringify(req.query, null, 2),
    url: req.originalUrl,
  });

  try {
    const {
      paymentId,
      paymentConversationId,
      conversationId,
      status,
      mdStatus,
      draftAppointmentId,
      appointmentId: bodyAppointmentId,
    } = req.body;
    const { appointmentId: queryAppointmentId } = req.query;
    const effectiveConversationId = paymentConversationId || conversationId;
    const effectiveAppointmentId = queryAppointmentId || draftAppointmentId || bodyAppointmentId;
    const redirectBase = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    console.log("🔍 Callback verileri:", {
      paymentId,
      conversationId: effectiveConversationId,
      status,
      mdStatus,
      effectiveAppointmentId,
    });

    if (!paymentId || !effectiveConversationId || !effectiveAppointmentId) {
      console.warn("⚠️ Eksik callback verisi:", {
        paymentId,
        effectiveConversationId,
        effectiveAppointmentId,
      });
      return res.redirect(`${redirectBase}/fail?reason=missing_callback_data`);
    }
    if (status !== "success" && status !== "CALLBACK_THREEDS") {
      console.error("❌ Ödeme durumu başarısız:", status);
      return res.redirect(
        `${redirectBase}/fail?reason=payment_failed&status=${status}`
      );
    }

    const iyzipay = new Iyzipay({
      apiKey: process.env.IYZIPAY_API_KEY,
      secretKey: process.env.IYZIPAY_SECRET_KEY,
      uri: process.env.IYZIPAY_BASE_URL || "https://sandbox-api.iyzipay.com",
    });

    const request = {
      locale: Iyzipay.LOCALE.TR,
      conversationId: effectiveConversationId, // Düzeltildi
      paymentId,
    };

    const result = await new Promise((resolve, reject) => {
      iyzipay.payment.retrieve(request, (err, result) => {
        if (err) return reject(err);
        resolve(result);
      });
    });

    if (result.status !== "success") {
      console.error("❌ Ödeme onayı başarısız:", result);
      return res.redirect(`${redirectBase}/fail?reason=payment_verification_failed`);
    }

    const paidPrice = parseFloat(result.paidPrice || result.price || "0.00");
    if (isNaN(paidPrice) || paidPrice <= 0) {
      console.error("❌ Geçersiz paidPrice:", result.paidPrice || result.price);
      return res.redirect(`${redirectBase}/fail?reason=invalid_paid_price`);
    }

    const requestBody = {
      appointmentId: effectiveAppointmentId, // /api/payment/complete bunu bekliyor
      paidPrice,
      conversationId: effectiveConversationId,
      paymentId,
    };

    console.log("📤 Complete isteği gönderiliyor:", requestBody);

    const completeResponse = await fetch(
      `${process.env.NEXT_PUBLIC_SITE_URL}/api/payment/complete`, // Doğru endpoint
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      }
    );

    console.log("📥 Complete yanıt durumu:", {
      status: completeResponse.status,
      statusText: completeResponse.statusText,
    });

    if (!completeResponse.ok) {
      const errorText = await completeResponse.text();
      console.error("❌ Complete endpoint hatası:", {
        status: completeResponse.status,
        statusText: completeResponse.statusText,
        body: errorText,
      });
      return res.redirect(
        `${redirectBase}/fail?reason=appointment_update_failed&error=${encodeURIComponent(errorText)}`
      );
    }

    const completeData = await completeResponse.json();
    console.log("🟢 Frontend'den gelen yanıt:", completeData);

    if (completeData.success && completeData.appointmentId) {
      return res.redirect(
        `${redirectBase}/success?appointmentId=${completeData.appointmentId}&paidPrice=${paidPrice}`
      );
    } else {
      throw new Error("Randevu oluşturma başarısız.");
    }
  } catch (err) {
    console.error("🔥 Callback hatası:", err);
    return res.redirect(
      `${redirectBase}/fail?reason=internal_error&error=${encodeURIComponent(err.message)}`
    );
  }
});

module.exports = router;