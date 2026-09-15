import React from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload as UploadIcon, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import Tesseract from "tesseract.js";

const TAL_ALBARAKA_TAX_NUMBER = "300262985100003";
const REJECTION_MESSAGE =
  "لم يتم قبولها. يرجى رفع صورة للفواتير المعتمدة.";

const MERCHANT_NAMES = [
  "مؤسسة تل البركة",
  "تل البركة",
  "تال البركة",
  "تل البركه",
  "تال البركه",
  "tal al baraka",
  "talalbaraka",
];

function normalizeArabicDigits(value = "") {
  return String(value)
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
}

function normalizeText(value = "") {
  return normalizeArabicDigits(value)
    .toLowerCase()
    .replace(/[إأآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\u0600-\u06ffa-z0-9%]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCompact(value = "") {
  return normalizeText(value).replace(/\s/g, "");
}

function digitsOnly(value = "") {
  return normalizeArabicDigits(value).replace(/\D/g, "");
}

function hasAny(text, values) {
  const normalized = normalizeText(text);
  return values.some((value) =>
    normalized.includes(normalizeText(value))
  );
}

function containsMerchant(text) {
  const normalized = normalizeCompact(text);

  return MERCHANT_NAMES.some((name) =>
    normalized.includes(normalizeCompact(name))
  );
}

function containsTaxInvoice(text) {
  const normalized = normalizeText(text);

  return (
    normalized.includes("فاتوره ضريبيه مبسطه") ||
    normalized.includes("فاتوره ضريبيه") ||
    normalized.includes("ضريبيه مبسطه") ||
    normalized.includes("simplified tax invoice")
  );
}

function containsVat(text) {
  const normalized = normalizeText(text);

  return (
    normalized.includes("vat") ||
    normalized.includes("ضريبه") ||
    normalized.includes("ضريبة") ||
    normalized.includes("15%") ||
    normalized.includes("15")
  );
}

function containsJeddah(text) {
  const normalized = normalizeText(text);

  return (
    normalized.includes("جده") ||
    normalized.includes("jeddah")
  );
}

function containsInvoiceStructure(text) {
  const normalized = normalizeText(text);

  const terms = [
    "الاجمالي",
    "المجموع",
    "total",
    "subtotal",
    "الضريبه",
    "vat",
    "الكميه",
    "quantity",
    "السعر",
    "price",
    "الصنف",
    "item",
    "فاتوره",
    "invoice",
  ];

  return terms.filter((term) =>
    normalized.includes(normalizeText(term))
  ).length;
}

function extractInvoiceNumber(text) {
  const normalized = normalizeArabicDigits(text);

  const patterns = [
    /(?:invoice\s*(?:no|number)?|فاتورة\s*(?:رقم|رقم الفاتورة)?|رقم\s*الفاتورة)\s*[:#\-]?\s*([A-Za-z0-9٠-٩]+(?:[-/][A-Za-z0-9٠-٩]+)+)/i,

    /\b(\d{1,4}[-/]\d{1,4}[-/]\d{1,4}[-/]\d{3,12})\b/,

    /\b(\d{1,4}[-/]\d{1,4}[-/]\d{3,12})\b/,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);

    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return "";
}

function validateTalAlbarakaInvoice(text) {
  const normalized = normalizeText(text);
  const compact = normalizeCompact(text);

  const merchantOk = containsMerchant(text);
  const taxInvoiceOk = containsTaxInvoice(text);
  const vatOk = containsVat(text);
  const locationOk = containsJeddah(text);

  const taxNumberOk =
    digitsOnly(text).includes(TAL_ALBARAKA_TAX_NUMBER);

  const structureScore = containsInvoiceStructure(text);

  const dateOk =
    /\b\d{1,2}\s*[\/\-]\s*\d{1,2}\s*[\/\-]\s*\d{2,4}\b/.test(
      normalizeArabicDigits(text)
    ) ||
    /\b\d{1,2}\s*[\/\-]\s*\d{1,2}\b/.test(
      normalizeArabicDigits(text)
    );

  const totalOk =
    normalized.includes("الاجمالي") ||
    normalized.includes("المجموع") ||
    normalized.includes("total");

  const itemOk =
    normalized.includes("الصنف") ||
    normalized.includes("item");

  const quantityOk =
    normalized.includes("الكميه") ||
    normalized.includes("quantity");

  const priceOk =
    normalized.includes("السعر") ||
    normalized.includes("price") ||
    /\d+\.\d{2}/.test(normalized);

  const merchantIdentityOk =
    merchantOk ||
    compact.includes("تلبركه") ||
    compact.includes("تالبركه");

  /*
   * لا نعتمد على QR.
   *
   * نريد التأكد من أن الصورة تشبه فاتورة تل البركة
   * وتحتوي على مجموعة كافية من عناصر الفاتورة.
   */

  const structuralEvidence =
    structureScore >= 3 &&
    (dateOk || totalOk) &&
    (itemOk || quantityOk || priceOk);

  const identityEvidence =
    merchantIdentityOk &&
    (taxInvoiceOk || vatOk || taxNumberOk || locationOk);

  const strongIdentity =
    merchantIdentityOk &&
    (taxNumberOk || taxInvoiceOk);

  const accepted =
    strongIdentity ||
    (identityEvidence && structuralEvidence) ||
    (merchantIdentityOk &&
      taxInvoiceOk &&
      vatOk &&
      structureScore >= 3);

  return {
    accepted,
    merchantOk,
    taxInvoiceOk,
    vatOk,
    taxNumberOk,
    locationOk,
    structureScore,
    dateOk,
    totalOk,
    itemOk,
    quantityOk,
    priceOk,
    invoiceNumber: extractInvoiceNumber(text),
  };
}

function prepareImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => {
      try {
        const maxWidth = 1400;

        let width = image.naturalWidth;
        let height = image.naturalHeight;

        if (width > maxWidth) {
          const ratio = maxWidth / width;
          width = maxWidth;
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");

        ctx.drawImage(image, 0, 0, width, height);

        URL.revokeObjectURL(url);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("تعذر تجهيز الصورة"));
              return;
            }

            resolve(blob);
          },
          "image/jpeg",
          0.86
        );
      } catch (error) {
        URL.revokeObjectURL(url);
        reject(error);
      }
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("تعذر قراءة الصورة"));
    };

    image.src = url;
  });
}

async function getCustomerState(userId) {
  const { data, error } = await supabase
    .from("customers")
    .select(
      "id, name, approved_count, prize_status, prize_expires_at, game_selected"
    )
    .eq("user_id", userId)
    .single();

  if (error) throw error;

  return data;
}

export default function Upload() {
  const navigate = useNavigate();

  const [file, setFile] = React.useState(null);
  const [preview, setPreview] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState(false);
  const [progress, setProgress] = React.useState(0);

  React.useEffect(() => {
    return () => {
      if (preview) {
        URL.revokeObjectURL(preview);
      }
    };
  }, [preview]);

  function handleFileChange(event) {
    const selected = event.target.files?.[0];

    setError("");
    setMessage("");
    setSuccess(false);
    setProgress(0);

    if (!selected) {
      setFile(null);
      setPreview("");
      return;
    }

    if (!selected.type.startsWith("image/")) {
      setError("يرجى اختيار صورة فقط.");
      return;
    }

    if (selected.size > 10 * 1024 * 1024) {
      setError("حجم الصورة كبير جدًا. الحد الأقصى 10 ميجابايت.");
      return;
    }

    setFile(selected);
    setPreview(URL.createObjectURL(selected));
  }

  async function submitInvoice() {
    if (!file) {
      setError("يرجى اختيار صورة الفاتورة أولًا.");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");
    setSuccess(false);
    setProgress(5);

    try {
      setMessage("جاري تجهيز صورة الفاتورة...");
      const imageBlob = await prepareImage(file);

      setProgress(15);
      setMessage("جاري التأكد أن الفاتورة من تل البركة...");

      const result = await Tesseract.recognize(
        imageBlob,
        "ara+eng",
        {
          logger: (info) => {
            if (info.status === "recognizing text") {
              const value = Math.round(
                15 + (info.progress || 0) * 45
              );

              setProgress(value);
            }
          },
          config: {
            tessedit_pageseg_mode: "6",
          },
        }
      );

      const text = result?.data?.text || "";

      setProgress(65);

      const validation = validateTalAlbarakaInvoice(text);

      if (!validation.accepted) {
        setError(REJECTION_MESSAGE);
        setMessage("");
        setLoading(false);
        return;
      }

      setMessage(
        "تم التأكد من الفاتورة. جاري قراءة رقم الفاتورة..."
      );

      setProgress(72);

      const invoiceNumber = validation.invoiceNumber;

      if (!invoiceNumber) {
        setError(REJECTION_MESSAGE);
        setMessage("");
        setLoading(false);
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        throw new Error("لم يتم العثور على جلسة المستخدم");
      }

      setProgress(78);
      setMessage("جاري حفظ الفاتورة وفحص التكرار...");

      const customer = await getCustomerState(session.user.id);

      const extension =
        file.name.split(".").pop()?.toLowerCase() || "jpg";

      const filePath =
        `${session.user.id}/${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("invoices")
        .upload(filePath, imageBlob, {
          contentType: "image/jpeg",
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      setProgress(86);

      const { data: approval, error: rpcError } =
        await supabase.rpc(
          "approve_invoice_and_update_customer",
          {
            p_customer_id: customer.id,
            p_invoice_number: invoiceNumber,
            p_file_path: filePath,
            p_invoice_date: null,
            p_total_amount: null,
          }
        );

      if (rpcError) {
        /*
         * إذا كانت الفاتورة مكررة، لا نزيد العدد.
         */
        throw rpcError;
      }

      const approvedCount =
        approval?.approved_count ??
        customer.approved_count + 1;

      setProgress(100);

      setSuccess(true);

      setMessage(
        `تم قبول الفاتورة بنجاح. الفواتير المقبولة: ${approvedCount}/4`
      );

      const newState = {
        ...customer,
        approved_count: approvedCount,
        prize_status: approval?.prize_status || "none",
        prize_expires_at:
          approval?.prize_expires_at || null,
      };

      localStorage.setItem(
        "tal_state",
        JSON.stringify(newState)
      );

      setTimeout(() => {
        if (approvedCount >= 4) {
          navigate("/select-game");
        } else {
          setFile(null);
          setPreview("");
          setProgress(0);
          setSuccess(false);
          setMessage(
            `تم قبول الفاتورة. لديك الآن ${approvedCount}/4 فواتير معتمدة.`
          );
        }
      }, 1200);
    } catch (e) {
      console.error(e);

      const errorMessage = String(e?.message || "");

      if (
        errorMessage.includes("تم استخدام هذه الفاتورة") ||
        errorMessage.includes("duplicate") ||
        errorMessage.includes("unique")
      ) {
        setError(
          "تم استخدام هذه الفاتورة من قبل ولا يمكن استخدامها مرة أخرى."
        );
      } else {
        setError(
          e?.message || "تعذر معالجة الفاتورة، حاول مرة أخرى."
        );
      }

      setMessage("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="mx-auto max-w-2xl space-y-6 py-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-center text-2xl">
              رفع الفاتورة
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-5">
            <div className="rounded-xl border-2 border-dashed p-6 text-center">
              {preview ? (
                <div className="space-y-4">
                  <img
                    src={preview}
                    alt="معاينة الفاتورة"
                    className="mx-auto max-h-[420px] w-auto rounded-lg object-contain"
                  />

                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2">
                    <UploadIcon className="h-5 w-5" />
                    تغيير الصورة
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileChange}
                      disabled={loading}
                    />
                  </label>
                </div>
              ) : (
                <label className="block cursor-pointer">
                  <UploadIcon className="mx-auto mb-3 h-12 w-12" />

                  <div className="text-lg font-medium">
                    اختر صورة الفاتورة
                  </div>

                  <div className="mt-2 text-sm text-muted-foreground">
                    JPG أو PNG — الحد الأقصى 10 ميجابايت
                  </div>

                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                    disabled={loading}
                  />
                </label>
              )}
            </div>

            {loading && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {message || "جاري معالجة الفاتورة..."}
                </div>

                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>

                <div className="text-center text-xs text-muted-foreground">
                  {progress}%
                </div>
              </div>
            )}

            {!loading && message && (
              <div className="flex items-center gap-2 rounded-lg bg-green-50 p-4 text-green-700">
                {success && (
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                )}
                <span>{message}</span>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 p-4 text-red-700">
                <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button
              className="w-full"
              size="lg"
              onClick={submitInvoice}
              disabled={!file || loading}
            >
              {loading ? (
                <>
                  <Loader2 className="ml-2 h-5 w-5 animate-spin" />
                  جاري التحقق...
                </>
              ) : (
                "تحقق من الفاتورة"
              )}
            </Button>

            <div className="rounded-lg bg-muted p-4 text-center text-sm text-muted-foreground">
              يتم التأكد من هوية الفاتورة ومحتواها وأنها من
              <strong className="mx-1">
                مؤسسة تل البركة
              </strong>
              ثم فحص رقم الفاتورة لمنع التكرار.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
