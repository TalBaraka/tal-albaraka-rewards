import { useEffect, useState, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Image } from "@/components/ui/image";
import {
  UploadCloud,
  CheckCircle2,
  XCircle,
  Loader2,
  Gift,
  RotateCcw,
} from "lucide-react";
import PrizeBanner from "@/components/PrizeBanner";

export default function Upload() {
  const navigate = useNavigate();
  const fileRef = useRef(null);

  const [customerId, setCustomerId] = useState(null);
  const [name, setName] = useState("");
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [prize, setPrize] = useState(null);

  useEffect(() => {
    const id = localStorage.getItem("tal_customer_id");
    const nm = localStorage.getItem("tal_customer_name");
    const cnt = Number(localStorage.getItem("tal_count") || 0);

    if (!id) {
      navigate("/");
      return;
    }

    setCustomerId(id);
    setName(nm || "");
    setCount(cnt);

    try {
      const savedState = JSON.parse(
        localStorage.getItem("tal_state") || "null"
      );

      if (savedState) {
        setPrize(savedState);
      }
    } catch (_) {
      // ignore invalid local storage
    }
  }, [navigate]);

  const TARGET = 4;
  const progress = Math.min(count, TARGET);
  const complete = count >= TARGET;

  const handleFile = async (file) => {
    if (!file || !customerId) return;

    setBusy(true);
    setStatus(null);
    setPreview(null);

    try {
      // عرض الصورة للمستخدم
      const localPreview = URL.createObjectURL(file);
      setPreview(localPreview);

      // التأكد من وجود جلسة Supabase
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error("انتهت الجلسة");
      }

      // اسم فريد للصورة
      const fileExt = file.name.split(".").pop() || "jpg";
      const fileName = `${user.id}/${crypto.randomUUID()}.${fileExt}`;

      /*
       * رفع الصورة إلى Supabase Storage
       *
       * ملاحظة:
       * يجب إنشاء Bucket باسم invoices في Supabase
       */
      const { error: uploadError } = await supabase.storage
        .from("invoices")
        .upload(fileName, file, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      /*
       * الحصول على رابط الصورة
       */
      const {
        data: { publicUrl },
      } = supabase.storage
        .from("invoices")
        .getPublicUrl(fileName);

      /*
       * في هذه المرحلة لا نعتمد الفاتورة تلقائيًا.
       * سيتم إضافة فحص الفاتورة المجاني في الخطوة التالية.
       */
      setStatus({
        type: "success",
        message:
          "تم رفع الفاتورة بنجاح ✅\nسيتم فحص بيانات الفاتورة في الخطوة التالية.",
      });

      console.log("Invoice uploaded:", publicUrl);
    } catch (e) {
      console.error("Invoice upload error:", e);

      setStatus({
        type: "error",
        message: "تعذر رفع الفاتورة، حاول مرة أخرى.",
      });
    } finally {
      setBusy(false);

      if (fileRef.current) {
        fileRef.current.value = "";
      }
    }
  };

  const onPick = (e) => {
    const file = e.target.files?.[0];

    if (file) {
      handleFile(file);
    }
  };

  const reset = async () => {
    localStorage.removeItem("tal_customer_id");
    localStorage.removeItem("tal_customer_name");
    localStorage.removeItem("tal_count");
    localStorage.removeItem("tal_state");

    await supabase.auth.signOut();

    navigate("/");
  };

  return (
    <div className="space-y-6">
      {/* greeting + counter */}
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-white/60">مرحباً</div>

            <div className="font-display text-xl font-bold">
              {name || "عميلنا"}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/my-rewards"
              className="flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-400/20"
            >
              <Gift className="h-3.5 w-3.5" />
              مكافآتي
            </Link>

            <button
              onClick={reset}
              className="flex items-center gap-1 rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              جلسة جديدة
            </button>
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-white/70">
              الفواتير المعتمدة
            </span>

            <span className="font-bold text-amber-300">
              {progress}/{TARGET}
            </span>
          </div>

          <div className="flex gap-2">
            {Array.from({ length: TARGET }).map((_, i) => (
              <div
                key={i}
                className={`h-2.5 flex-1 rounded-full transition-all duration-500 ${
                  i < progress
                    ? "bg-gradient-to-l from-amber-400 to-rose-500"
                    : "bg-white/10"
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* upload zone */}
      {!complete && (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
          <label
            htmlFor="inv"
            className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-white/15 bg-white/5 px-6 py-10 text-center transition hover:border-amber-400/60 hover:bg-white/10"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-400/15 text-amber-300">
              {busy ? (
                <Loader2 className="h-7 w-7 animate-spin" />
              ) : (
                <UploadCloud className="h-7 w-7" />
              )}
            </div>

            <div>
              <div className="font-medium">
                {busy
                  ? "جارٍ رفع الفاتورة..."
                  : "ارفع صورة الفاتورة"}
              </div>

              <div className="mt-1 text-xs text-white/50">
                سيتم رفع الصورة ثم فحص بيانات الفاتورة
              </div>
            </div>

            <input
              id="inv"
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={onPick}
              className="hidden"
              disabled={busy}
            />
          </label>

          {preview && (
            <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
              <Image
                src={preview}
                alt="الفاتورة"
                className="max-h-56 w-full object-contain bg-white"
                fittingType="fit"
              />
            </div>
          )}

          {status && (
            <div
              className={`mt-4 flex items-start gap-2 rounded-xl border p-3 text-sm ${
                status.type === "success"
                  ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                  : "border-rose-400/30 bg-rose-400/10 text-rose-200"
              }`}
            >
              {status.type === "success" ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
              ) : (
                <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
              )}

              <span className="whitespace-pre-line">
                {status.message}
              </span>
            </div>
          )}
        </div>
      )}

      {/* prize banner */}
      {complete && prize && (
        <PrizeBanner
          state={prize}
          onUpdate={setPrize}
        />
      )}
    </div>
  );
      }
