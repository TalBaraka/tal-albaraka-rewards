import React from "react";
import { useNavigate } from "react-router-dom";
import Tesseract from "tesseract.js";
import { supabase } from "../lib/supabase";

function normalizeArabicDigits(text) {
  return text
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
}

function normalizeText(text) {
  return normalizeArabicDigits(text)
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function extractInvoiceNumber(text) {
  const normalized = normalizeArabicDigits(text);

  const patterns = [
    /(?:رقم\s*(?:الفاتورة|الفاتوره)|رقم\s*فاتورة|invoice\s*(?:no|number|#)?)[^\d]{0,15}(\d{4,20})/i,
    /(?:invoice\s*#?)[^\d]{0,10}(\d{4,20})/i,
    /(?:فاتورة)[^\d]{0,20}(\d{4,20})/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

function validateInvoiceText(text) {
  const normalized = normalizeText(text);

  // اسم المتجر
  const merchantOk =
    normalized.includes("تل البركة") ||
    normalized.includes("تال البركة") ||
    normalized.includes("tal albaraka") ||
    normalized.includes("tal al baraka");

  // نوع الفاتورة
  const simplifiedTaxInvoiceOk =
    normalized.includes("فاتورة ضريبية مبسطة") ||
    normalized.includes("فاتوره ضريبيه مبسطه") ||
    normalized.includes("simplified tax invoice");

  // وجود بيانات ضريبية
  const vatOk =
    normalized.includes("ضريبة") ||
    normalized.includes("ضريبه") ||
    normalized.includes("vat");

  return {
    merchantOk,
    simplifiedTaxInvoiceOk,
    vatOk,
    invoiceNumber: extractInvoiceNumber(text),
  };
}

async function getImageDimensions(file) {
  return new Promise((resolve) => {
    const image = new Image();

    image.onload = () => {
      resolve({
        width: image.width,
        height: image.height,
      });

      URL.revokeObjectURL(image.src);
    };

    image.onerror = () => {
      resolve({
        width: 0,
        height: 0,
      });

      URL.revokeObjectURL(image.src);
    };

    image.src = URL.createObjectURL(file);
  });
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

    // السماح باختيار نفس الملف مرة أخرى
    event.target.value = "";

    if (!file) return;

    setLoading(true);
    setProgress(0);
    setMessage("جاري تجهيز الفاتورة...");
    setError("");
    setSuccess(false);

    try {
      if (!file.type.startsWith("image/")) {
        throw new Error("يرجى رفع صورة واضحة للفاتورة.");
      }

      if (file.size > 10 * 1024 * 1024) {
        throw new Error("حجم الصورة كبير جدًا. الحد الأقصى 10 ميجابايت.");
      }

      const dimensions = await getImageDimensions(file);

      if (dimensions.width < 600 || dimensions.height < 600) {
        throw new Error(
          "الصورة صغيرة أو غير واضحة. يرجى تصوير الفاتورة بصورة أوضح."
        );
      }

      setMessage("جاري رفع صورة الفاتورة...");

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        throw new Error("انتهت جلسة المستخدم. يرجى إعادة المحاولة.");
      }

      const extension =
        file.name.split(".").pop()?.toLowerCase() || "jpg";

      const filePath = `${session.user.id}/${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("invoices")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type,
        });

      if (uploadError) {
        throw uploadError;
      }

      setMessage("تم رفع الصورة. جاري فحص بيانات الفاتورة...");
      setProgress(15);

      /*
       * OCR محلي داخل الهاتف.
       * لا يتم إرسال الصورة إلى خدمة ذكاء اصطناعي مدفوعة.
       */
      const result = await Tesseract.recognize(file, "ara+eng", {
        logger: (info) => {
          if (info.status === "recognizing text" && info.progress) {
            setProgress(15 + Math.round(info.progress * 70));
          }
        },
      });

      const text = result?.data?.text || "";

      if (!text.trim()) {
        throw new Error(
          "لم يتمكن النظام من قراءة الفاتورة. يرجى تصويرها بوضوح أكبر."
        );
      }

      setMessage("جاري التحقق من بيانات الفاتورة...");

      const validation = validateInvoiceText(text);

      if (!validation.merchantOk) {
        throw new Error(
          "لم يتم قبولها. يرجى رفع صورة للفواتير المعتمدة."
        );
      }

      if (!validation.simplifiedTaxInvoiceOk) {
        throw new Error(
          "لم يتم قبولها. يرجى رفع صورة للفواتير المعتمدة."
        );
      }

      if (!validation.vatOk) {
        throw new Error(
          "لم يتم قبولها. يرجى رفع صورة للفواتير المعتمدة."
        );
      }

      if (!validation.invoiceNumber) {
        throw new Error(
          "تعذر قراءة رقم الفاتورة. يرجى رفع صورة أوضح للفاتورة."
        );
      }

      setProgress(90);
      setMessage("جاري تسجيل الفاتورة والتأكد من عدم استخدامها من قبل...");

      const customerId = localStorage.getItem("tal_customer_id");

      if (!customerId) {
        throw new Error("لم يتم العثور على بيانات العميل.");
      }

      const { data, error: approveError } = await supabase.rpc(
        "approve_invoice_and_update_customer",
        {
          p_customer_id: customerId,
          p_invoice_number: validation.invoiceNumber,
          p_file_path: filePath,
          p_invoice_date: null,
          p_total_amount: null,
        }
      );

      if (approveError) {
        if (
          approveError.message?.includes("تم استخدام هذه الفاتورة") ||
          approveError.message?.includes("duplicate")
        ) {
          throw new Error(
            "هذه الفاتورة تم استخدامها من قبل ولا يمكن استخدامها مرة أخرى."
          );
        }

        throw approveError;
      }

      if (!data?.success) {
        throw new Error("تعذر اعتماد الفاتورة.");
      }

      // تحديث الحالة المحفوظة على الهاتف
      const oldState = JSON.parse(
        localStorage.getItem("tal_state") || "{}"
      );

      const newState = {
        ...oldState,
        id: customerId,
        approved_count: data.approved_count,
        prize_status: data.prize_status,
        prize_expires_at: data.prize_expires_at,
      };

      localStorage.setItem("tal_state", JSON.stringify(newState));

      setProgress(100);
      setSuccess(true);

      if (data.approved_count >= 4) {
        setMessage(
          "تم قبول الفاتورة الرابعة بنجاح 🎉 الجائزة المجانية أصبحت متاحة!"
        );

        setTimeout(() => {
          navigate("/select-game");
        }, 1800);
      } else {
        setMessage(
          `تم قبول الفاتورة بنجاح ✅ الفواتير المقبولة: ${data.approved_count}/4`
        );
      }
    } catch (e) {
      console.error("Invoice validation error:", e);

      setProgress(0);
      setSuccess(false);

      setError(
        e?.message ||
          "لم يتم قبول الفاتورة. يرجى رفع صورة للفواتير المعتمدة."
      );

      setMessage("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      dir="rtl"
      className="min-h-screen px-4 py-8"
    >
      <div className="mx-auto max-w-xl">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-center shadow-xl backdrop-blur">
          <h1 className="text-2xl font-bold text-white">
            رفع الفاتورة
          </h1>

          <p className="mt-2 text-sm text-white/60">
            صوّر الفاتورة بوضوح وسيتم فحصها تلقائيًا
          </p>

          {!loading && !success && (
            <div className="mt-8 grid gap-4">
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-400/10 p-6 transition hover:bg-amber-400/20">
                <span className="text-4xl">📷</span>

                <span className="mt-3 text-lg font-bold text-white">
                  تصوير الفاتورة
                </span>

                <span className="mt-1 text-xs text-white/50">
                  استخدم كاميرا الهاتف
                </span>

                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFile}
                  className="hidden"
                  disabled={loading}
                />
              </label>

              <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/5 p-6 transition hover:bg-white/10">
                <span className="text-4xl">📁</span>

                <span className="mt-3 text-lg font-bold text-white">
                  رفع الفاتورة من الهاتف
                </span>

                <span className="mt-1 text-xs text-white/50">
                  اختر صورة من المعرض
                </span>

                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFile}
                  className="hidden"
                  disabled={loading}
                />
              </label>
            </div>
          )}

          {loading && (
            <div className="mt-8">
              <div className="text-4xl animate-pulse">🔎</div>

              <p className="mt-4 font-bold text-white">
                {message}
              </p>

              <div className="mt-5 h-3 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-amber-400 transition-all duration-300"
                  style={{
                    width: `${Math.max(progress, 5)}%`,
                  }}
                />
              </div>

              <p className="mt-2 text-xs text-white/50">
                {progress}%
              </p>
            </div>
          )}

          {success && !loading && (
            <div className="mt-8 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-5">
              <div className="text-4xl">✅</div>

              <p className="mt-3 font-bold text-emerald-200">
                {message}
              </p>

              {JSON.parse(
                localStorage.getItem("tal_state") || "{}"
              ).approved_count < 4 && (
                <button
                  onClick={() => {
                    setSuccess(false);
                    setMessage("");
                  }}
                  className="mt-5 w-full rounded-xl bg-amber-400 px-5 py-3 font-bold text-black"
                >
                  رفع الفاتورة التالية
                </button>
              )}
            </div>
          )}

          {error && !loading && (
            <div className="mt-6 rounded-2xl border border-red-400/30 bg-red-400/10 p-5">
              <div className="text-3xl">❌</div>

              <p className="mt-3 font-bold text-red-200">
                {error}
              </p>

              <button
                onClick={() => {
                  setError("");
                  setMessage("");
                }}
                className="mt-5 w-full rounded-xl bg-white/10 px-5 py-3 font-bold text-white hover:bg-white/20"
              >
                المحاولة مرة أخرى
              </button>
            </div>
          )}

          <div className="mt-8 rounded-2xl bg-white/5 p-4 text-right text-xs leading-6 text-white/50">
            <p>• يجب أن تكون الفاتورة واضحة بالكامل.</p>
            <p>• يتم استخراج رقم الفاتورة تلقائيًا.</p>
            <p>• لا يمكن استخدام نفس الفاتورة مرتين.</p>
            <p>• تحتاج إلى 4 فواتير مقبولة للحصول على اللعبة المجانية.</p>
          </div>
        </div>
      </div>
    </div>
  );
                                              }
