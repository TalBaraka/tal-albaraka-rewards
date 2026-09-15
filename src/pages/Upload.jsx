import React from "react";
import { useNavigate } from "react-router-dom";
import Tesseract from "tesseract.js";
import { supabase } from "../lib/supabase";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MIN_WIDTH = 600;
const MIN_HEIGHT = 600;

function normalizeArabicDigits(text = "") {
  return text
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
}

function normalizeText(text = "") {
  return normalizeArabicDigits(text)
    .replace(/[ـ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeCompact(text = "") {
  return normalizeText(text).replace(/\s/g, "");
}

/**
 * تجهيز الصورة:
 * - تصغيرها
 * - قص الجزء العلوي الذي يحتوي على:
 *   الشعار، نوع الفاتورة، رقم الفاتورة، المتجر، التاريخ والرقم الضريبي
 */
async function prepareImage(file) {
  const bitmap = await createImageBitmap(file);

  const maxWidth = 1400;
  const scale = Math.min(1, maxWidth / bitmap.width);

  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d", {
    alpha: false,
    willReadFrequently: true,
  });

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  ctx.drawImage(bitmap, 0, 0, width, height);

  bitmap.close();

  // الجزء العلوي من الفاتورة هو الأهم للـ OCR
  const cropHeight = Math.round(height * 0.68);

  const crop = document.createElement("canvas");
  crop.width = width;
  crop.height = cropHeight;

  const cropCtx = crop.getContext("2d", {
    alpha: false,
  });

  cropCtx.fillStyle = "#ffffff";
  cropCtx.fillRect(0, 0, width, cropHeight);

  cropCtx.drawImage(
    canvas,
    0,
    0,
    width,
    cropHeight,
    0,
    0,
    width,
    cropHeight
  );

  return {
    fullCanvas: canvas,
    ocrCanvas: crop,
    width,
    height,
  };
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("تعذر تجهيز صورة الفاتورة."));
          return;
        }

        resolve(blob);
      },
      "image/jpeg",
      0.88
    );
  });
}

/**
 * استخراج رقم الفاتورة.
 *
 * الفاتورة المرجعية تحتوي على رقم بالشكل:
 * 15-04-1-2609205
 *
 * لذلك نبحث أولًا عن الأرقام المركبة، ثم الأنماط العادية.
 */
function extractInvoiceNumber(text) {
  const normalized = normalizeArabicDigits(text);

  const patterns = [
    /(?:رقم\s*(?:الفاتورة|الفاتوره)|invoice\s*(?:no|number|#)?)\s*[:：#-]?\s*([0-9]{1,5}(?:[-/][0-9]{1,5}){2,5})/i,

    /([0-9]{1,5}(?:[-/][0-9]{1,5}){2,5})/,

    /(?:رقم\s*(?:الفاتورة|الفاتوره)|invoice\s*(?:no|number|#)?)\D{0,20}([0-9]{4,20})/i,

    /(?:فاتورة)\D{0,20}([0-9]{4,20})/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);

    if (match?.[1]) {
      return match[1].replace(/\//g, "-").trim();
    }
  }

  return null;
}

function containsMerchant(text) {
  const normalized = normalizeText(text);
  const compact = normalizeCompact(text);

  return (
    normalized.includes("تل البركة") ||
    normalized.includes("تال البركة") ||
    compact.includes("تلبركة") ||
    compact.includes("تالبركة") ||
    compact.includes("مؤسسةتل") ||
    normalized.includes("tal albaraka") ||
    normalized.includes("tal al baraka") ||
    compact.includes("talalbaraka") ||
    compact.includes("talalbaraka")
  );
}

function containsTaxInvoice(text) {
  const normalized = normalizeText(text);
  const compact = normalizeCompact(text);

  return (
    normalized.includes("simplified tax invoice") ||
    compact.includes("simplifiedtaxinvoice") ||
    normalized.includes("فاتورة ضريبية مبسطة") ||
    compact.includes("فاتورةضريبيةمبسطة") ||
    normalized.includes("فاتوره ضريبيه مبسطه") ||
    compact.includes("فاتورہضريبيہمبسطہ")
  );
}

function containsVat(text) {
  const normalized = normalizeText(text);

  return (
    normalized.includes("vat") ||
    normalized.includes("ضريبة") ||
    normalized.includes("ضريبه") ||
    normalized.includes("15%") ||
    normalized.includes("15 %")
  );
}

function containsInvoiceStructure(text) {
  const normalized = normalizeText(text);

  let score = 0;

  if (
    normalized.includes("التاريخ") ||
    normalized.includes("date")
  ) {
    score++;
  }

  if (
    normalized.includes("الرقم الضريبي") ||
    normalized.includes("tax number") ||
    normalized.includes("vat number")
  ) {
    score++;
  }

  if (
    normalized.includes("الإجمالي") ||
    normalized.includes("الاجمالي") ||
    normalized.includes("total")
  ) {
    score++;
  }

  if (
    normalized.includes("السعر") ||
    normalized.includes("price")
  ) {
    score++;
  }

  if (
    normalized.includes("الكمية") ||
    normalized.includes("quantity")
  ) {
    score++;
  }

  if (
    normalized.includes("الصنف") ||
    normalized.includes("item")
  ) {
    score++;
  }

  return score >= 2;
}

/**
 * فحص سريع للـ QR / Barcode إذا كان المتصفح يدعم BarcodeDetector.
 *
 * عدم توفره لا يعني قبول الفاتورة تلقائيًا.
 */
async function detectCodes(canvas) {
  if (!("BarcodeDetector" in window)) {
    return {
      supported: false,
      detected: false,
    };
  }

  try {
    const detector = new window.BarcodeDetector({
      formats: ["qr_code", "code_128", "ean_13"],
    });

    const codes = await detector.detect(canvas);

    return {
      supported: true,
      detected: Array.isArray(codes) && codes.length > 0,
      codes,
    };
  } catch (error) {
    console.warn("Barcode detection unavailable:", error);

    return {
      supported: false,
      detected: false,
    };
  }
}

async function getImageDimensions(file) {
  const bitmap = await createImageBitmap(file);

  const result = {
    width: bitmap.width,
    height: bitmap.height,
  };

  bitmap.close();

  return result;
}

function getCustomerState() {
  try {
    return JSON.parse(
      localStorage.getItem("tal_state") || "{}"
    );
  } catch {
    return {};
  }
}

export default function Upload() {
  const navigate = useNavigate();

  const [loading, setLoading] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [message, setMessage] = React.useState("");
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState(false);

  async function handleFile(event) {
    const file = event.target.files?.[0];

    // السماح باختيار نفس الصورة مرة أخرى
    event.target.value = "";

    if (!file) {
      return;
    }

    setLoading(true);
    setProgress(2);
    setMessage("جاري تجهيز الصورة...");
    setError("");
    setSuccess(false);

    try {
      if (!file.type.startsWith("image/")) {
        throw new Error(
          "يرجى رفع صورة واضحة للفاتورة."
        );
      }

      if (file.size > MAX_FILE_SIZE) {
        throw new Error(
          "حجم الصورة كبير جدًا. الحد الأقصى 10 ميجابايت."
        );
      }

      setProgress(5);

      const dimensions = await getImageDimensions(file);

      if (
        dimensions.width < MIN_WIDTH ||
        dimensions.height < MIN_HEIGHT
      ) {
        throw new Error(
          "الصورة صغيرة أو غير واضحة. يرجى تصوير الفاتورة بصورة أوضح."
        );
      }

      setMessage("جاري تجهيز الفاتورة للفحص...");
      setProgress(10);

      const prepared = await prepareImage(file);

      /*
       * نستخدم الجزء العلوي فقط في OCR.
       * هذا يقلل وقت المعالجة بشكل كبير مقارنة بفحص الصورة كاملة.
       */
      const ocrImage = await canvasToBlob(
        prepared.ocrCanvas
      );

      setMessage("جاري قراءة بيانات الفاتورة...");
      setProgress(15);

      /*
       * OCR عربي + إنجليزي مرة واحدة فقط.
       *
       * PSM 6 مناسب للفاتورة ذات الكتل النصية المتعددة.
       */
      const result = await Tesseract.recognize(
        ocrImage,
        "ara+eng",
        {
          logger: (info) => {
            if (
              info.status === "recognizing text" &&
              typeof info.progress === "number"
            ) {
              const value =
                15 +
                Math.round(info.progress * 55);

              setProgress(
                Math.min(70, Math.max(15, value))
              );
            }
          },

          tessedit_pageseg_mode: 6,
        }
      );

      const text = result?.data?.text || "";

      if (!text.trim()) {
        throw new Error(
          "لم يتمكن النظام من قراءة الفاتورة. يرجى تصويرها بوضوح أكبر."
        );
      }

      setProgress(72);
      setMessage("جاري التحقق من بيانات الفاتورة...");

      const merchantOk = containsMerchant(text);
      const taxInvoiceOk = containsTaxInvoice(text);
      const vatOk = containsVat(text);
      const structureOk = containsInvoiceStructure(text);
      const invoiceNumber = extractInvoiceNumber(text);

      /*
       * فحص QR / Barcode سريع من الصورة الأصلية.
       */
      setProgress(76);

      const codeResult = await detectCodes(
        prepared.fullCanvas
      );

      /*
       * الفاتورة المرجعية:
       * - اسم المتجر
       * - Simplified Tax Invoice
       * - VAT
       * - رقم الفاتورة
       * - بنية الفاتورة
       *
       * لا نعتمد على كلمة واحدة فقط.
       */
      if (!merchantOk) {
        throw new Error(
          "لم يتم قبولها. يرجى رفع صورة للفواتير المعتمدة."
        );
      }

      if (!taxInvoiceOk) {
        throw new Error(
          "لم يتم قبولها. يرجى رفع صورة للفواتير المعتمدة."
        );
      }

      if (!vatOk) {
        throw new Error(
          "لم يتم قبولها. يرجى رفع صورة للفواتير المعتمدة."
        );
      }

      if (!structureOk) {
        throw new Error(
          "لم يتم قبولها. يرجى رفع صورة للفواتير المعتمدة."
        );
      }

      if (!invoiceNumber) {
        throw new Error(
          "تعذر قراءة رقم الفاتورة. يرجى رفع صورة أوضح للفاتورة."
        );
      }

      /*
       * إذا كان الجهاز يدعم QR/Barcode ولم يتم العثور عليه،
       * لا نرفض مباشرة لأن بعض المتصفحات لا تدعم BarcodeDetector.
       *
       * لكن لو تم العثور عليه، نسجل أنه موجود.
       */
      setProgress(82);
      setMessage(
        codeResult.detected
          ? "تم العثور على رمز الفاتورة. جاري التأكد من عدم استخدامها..."
          : "جاري التأكد من عدم استخدام الفاتورة من قبل..."
      );

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        throw new Error(
          "انتهت جلسة المستخدم. يرجى إعادة المحاولة."
        );
      }

      const customerId =
        localStorage.getItem("tal_customer_id");

      if (!customerId) {
        throw new Error(
          "لم يتم العثور على بيانات العميل."
        );
      }

      /*
       * رفع الصورة إلى Supabase Storage.
       */
      setProgress(85);
      setMessage("جاري حفظ صورة الفاتورة...");

      const extension =
        file.name
          .split(".")
          .pop()
          ?.toLowerCase() || "jpg";

      const filePath = `${
        session.user.id
      }/${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } =
        await supabase.storage
          .from("invoices")
          .upload(filePath, file, {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type,
          });

      if (uploadError) {
        throw uploadError;
      }

      /*
       * اعتماد الفاتورة عن طريق RPC.
       *
       * الـ RPC هو المسؤول عن:
       * - منع تكرار رقم الفاتورة
       * - زيادة العداد
       * - إعطاء الجائزة عند الفاتورة الرابعة
       */
      setProgress(90);
      setMessage(
        "جاري اعتماد الفاتورة والتأكد من عدم تكرارها..."
      );

      const {
        data,
        error: approveError,
      } = await supabase.rpc(
        "approve_invoice_and_update_customer",
        {
          p_customer_id: customerId,
          p_invoice_number: invoiceNumber,
          p_file_path: filePath,
          p_invoice_date: null,
          p_total_amount: null,
        }
      );

      if (approveError) {
        const errorText =
          approveError.message || "";

        if (
          errorText.includes(
            "تم استخدام هذه الفاتورة"
          ) ||
          errorText.includes("duplicate") ||
          errorText.includes("unique")
        ) {
          throw new Error(
            "هذه الفاتورة تم استخدامها من قبل ولا يمكن استخدامها مرة أخرى."
          );
        }

        throw approveError;
      }

      if (!data?.success) {
        throw new Error(
          "تعذر اعتماد الفاتورة."
        );
      }

      /*
       * تحديث حالة العميل على الهاتف.
       */
      const oldState = getCustomerState();

      const newState = {
        ...oldState,
        id: customerId,
        approved_count:
          data.approved_count,
        prize_status:
          data.prize_status,
        prize_expires_at:
          data.prize_expires_at,
      };

      localStorage.setItem(
        "tal_state",
        JSON.stringify(newState)
      );

      setProgress(100);
      setSuccess(true);

      if (data.approved_count >= 4) {
        setMessage(
          "تم قبول الفاتورة الرابعة بنجاح 🎉 الجائزة المجانية أصبحت متاحة!"
        );

        setTimeout(() => {
          navigate("/select-game");
        }, 1500);
      } else {
        setMessage(
          `تم قبول الفاتورة بنجاح ✅ الفواتير المقبولة: ${data.approved_count}/4`
        );
      }
    } catch (e) {
      console.error(
        "Invoice validation error:",
        e
      );

      setProgress(0);
      setSuccess(false);
      setMessage("");

      setError(
        e?.message ||
          "لم يتم قبول الفاتورة. يرجى رفع صورة للفواتير المعتمدة."
      );
    } finally {
      setLoading(false);
    }
  }

  function retry() {
    setError("");
    setMessage("");
    setProgress(0);
    setSuccess(false);
  }

  const state = getCustomerState();

  return (
    <div
      dir="rtl"
      className="min-h-screen px-4 py-8"
    >
      <div className="mx-auto max-w-xl">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-center shadow-xl backdrop-blur">
          <h1 className="text-3xl font-bold text-white">
            رفع الفاتورة
          </h1>

          <p className="mt-2 text-white/60">
            صوّر الفاتورة بوضوح وسيتم فحصها تلقائيًا
          </p>

          <div className="mt-5 rounded-2xl bg-white/5 p-4">
            <p className="text-sm text-white/60">
              الفواتير المقبولة
            </p>

            <p className="mt-1 text-2xl font-bold text-white">
              {state.approved_count || 0}/4
            </p>
          </div>

          {!loading &&
            !success &&
            !error && (
              <div className="mt-8 grid gap-4">
                <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-400/10 p-7 transition hover:bg-amber-400/20">
                  <span className="text-5xl">
                    📷
                  </span>

                  <span className="mt-3 text-xl font-bold text-white">
                    تصوير الفاتورة
                  </span>

                  <span className="mt-1 text-sm text-white/50">
                    استخدم كاميرا الهاتف
                  </span>

                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFile}
                    className="hidden"
                  />
                </label>

                <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/5 p-7 transition hover:bg-white/10">
                  <span className="text-5xl">
                    📁
                  </span>

                  <span className="mt-3 text-xl font-bold text-white">
                    رفع الفاتورة من الهاتف
                  </span>

                  <span className="mt-1 text-sm text-white/50">
                    اختر صورة من المعرض
                  </span>

                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFile}
                    className="hidden"
                  />
                </label>
              </div>
            )}

          {loading && (
            <div className="mt-8 rounded-2xl bg-white/5 p-6">
              <div className="text-5xl animate-pulse">
                🔎
              </div>

              <p className="mt-4 font-bold text-white">
                {message}
              </p>

              <div className="mt-6 h-3 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-amber-400 transition-all duration-300"
                  style={{
                    width: `${Math.max(
                      progress,
                      5
                    )}%`,
                  }}
                />
              </div>

              <p className="mt-2 text-xs text-white/50">
                {progress}%
              </p>

              <p className="mt-5 text-xs leading-6 text-white/40">
                يتم فحص الصورة محليًا قدر الإمكان
                لتقليل وقت المعالجة.
              </p>
            </div>
          )}

          {success && !loading && (
            <div className="mt-8 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-6">
              <div className="text-5xl">
                ✅
              </div>

              <p className="mt-4 font-bold text-emerald-200">
                {message}
              </p>

              {state.approved_count < 4 && (
                <button
                  onClick={retry}
                  className="mt-6 w-full rounded-xl bg-amber-400 px-5 py-3 font-bold text-black"
                >
                  رفع الفاتورة التالية
                </button>
              )}
            </div>
          )}

          {error && !loading && (
            <div className="mt-8 rounded-2xl border border-red-400/30 bg-red-400/10 p-6">
              <div className="text-4xl">
                ❌
              </div>

              <p className="mt-4 font-bold leading-7 text-red-200">
                {error}
              </p>

              <button
                onClick={retry}
                className="mt-6 w-full rounded-xl bg-white/10 px-5 py-3 font-bold text-white transition hover:bg-white/20"
              >
                المحاولة مرة أخرى
              </button>
            </div>
          )}

          <div className="mt-8 rounded-2xl bg-white/5 p-4 text-right text-xs leading-6 text-white/50">
            <p>
              • يجب أن تكون الفاتورة واضحة بالكامل.
            </p>

            <p>
              • يجب أن تكون فاتورة ضريبية مبسطة.
            </p>

            <p>
              • يتم استخراج رقم الفاتورة تلقائيًا.
            </p>

            <p>
              • لا يمكن استخدام نفس الفاتورة مرتين.
            </p>

            <p>
              • تحتاج إلى 4 فواتير مقبولة للحصول على
              اللعبة المجانية.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
      }
