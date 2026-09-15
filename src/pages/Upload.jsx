import React from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Button } from "@/components/ui/button";
import {
  Upload as UploadIcon,
  Camera,
  CheckCircle2,
  XCircle,
  Loader2,
  RotateCcw,
  Gift,
} from "lucide-react";
import Tesseract from "tesseract.js";

const DEVICE_KEY = "tal_baraka_device_key";
const ACTIVE_CUSTOMER_KEY = "tal_active_customer_id";
const STATE_KEY = "tal_state";

const TAX_NUMBER = "300262985100003";

const REJECTION =
  "لم يتم قبولها. يرجى رفع صورة لفاتورة تل البركة المعتمدة.";

const MERCHANTS = [
  "مؤسسة تل البركة",
  "تل البركة",
  "تال البركة",
  "تل البركه",
  "تال البركه",
  "tal al baraka",
  "talalbaraka",
];

/*
 * تحويل الأرقام العربية والفارسية إلى أرقام إنجليزية.
 */
function normalizeDigits(value = "") {
  return String(value)
    .replace(/[٠-٩]/g, (d) =>
      String("٠١٢٣٤٥٦٧٨٩".indexOf(d))
    )
    .replace(/[۰-۹]/g, (d) =>
      String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))
    );
}

/*
 * تنظيف النص لتسهيل المقارنة.
 */
function normalize(value = "") {
  return normalizeDigits(value)
    .toLowerCase()
    .replace(/[إأآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\u0600-\u06ffa-z0-9%]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(value = "") {
  return normalize(value).replace(/\s/g, "");
}

function digitsOnly(value = "") {
  return normalizeDigits(value).replace(/\D/g, "");
}

function merchantFound(text = "") {
  const value = compact(text);

  return MERCHANTS.some((merchant) =>
    value.includes(compact(merchant))
  );
}

function taxInvoiceFound(text = "") {
  const value = normalize(text);

  return (
    value.includes("فاتوره ضريبيه مبسطه") ||
    value.includes("فاتوره ضريبيه") ||
    value.includes("ضريبيه مبسطه") ||
    value.includes("simplified tax invoice") ||
    value.includes("tax invoice")
  );
}

/*
 * حساب مدى وجود عناصر فاتورة حقيقية.
 */
function structureScore(text = "") {
  const value = normalize(text);

  const words = [
    "الاجمالي",
    "المجموع",
    "total",
    "subtotal",
    "tax",
    "vat",
    "الضريبه",
    "الكميه",
    "quantity",
    "السعر",
    "price",
    "الصنف",
    "item",
    "فاتوره",
    "invoice",
    "branch",
    "cashier",
  ];

  return words.filter((word) =>
    value.includes(normalize(word))
  ).length;
}

/*
 * استخراج رقم الفاتورة.
 *
 * نحاول أولًا الكلمات الواضحة:
 * Invoice No
 * Invoice Number
 * رقم الفاتورة
 * فاتورة رقم
 *
 * وبعد ذلك نحاول أرقام الفواتير التي تحتوي على / أو -
 * ثم رقم منفرد في نفس السطر.
 */
function extractInvoiceNumber(text = "") {
  const value = normalizeDigits(text);

  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const labeledPatterns = [
    /invoice\s*(?:no|number|#)?\s*[:#\-]?\s*([a-z0-9][a-z0-9\-\/]{2,30})/i,

    /فاتورة\s*(?:رقم|رقم\s*الفاتورة)?\s*[:#\-]?\s*([a-z0-9][a-z0-9\-\/]{2,30})/i,

    /رقم\s*الفاتورة\s*[:#\-]?\s*([a-z0-9][a-z0-9\-\/]{2,30})/i,

    /رقم\s*الفاتوره\s*[:#\-]?\s*([a-z0-9][a-z0-9\-\/]{2,30})/i,
  ];

  /*
   * الأولوية للسطر الذي يحتوي على كلمة Invoice / فاتورة.
   */
  for (const line of lines) {
    for (const pattern of labeledPatterns) {
      const match = line.match(pattern);

      if (match?.[1]) {
        const candidate = match[1].trim();

        /*
         * نتجنب اعتبار أرقام قصيرة جدًا كرقم فاتورة.
         */
        if (candidate.replace(/\D/g, "").length >= 3) {
          return candidate;
        }
      }
    }
  }

  /*
   * صيغ أرقام الفواتير المركبة.
   */
  const compoundPatterns = [
    /\b(\d{1,6}[-\/]\d{1,8}[-\/]\d{1,8}[-\/]\d{2,15})\b/,
    /\b(\d{1,8}[-\/]\d{1,12}[-\/]\d{1,12})\b/,
    /\b(\d{1,8}[-\/]\d{1,12})\b/,
  ];

  for (const pattern of compoundPatterns) {
    const match = value.match(pattern);

    if (match?.[1]) {
      return match[1].trim();
    }
  }

  /*
   * أحيانًا OCR يقرأ:
   * Invoice
   * 123456
   *
   * لذلك نبحث عن الرقم الموجود في السطر التالي.
   */
  for (let i = 0; i < lines.length; i++) {
    const current = lines[i];

    if (
      /invoice|فاتوره|فاتورة|رقم\s*الفاتورة|رقم\s*الفاتوره/i.test(
        current
      )
    ) {
      const nearbyLines = [
        current,
        lines[i + 1] || "",
        lines[i + 2] || "",
      ];

      for (const nearby of nearbyLines) {
        const numbers = nearby.match(
          /\b\d{3,20}\b/g
        );

        if (numbers?.length) {
          /*
           * نختار أول رقم مناسب.
           */
          return numbers[0];
        }
      }
    }
  }

  return "";
}

/*
 * استخراج رقم الفرع.
 *
 * مهم:
 * إذا ظهر الفرع وكان من 1 إلى 5 = مقبول.
 *
 * إذا لم نستطع قراءة الفرع = لا نرفض الفاتورة.
 * لأن OCR ممكن لا يقرأ كلمة الفرع بوضوح.
 */
function extractBranchNumber(text = "") {
  const value = normalizeDigits(text);

  const patterns = [
    /(?:فرع|الفرع)\s*[:#\-]?\s*(\d{1,2})/i,
    /branch\s*[:#\-]?\s*(\d{1,2})/i,
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);

    if (match?.[1]) {
      return Number(match[1]);
    }
  }

  return null;
}

/*
 * التحقق الأساسي من الفاتورة.
 */
function validateInvoice(text = "") {
  const value = normalize(text);
  const compactValue = compact(text);
  const numbers = digitsOnly(text);

  const merchantOk = merchantFound(text);

  const taxInvoiceOk = taxInvoiceFound(text);

  const taxNumberOk = numbers.includes(TAX_NUMBER);

  const jeddahOk =
    value.includes("جده") ||
    value.includes("jeddah");

  const dateOk =
    /\b\d{1,2}\s*[\/-]\s*\d{1,2}\s*[\/-]\s*\d{2,4}\b/.test(
      normalizeDigits(text)
    );

  const totalOk =
    value.includes("الاجمالي") ||
    value.includes("المجموع") ||
    value.includes("total");

  const itemOk =
    value.includes("الصنف") ||
    value.includes("item");

  const quantityOk =
    value.includes("الكميه") ||
    value.includes("quantity");

  const priceOk =
    value.includes("السعر") ||
    value.includes("price") ||
    /\d+\.\d{2}/.test(value);

  const vatOk =
    value.includes("vat") ||
    value.includes("tax") ||
    value.includes("ضريبه") ||
    value.includes("15%");

  const merchantIdentity =
    merchantOk ||
    compactValue.includes("تلبركه") ||
    compactValue.includes("تالبركه");

  const branchNumber =
    extractBranchNumber(text);

  /*
   * إذا ظهر رقم فرع واضح:
   * نقبل فقط الفروع 1 إلى 5.
   *
   * إذا لم يظهر رقم الفرع:
   * لا نرفض بسبب ذلك.
   */
  const branchOk =
    branchNumber === null ||
    [1, 2, 3, 4, 5].includes(branchNumber);

  const score = structureScore(text);

  const structureOk =
    score >= 3 &&
    (dateOk || totalOk) &&
    (itemOk || quantityOk || priceOk);

  /*
   * الهوية الأساسية:
   * اسم تل البركة أو الرقم الضريبي.
   */
  const identityOk =
    merchantIdentity ||
    taxNumberOk;

  /*
   * قبول الفاتورة.
   */
  const accepted =
    branchOk &&
    identityOk &&
    (taxNumberOk || taxInvoiceOk) &&
    (
      structureOk ||
      score >= 4 ||
      taxNumberOk
    );

  return {
    accepted,
    invoiceNumber: extractInvoiceNumber(text),

    merchantOk,
    taxInvoiceOk,
    taxNumberOk,
    vatOk,
    jeddahOk,
    dateOk,
    totalOk,
    itemOk,
    quantityOk,
    priceOk,

    branchNumber,
    branchOk,

    score,
  };
}

/*
 * تجهيز الصورة لتقليل وقت OCR.
 */
function prepareImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();

    const url = URL.createObjectURL(file);

    image.onload = () => {
      try {
        const maxWidth = 1100;

        let width = image.naturalWidth;
        let height = image.naturalHeight;

        if (width > maxWidth) {
          const ratio = maxWidth / width;

          width = maxWidth;
          height = Math.round(height * ratio);
        }

        const canvas =
          document.createElement("canvas");

        canvas.width = width;
        canvas.height = height;

        const ctx =
          canvas.getContext("2d");

        if (!ctx) {
          throw new Error(
            "تعذر تجهيز الصورة"
          );
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";

        ctx.drawImage(
          image,
          0,
          0,
          width,
          height
        );

        URL.revokeObjectURL(url);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(
                new Error(
                  "تعذر تجهيز الصورة"
                )
              );
              return;
            }

            resolve(blob);
          },
          "image/jpeg",
          0.82
        );
      } catch (error) {
        URL.revokeObjectURL(url);
        reject(error);
      }
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);

      reject(
        new Error(
          "تعذر قراءة الصورة"
        )
      );
    };

    image.src = url;
  });
}

/*
 * OCR سريع باللغة الإنجليزية.
 */
async function runFastOCR(blob, setProgress) {
  const result =
    await Tesseract.recognize(
      blob,
      "eng",
      {
        logger: (info) => {
          if (
            info.status ===
            "recognizing text"
          ) {
            setProgress(
              Math.round(
                15 +
                  (info.progress || 0) *
                    45
              )
            );
          }
        },

        config: {
          tessedit_pageseg_mode: "6",
          preserve_interword_spaces: "1",
        },
      }
    );

  return result?.data?.text || "";
}

/*
 * OCR عربي + إنجليزي.
 *
 * لا يتم تشغيله على كل فاتورة.
 * فقط إذا احتجنا إليه.
 */
async function runArabicOCR(
  blob,
  setProgress
) {
  const result =
    await Tesseract.recognize(
      blob,
      "ara+eng",
      {
        logger: (info) => {
          if (
            info.status ===
            "recognizing text"
          ) {
            setProgress(
              Math.round(
                70 +
                  (info.progress || 0) *
                    15
              )
            );
          }
        },

        config: {
          tessedit_pageseg_mode: "6",
          preserve_interword_spaces: "1",
        },
      }
    );

  return result?.data?.text || "";
}

/*
 * قراءة QR من الصورة باستخدام BarcodeDetector
 * إذا كان المتصفح يدعمه.
 *
 * QR ليس شرطًا للقبول.
 */
async function decodeInvoiceQR(blob) {
  try {
    if (
      typeof window === "undefined" ||
      !("BarcodeDetector" in window)
    ) {
      return null;
    }

    const supported =
      await window.BarcodeDetector.getSupportedFormats();

    if (
      !supported.includes("qr_code")
    ) {
      return null;
    }

    const detector =
      new window.BarcodeDetector({
        formats: ["qr_code"],
      });

    const bitmap =
      await createImageBitmap(blob);

    const results =
      await detector.detect(bitmap);

    bitmap.close();

    if (!results?.length) {
      return null;
    }

    return (
      results[0]?.rawValue ||
      null
    );
  } catch (error) {
    console.warn(
      "QR scan failed:",
      error
    );

    return null;
  }
}

/*
 * بعض الفواتير تستخدم QR الخاص بفاتورة ZATCA
 * ويكون المحتوى Base64/TLV.
 *
 * نستخرج الحقول الأساسية:
 *
 * 1 = اسم البائع
 * 2 = الرقم الضريبي
 * 3 = وقت الفاتورة
 * 4 = الإجمالي
 * 5 = إجمالي الضريبة
 */
function decodeZatcaQR(rawValue = "") {
  try {
    if (!rawValue) {
      return null;
    }

    let base64 = rawValue.trim();

    /*
     * إذا كان QR يحتوي على Data URL.
     */
    if (
      base64.includes(",") &&
      base64.startsWith("data:")
    ) {
      base64 =
        base64.split(",").pop();
    }

    const binary =
      atob(base64);

    const bytes =
      new Uint8Array(
        binary.length
      );

    for (
      let i = 0;
      i < binary.length;
      i++
    ) {
      bytes[i] =
        binary.charCodeAt(i);
    }

    const decoder =
      new TextDecoder("utf-8");

    let position = 0;

    const fields = {};

    while (
      position + 2 <=
      bytes.length
    ) {
      const tag =
        bytes[position];

      const length =
        bytes[position + 1];

      position += 2;

      if (
        position + length >
        bytes.length
      ) {
        break;
      }

      const valueBytes =
        bytes.slice(
          position,
          position + length
        );

      position += length;

      fields[tag] =
        decoder.decode(valueBytes);
    }

    if (
      !fields[1] &&
      !fields[2]
    ) {
      return null;
    }

    return {
      sellerName:
        fields[1] || "",

      taxNumber:
        normalizeDigits(
          fields[2] || ""
        ),

      timestamp:
        fields[3] || "",

      total:
        fields[4] || "",

      vatTotal:
        fields[5] || "",
    };
  } catch (error) {
    /*
     * ليس كل QR سيكون Base64/TLV.
     * لا نرفض الفاتورة بسببه.
     */
    console.warn(
      "ZATCA QR decode failed:",
      error
    );

    return null;
  }
}

/*
 * التحقق من QR كمساعد فقط.
 */
function validateQR(rawValue) {
  if (!rawValue) {
    return {
      detected: false,
      valid: false,
      taxNumberOk: false,
      merchantOk: false,
    };
  }

  const decoded =
    decodeZatcaQR(rawValue);

  /*
   * إذا لم نستطع فك TLV،
   * نبحث على الأقل عن الرقم الضريبي
   * داخل النص الخام.
   */
  if (!decoded) {
    const qrDigits =
      digitsOnly(rawValue);

    const taxNumberOk =
      qrDigits.includes(
        TAX_NUMBER
      );

    return {
      detected: true,
      valid: taxNumberOk,
      taxNumberOk,
      merchantOk: false,
      decoded: null,
    };
  }

  const sellerText =
    decoded.sellerName || "";

  const merchantOk =
    merchantFound(
      sellerText
    ) ||
    compact(sellerText).includes(
      "تلبركه"
    ) ||
    compact(sellerText).includes(
      "تالبركه"
    );

  const taxNumberOk =
    digitsOnly(
      decoded.taxNumber
    ).includes(
      TAX_NUMBER
    );

  return {
    detected: true,

    /*
     * QR يعتبر مساعدًا قويًا عندما يتطابق
     * اسم المنشأة والرقم الضريبي.
     */
    valid:
      merchantOk &&
      taxNumberOk,

    taxNumberOk,
    merchantOk,

    decoded,
  };
}

export default function Upload() {
  const navigate =
    useNavigate();

  const cameraInputRef =
    React.useRef(null);

  const fileInputRef =
    React.useRef(null);

  const [file, setFile] =
    React.useState(null);

  const [preview, setPreview] =
    React.useState("");

  const [loading, setLoading] =
    React.useState(false);

  const [message, setMessage] =
    React.useState("");

  const [error, setError] =
    React.useState("");

  const [success, setSuccess] =
    React.useState(false);

  const [progress, setProgress] =
    React.useState(0);

  React.useEffect(() => {
    return () => {
      if (preview) {
        URL.revokeObjectURL(
          preview
        );
      }
    };
  }, [preview]);

  function handleFileChange(
    event
  ) {
    const selected =
      event.target.files?.[0];

    setError("");
    setMessage("");
    setSuccess(false);
    setProgress(0);

    if (!selected) {
      return;
    }

    if (
      !selected.type.startsWith(
        "image/"
      )
    ) {
      setError(
        "يرجى اختيار صورة للفواتير فقط."
      );
      return;
    }

    if (
      selected.size >
      10 * 1024 * 1024
    ) {
      setError(
        "حجم الصورة كبير جدًا. الحد الأقصى 10 ميجابايت."
      );
      return;
    }

    if (preview) {
      URL.revokeObjectURL(
        preview
      );
    }

    setFile(selected);

    setPreview(
      URL.createObjectURL(
        selected
      )
    );
  }

  async function submitInvoice() {
    if (!file) {
      setError(
        "يرجى اختيار صورة الفاتورة أولًا."
      );
      return;
    }

    const deviceKey =
      localStorage.getItem(
        DEVICE_KEY
      );

    const customerId =
      localStorage.getItem(
        ACTIVE_CUSTOMER_KEY
      ) ||
      localStorage.getItem(
        "tal_customer_id"
      );

    if (
      !deviceKey ||
      !customerId
    ) {
      setError(
        "لم يتم العثور على بيانات العميل على هذا الجهاز. ارجع للصفحة الرئيسية واكتب اسم العميل."
      );
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");
    setSuccess(false);
    setProgress(5);

    try {
      /*
       * تجهيز الصورة.
       */
      setMessage(
        "جاري تجهيز صورة الفاتورة..."
      );

      const imageBlob =
        await prepareImage(file);

      setProgress(15);

      /*
       * أول فحص:
       * OCR إنجليزي سريع.
       */
      setMessage(
        "جاري فحص الفاتورة بسرعة..."
      );

      const firstText =
        await runFastOCR(
          imageBlob,
          setProgress
        );

      setProgress(60);

      let finalValidation =
        validateInvoice(
          firstText
        );

      /*
       * QR كمساعد فقط.
       *
       * نحاول QR عندما:
       * - الفاتورة لم تُقبل
       * - أو رقم الفاتورة غير واضح
       */
      let qrResult = null;

      if (
        !finalValidation.accepted ||
        !finalValidation.invoiceNumber
      ) {
        setMessage(
          "جاري التأكد من بيانات الفاتورة..."
        );

        const rawQR =
          await decodeInvoiceQR(
            imageBlob
          );

        qrResult =
          validateQR(rawQR);

        /*
         * إذا أكد QR الرقم الضريبي
         * واسم المنشأة، نستخدمه لتقوية
         * هوية الفاتورة.
         */
        if (
          qrResult.valid
        ) {
          finalValidation = {
            ...finalValidation,

            accepted:
              finalValidation.branchOk &&
              (
                finalValidation.accepted ||
                (
                  qrResult.taxNumberOk &&
                  qrResult.merchantOk
                )
              ),

            taxNumberOk:
              true,

            merchantOk:
              finalValidation.merchantOk ||
              qrResult.merchantOk,
          };
        }
      }

      /*
       * إذا ما زال القبول غير واضح
       * أو رقم الفاتورة غير موجود،
       * نشغل OCR العربي مرة واحدة.
       *
       * هذا هو الجزء الأبطأ، لذلك لا يعمل
       * إلا عند الحاجة.
       */
      if (
        !finalValidation.accepted ||
        !finalValidation.invoiceNumber
      ) {
        setMessage(
          "جاري قراءة الأرقام والبيانات غير الواضحة..."
        );

        const secondText =
          await runArabicOCR(
            imageBlob,
            setProgress
          );

        const secondValidation =
          validateInvoice(
            secondText
          );

        /*
         * نختار أفضل نتيجة من المرتين.
         */
        const mergedText =
          `${firstText}\n${secondText}`;

        const mergedValidation =
          validateInvoice(
            mergedText
          );

        /*
         * إذا كانت النتيجة الثانية أقوى
         * نستخدمها.
         */
        if (
          secondValidation.accepted ||
          mergedValidation.accepted
        ) {
          finalValidation =
            mergedValidation;
        } else if (
          secondValidation.invoiceNumber &&
          !finalValidation.invoiceNumber
        ) {
          finalValidation = {
            ...finalValidation,

            invoiceNumber:
              secondValidation.invoiceNumber,
          };
        }

        /*
         * QR يظل مساعدًا بعد OCR أيضًا.
         */
        if (
          qrResult?.valid
        ) {
          finalValidation = {
            ...finalValidation,

            accepted:
              finalValidation.branchOk &&
              (
                finalValidation.accepted ||
                (
                  qrResult.taxNumberOk &&
                  qrResult.merchantOk
                )
              ),

            taxNumberOk:
              true,

            merchantOk:
              finalValidation.merchantOk ||
              qrResult.merchantOk,
          };
        }
      }

      setProgress(85);

      /*
       * لا نقبل أي فاتورة لا تحقق
       * شروط الهوية الأساسية.
       */
      if (
        !finalValidation.accepted
      ) {
        setError(REJECTION);
        setMessage("");
        setLoading(false);
        return;
      }

      /*
       * رقم الفاتورة مهم جدًا.
       *
       * QR لا يستبدل رقم الفاتورة.
       */
      const invoiceNumber =
        finalValidation.invoiceNumber;

      if (!invoiceNumber) {
        setError(
          "تعذر قراءة رقم الفاتورة بوضوح. يرجى تصوير الجزء العلوي من الفاتورة بوضوح أكبر."
        );

        setMessage("");
        setLoading(false);
        return;
      }

      /*
       * تسجيل الدخول المجهول في Supabase.
       */
      let {
        data: { session },
      } =
        await supabase.auth.getSession();

      if (!session?.user) {
        const {
          data,
          error: authError,
        } =
          await supabase.auth.signInAnonymously();

        if (authError) {
          throw authError;
        }

        session = {
          user: data.user,
        };
      }

      setProgress(88);

      setMessage(
        "جاري حفظ الفاتورة وفحص التكرار..."
      );

      const filePath =
        `${session.user.id}/${crypto.randomUUID()}.jpg`;

      /*
       * حفظ الصورة.
       */
      const {
        error: uploadError,
      } =
        await supabase.storage
          .from("invoices")
          .upload(
            filePath,
            imageBlob,
            {
              contentType:
                "image/jpeg",

              upsert: false,
            }
          );

      if (uploadError) {
        throw uploadError;
      }

      /*
       * قاعدة البيانات تمنع تكرار
       * رقم الفاتورة.
       */
      const {
        data: approval,
        error: rpcError,
      } =
        await supabase.rpc(
          "approve_invoice_for_device",
          {
            p_customer_id:
              customerId,

            p_invoice_number:
              invoiceNumber,

            p_file_path:
              filePath,

            p_invoice_date:
              null,

            p_total_amount:
              null,

            p_device_key:
              deviceKey,
          }
        );

      if (rpcError) {
        if (
          String(
            rpcError.message || ""
          ).includes(
            "تم استخدام هذه الفاتورة"
          )
        ) {
          setError(
            "تم استخدام هذه الفاتورة من قبل ولا يمكن استخدامها مرة أخرى."
          );

          setMessage("");
          setLoading(false);
          return;
        }

        throw rpcError;
      }

      /*
       * تحديث حالة العميل.
       */
      const oldState =
        JSON.parse(
          localStorage.getItem(
            STATE_KEY
          ) || "{}"
        );

      const approvedCount =
        approval?.approved_count ??
        Number(
          oldState.approved_count ||
            0
        ) + 1;

      const newState = {
        ...oldState,

        id: customerId,

        approved_count:
          approvedCount,

        prize_status:
          approval?.prize_status ||
          "none",

        prize_expires_at:
          approval?.prize_expires_at ||
          null,
      };

      localStorage.setItem(
        STATE_KEY,
        JSON.stringify(
          newState
        )
      );

      localStorage.setItem(
        "tal_count",
        String(
          approvedCount
        )
      );

      setProgress(100);

      setSuccess(true);

      setMessage(
        `تم قبول الفاتورة بنجاح. الفواتير المقبولة: ${approvedCount}/4`
      );

      /*
       * عند الفاتورة الرابعة:
       * الانتقال لاختيار اللعبة.
       */
      setTimeout(() => {
        if (
          approvedCount >= 4
        ) {
          navigate(
            "/select-game"
          );
          return;
        }

        setFile(null);

        if (preview) {
          URL.revokeObjectURL(
            preview
          );
        }

        setPreview("");

        setProgress(0);

        setSuccess(false);

        setMessage(
          `تم قبول الفاتورة. باقي ${
            4 - approvedCount
          } فاتورة للحصول على اللعبة المجانية.`
        );
      }, 1200);
    } catch (err) {
      console.error(err);

      const errorText =
        String(
          err?.message ||
            err ||
            ""
        );

      if (
        errorText.includes(
          "تم استخدام هذه الفاتورة"
        )
      ) {
        setError(
          "تم استخدام هذه الفاتورة من قبل ولا يمكن استخدامها مرة أخرى."
        );
      } else {
        setError(
          "حدث خطأ أثناء فحص الفاتورة. يرجى المحاولة مرة أخرى بصورة أوضح."
        );
      }

      setMessage("");
    } finally {
      setLoading(false);
    }
  }

  const count =
    Number(
      JSON.parse(
        localStorage.getItem(
          STATE_KEY
        ) || "{}"
      )?.approved_count || 0
    );

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-slate-950 px-4 py-6 text-white"
    >
      <div className="mx-auto w-full max-w-xl">

        <div className="mb-5 text-center">

          <div className="mb-3 text-4xl">
            🎁
          </div>

          <h1 className="text-2xl font-bold">
            رفع الفاتورة
          </h1>

          <p className="mt-2 text-sm text-white/60">
            ارفع صورة فاتورة تل البركة
            المعتمدة واحصل على مكافآتك
          </p>

        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">

          <div className="mb-6">

            <div className="mb-2 flex items-center justify-between text-sm">

              <span className="text-white/70">
                تقدم المكافأة
              </span>

              <span className="font-bold text-amber-300">
                {Math.min(count, 4)}/4
              </span>

            </div>

            <div className="grid grid-cols-4 gap-2">

              {[1, 2, 3, 4].map(
                (step) => (
                  <div
                    key={step}
                    className={`h-2 rounded-full ${
                      count >= step
                        ? "bg-amber-400"
                        : "bg-white/10"
                    }`}
                  />
                )
              )}

            </div>

          </div>

          {!file && (
            <div className="rounded-2xl border-2 border-dashed border-white/15 bg-white/5 p-5">

              <div className="mb-5 text-center">

                <div className="mb-3 flex justify-center">

                  <UploadIcon
                    className="h-10 w-10 text-amber-300"
                  />

                </div>

                <h2 className="font-bold">
                  اختر طريقة رفع الفاتورة
                </h2>

                <p className="mt-1 text-xs text-white/50">
                  يمكنك تصوير الفاتورة
                  مباشرة أو اختيار صورة
                  موجودة في الهاتف
                </p>

              </div>

              <div className="grid gap-3">

                <Button
                  type="button"
                  onClick={() =>
                    cameraInputRef.current?.click()
                  }
                  disabled={loading}
                  className="h-14 rounded-2xl bg-amber-400 text-lg font-bold text-slate-950 hover:bg-amber-300"
                >
                  <Camera className="ml-2 h-5 w-5" />
                  تصوير الفاتورة
                </Button>

                <Button
                  type="button"
                  onClick={() =>
                    fileInputRef.current?.click()
                  }
                  disabled={loading}
                  variant="outline"
                  className="h-14 rounded-2xl border-white/15 bg-white/5 text-lg text-white hover:bg-white/10"
                >
                  <UploadIcon className="ml-2 h-5 w-5" />
                  رفع الفاتورة من الهاتف
                </Button>

              </div>

              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={
                  handleFileChange
                }
                className="hidden"
              />

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={
                  handleFileChange
                }
                className="hidden"
              />

            </div>
          )}

          {file && preview && (
            <div className="space-y-4">

              <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">

                <img
                  src={preview}
                  alt="معاينة الفاتورة"
                  className="max-h-[520px] w-full object-contain"
                />

              </div>

              <Button
                type="button"
                variant="outline"
                disabled={loading}
                onClick={() => {
                  setFile(null);
                  setError("");
                  setMessage("");
                  setSuccess(false);
                  setProgress(0);
                }}
                className="w-full rounded-2xl border-white/15 bg-white/5 text-white hover:bg-white/10"
              >
                <RotateCcw className="ml-2 h-4 w-4" />
                تغيير الصورة
              </Button>

            </div>
          )}

          {error && (
            <div className="mt-4 flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">

              <XCircle className="mt-0.5 h-5 w-5 shrink-0" />

              <span>
                {error}
              </span>

            </div>
          )}

          {message && (
            <div
              className={`mt-4 flex items-start gap-3 rounded-2xl p-4 text-sm ${
                success
                  ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                  : "border border-amber-500/20 bg-amber-500/10 text-amber-100"
              }`}
            >

              {success ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
              ) : (
                <Loader2
                  className={`mt-0.5 h-5 w-5 shrink-0 ${
                    loading
                      ? "animate-spin"
                      : ""
                  }`}
                />
              )}

              <span>
                {message}
              </span>

            </div>
          )}

          {loading && (
            <div className="mt-4">

              <div className="mb-2 flex justify-between text-xs text-white/50">

                <span>
                  جاري الفحص...
                </span>

                <span>
                  {progress}%
                </span>

              </div>

              <div className="h-2 overflow-hidden rounded-full bg-white/10">

                <div
                  className="h-full rounded-full bg-amber-400 transition-all duration-300"
                  style={{
                    width: `${progress}%`,
                  }}
                />

              </div>

            </div>
          )}

          {file && (
            <Button
              type="button"
              onClick={submitInvoice}
              disabled={loading}
              className="mt-5 h-14 w-full rounded-2xl bg-white text-lg font-bold text-slate-950 hover:bg-white/90"
            >

              {loading ? (
                <>
                  <Loader2 className="ml-2 h-5 w-5 animate-spin" />
                  جاري التحقق...
                </>
              ) : success ? (
                <>
                  <CheckCircle2 className="ml-2 h-5 w-5" />
                  تم قبول الفاتورة
                </>
              ) : (
                <>
                  <CheckCircle2 className="ml-2 h-5 w-5" />
                  تحقق من الفاتورة
                </>
              )}

            </Button>
          )}

          <div className="mt-5 rounded-2xl border border-amber-400/10 bg-amber-400/5 p-4 text-center text-xs leading-6 text-white/60">

            <Gift className="mx-auto mb-2 h-5 w-5 text-amber-300" />

            يجب أن تكون الفاتورة من
            مؤسسة تل البركة وبها بيانات
            الفاتورة الضريبية ورقم الفاتورة.

            <br />

            يتم استخدام QR كمساعدة فقط
            عند الحاجة، وليس شرطًا لقبول الفاتورة.

          </div>

        </div>
      </div>
    </div>
  );
    }
