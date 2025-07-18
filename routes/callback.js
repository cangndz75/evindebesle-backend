const express = require("express");
const Iyzipay = require("iyzipay");
const bodyParser = require("body-parser");

const router = express.Router();
router.use(bodyParser.urlencoded({ extended: false })); // sadece bu route için!

const createIyzipayClient = () => {
  return new Iyzipay({
    apiKey: process.env.IYZIPAY_API_KEY,
    secretKey: process.env.IYZIPAY_SECRET_KEY,
    uri: process.env.IYZIPAY_BASE_URL || "https://sandbox-api.iyzipay.com",
  });
};

router.post("/", async (req, res) => {
  const { token, conversationId } = req.body;
  const appointmentId = req.query.appointmentId;
  const redirectBase = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  console.log("📥 Gelen callback verisi:", { token, conversationId, appointmentId });

  if (!token || !conversationId || !appointmentId) {
    console.warn("⚠️ Eksik veri:", { token, conversationId, appointmentId });
    return res.status(400).send("Eksik veri");
  }

  const iyzipay = createIyzipayClient();

  iyzipay.payment.retrieve(
    {
      locale: Iyzipay.LOCALE.TR,
      conversationId,
      token,
    },
    (err1, retrieveResult) => {
      if (err1 || retrieveResult?.status !== "success" || !retrieveResult.paymentId) {
        console.error("❌ retrieve hatası:", err1 || retrieveResult);
        return res.redirect(`${redirectBase}/payment-failed`);
      }

      const paymentId = retrieveResult.paymentId;

      iyzipay.threedsPayment.create(
        {
          locale: Iyzipay.LOCALE.TR,
          token,
          conversationId,
          paymentId,
        },
        (err2, result) => {
          if (err2 || result.status !== "success") {
            console.error("❌ 3D onay hatası:", err2 || result);
            return res.redirect(`${redirectBase}/payment-failed`);
          }

          console.log("✅ 3D onay başarılı:", {
            appointmentId,
            paidPrice: result.paidPrice,
            card: result.paymentCard?.cardNumber,
          });

          return res.redirect(
            `${redirectBase}/payment-success?appointmentId=${appointmentId}&paidPrice=${result.paidPrice}`
          );
        }
      );
    }
  );
});

module.exports = router;
