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
        name: "Profesyonel Hizmet",
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
      result =
        typeof resultRaw === "string" ? JSON.parse(resultRaw) : resultRaw;
    } catch (parseError) {
      console.error("❌ Yanıt JSON parse edilemedi:", parseError);
      return res.status(500).json({ error: "Geçersiz JSON" });
    }

    console.log("📦 threedsInitialize sonucu:", result);

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
    decodedHtml = decodedHtml.replace(
      /https:\/\/sandbox-api\.iyzipay\.com\/payment\/iyzipos\/callback3ds\/failure\/\d/,
      `${process.env.API_URL}/api/payment/callback?appointmentId=${draftAppointmentId}`
    );
    encodedHtml = Buffer.from(decodedHtml).toString("base64");

    console.log("🔑 Token:", result.token || "Yok");
    console.log("📄 Düzenlenmiş HTML:", decodedHtml);

    return res.json({
      paymentPageHtml: encodedHtml,
      paymentId: result.paymentId, // paymentId'yi istemciye döndür
      token: result.token || null,
    });
  });
});

router.get("/callback", cors({ origin: "*" }), (req, res) => {
  const redirectBase =
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  console.log("⚠️ GET isteği alındı /api/payment/callback", {
    query: JSON.stringify(req.query, null, 2),
    url: req.originalUrl,
  });
  return res.redirect(
    `${redirectBase}/fail?reason=invalid_request_method&error=${encodeURIComponent("GET isteği desteklenmiyor, yalnızca POST kabul edilir.")}`
  );
});

router.post("/callback", cors({ origin: "*" }), async (req, res) => {
  const redirectBase =
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  console.log("🔄 CALLBACK GELDİ");
  console.log("📥 Body:", JSON.stringify(req.body, null, 2));
  console.log("📥 Query:", JSON.stringify(req.query, null, 2));
  console.log("🌐 URL:", req.originalUrl);

  try {
    const {
      smsCode,
      orderId,
      PaReq,
      isCancel,
      paymentId: bodyPaymentId,
      conversationId,
      appointmentId: bodyAppointmentId,
    } = req.body;
    const { appointmentId: queryAppointmentId } = req.query;

    const effectiveAppointmentId = queryAppointmentId || bodyAppointmentId;
    const effectiveConversationId = conversationId || uuidv4();

    console.log("🧠 appointmentId:", effectiveAppointmentId);
    console.log("🧠 conversationId:", effectiveConversationId);

    if (!effectiveAppointmentId) {
      console.warn("⚠️ appointmentId eksik.");
      return res.redirect(`${redirectBase}/fail?reason=missing_appointment_id`);
    }

    if (isCancel === "1") {
      console.warn("⚠️ Kullanıcı ödemeyi iptal etti.");
      return res.redirect(`${redirectBase}/fail?reason=payment_cancelled`);
    }

    const derivedPaymentId =
      bodyPaymentId || orderId?.match(/mock\d+-(\d+)/)?.[1];
    console.log("🧾 orderId:", orderId);
    console.log("🔑 Türetilmiş paymentId:", derivedPaymentId);

    if (!derivedPaymentId) {
      console.warn("⚠️ paymentId bulunamadı.");
      return res.redirect(`${redirectBase}/fail?reason=missing_payment_id`);
    }

    const iyzipay = new Iyzipay({
      apiKey: process.env.IYZIPAY_API_KEY,
      secretKey: process.env.IYZIPAY_SECRET_KEY,
      uri: process.env.IYZIPAY_BASE_URL || "https://sandbox-api.iyzipay.com",
    });

    const authRequest = {
      locale: Iyzipay.LOCALE.TR,
      conversationId: effectiveConversationId,
      paymentId: derivedPaymentId,
    };

    console.log("📤 threedsAuth gönderiliyor:", authRequest);

    const paymentResult = await new Promise((resolve, reject) => {
      Iyzipay.ThreeDSAuth.create(authRequest, (err, result) => {
        if (err) {
          console.error("❌ threedsAuth hata:", err);
          return reject(err);
        }

        let parsed;
        try {
          parsed = typeof result === "string" ? JSON.parse(result) : result;
        } catch (e) {
          console.error("❌ threedsAuth sonucu parse edilemedi:", result);
          return reject(e);
        }

        resolve(parsed);
      });
    });

    console.log("📦 payment.retrieve sonucu:", paymentResult);

    if (paymentResult.status !== "success") {
      console.error("❌ payment.retrieve başarısız:", {
        status: paymentResult.status,
        errorMessage: paymentResult.errorMessage,
        errorCode: paymentResult.errorCode,
      });
      return res.redirect(
        `${redirectBase}/fail?reason=payment_verification_failed&error=${encodeURIComponent(paymentResult.errorMessage || "Doğrulama başarısız")}`
      );
    }

    const paidPrice = parseFloat(
      paymentResult.paidPrice || paymentResult.price || "0.00"
    );
    console.log("💰 paidPrice:", paidPrice);

    if (isNaN(paidPrice) || paidPrice <= 0) {
      console.error("❌ Geçersiz fiyat değeri:", paidPrice);
      return res.redirect(`${redirectBase}/fail?reason=invalid_paid_price`);
    }

    const completeBody = {
      appointmentId: effectiveAppointmentId,
      paidPrice,
      conversationId: paymentResult.conversationId || effectiveConversationId,
    };

    console.log("📤 /api/payment/complete gönderiliyor:", completeBody);

    const completeResponse = await fetch(
      `${redirectBase}/api/payment/complete`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(completeBody),
      }
    );

    console.log("📥 /api/payment/complete yanıt:", {
      status: completeResponse.status,
      statusText: completeResponse.statusText,
    });

    if (!completeResponse.ok) {
      const errorText = await completeResponse.text();
      console.error("❌ /api/payment/complete başarısız:", errorText);
      return res.redirect(
        `${redirectBase}/fail?reason=appointment_update_failed&error=${encodeURIComponent(errorText)}`
      );
    }

    const completeData = await completeResponse.json();
    console.log("🟢 Başarılı complete yanıtı:", completeData);

    if (completeData.success && completeData.appointmentId) {
      console.log("✅ Ödeme işlemi tamamlandı ve randevu oluşturuldu.");
      return res.redirect(
        `${redirectBase}/success?appointmentId=${completeData.appointmentId}&paidPrice=${paidPrice}`
      );
    }

    throw new Error("Randevu oluşturma başarısız.");
  } catch (err) {
    console.error("🔥 callback işleminde genel hata:", err);
    return res.redirect(
      `${redirectBase}/fail?reason=internal_error&error=${encodeURIComponent(err.message)}`
    );
  }
});

module.exports = router;
