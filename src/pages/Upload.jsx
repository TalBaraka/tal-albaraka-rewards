import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Image } from "@/components/ui/image";
import { UploadCloud, CheckCircle2, XCircle, Loader2, Gift, RotateCcw } from "lucide-react";

export default function Upload() {
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [customerId, setCustomerId] = useState(null);
  const [name, setName] = useState("");
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState(null); // {type:'success'|'error', message}
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);

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
    if (cnt >= 4) navigate("/select-game");
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
      const up = await base44.integrations.Core.UploadPublicFile({ file });
      const image_url = up?.file_url;
      if (!image_url) throw new Error("upload failed");
      setPreview(image_url);

      const res = await base44.functions.invoke("validateInvoice", {
        image_url,
        customer_id: customerId,
        customer_name: name
      });
      const data = res?.data || res;

      if (data?.approved) {
        const newCount = data.count || count + 1;
        setCount(newCount);
        localStorage.setItem("tal_count", String(newCount));
        setStatus({ type: "success", message: `تم قبول الفاتورة! ${newCount}/4` });
        if (newCount >= 4) {
          setTimeout(() => navigate("/select-game"), 900);
        }
      } else {
        setStatus({ type: "error", message: data?.message || "لم يتم قبول الفاتورة." });
      }
    } catch (e) {
      setStatus({ type: "error", message: "تعذر معالجة الفاتورة، حاول مرة أخرى." });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onPick = (e) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const reset = () => {
    localStorage.removeItem("tal_customer_id");
    localStorage.removeItem("tal_customer_name");
    localStorage.removeItem("tal_count");
    navigate("/");
  };

  return (
    <div className="space-y-6">
      {/* greeting + counter */}
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-white/60">مرحباً</div>
            <div className="font-display text-xl font-bold">{name || "عميلنا"}</div>
          </div>
          <button
            onClick={reset}
            className="flex items-center gap-1 rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10"
          >
            <RotateCcw className="h-3.5 w-3.5" /> جلسة جديدة
          </button>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-white/70">الفواتير المعتمدة</span>
            <span className="font-bold text-amber-300">{progress}/{TARGET}</span>
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
              {busy ? <Loader2 className="h-7 w-7 animate-spin" /> : <UploadCloud className="h-7 w-7" />}
            </div>
            <div>
              <div className="font-medium">
                {busy ? "جارٍ فحص الفاتورة..." : "ارفع صورة الفاتورة"}
              </div>
              <div className="mt-1 text-xs text-white/50">
                سيتم التحقق من مطابقتها للقالب المعتمد
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
              <Image src={preview} alt="الفاتورة" className="max-h-56 w-full object-contain bg-white" fittingType="fit" />
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
              <span className="whitespace-pre-line">{status.message}</span>
            </div>
          )}
        </div>
      )}

      {/* unlock banner */}
      {complete && (
        <div className="rounded-3xl border border-amber-400/30 bg-gradient-to-l from-amber-400/15 to-rose-500/15 p-6 text-center backdrop-blur">
          <Gift className="mx-auto h-10 w-10 text-amber-300" />
          <div className="mt-3 font-display text-xl font-bold">اكتملت الفواتير! 🎉</div>
          <p className="mt-1 text-sm text-white/70">يمكنك الآن اختيار لعبتك المجانية</p>
          <Button
            onClick={() => navigate("/select-game")}
            className="mt-4 h-12 w-full bg-gradient-to-l from-amber-400 to-rose-500 text-base font-bold text-black hover:from-amber-300 hover:to-rose-400"
          >
            اختر لعبتك المجانية
          </Button>
        </div>
      )}
    </div>
  );
}