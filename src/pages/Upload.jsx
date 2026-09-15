import React from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function Upload() {
  const navigate = useNavigate();

  const cameraInputRef = React.useRef(null);
  const fileInputRef = React.useRef(null);

  const [uploading, setUploading] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [error, setError] = React.useState("");

  async function handleFile(file) {
    if (!file) return;

    setError("");
    setMessage("");
    setUploading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        throw new Error("لم يتم العثور على جلسة المستخدم");
      }

      const extension =
        file.name?.split(".").pop()?.toLowerCase() ||
        (file.type === "application/pdf" ? "pdf" : "jpg");

      const filePath = `${session.user.id}/${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("invoices")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      setMessage(
        "تم رفع الفاتورة بنجاح ✅ سيتم فحص بيانات الفاتورة في الخطوة التالية."
      );
    } catch (e) {
      console.error(e);
      setError(e?.message || "تعذر رفع الفاتورة، حاول مرة أخرى");
    } finally {
      setUploading(false);
    }
  }

  function onCameraChange(e) {
    const file = e.target.files?.[0];
    handleFile(file);
    e.target.value = "";
  }

  function onFileChange(e) {
    const file = e.target.files?.[0];
    handleFile(file);
    e.target.value = "";
  }

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-slate-950 px-4 py-8 text-white"
    >
      <div className="mx-auto max-w-md">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl">
          <h1 className="text-center text-2xl font-bold">
            رفع الفاتورة
          </h1>

          <p className="mt-3 text-center text-sm text-white/60">
            يمكنك تصوير الفاتورة بالكاميرا أو اختيار صورة موجودة على هاتفك.
          </p>

          {/* Camera input */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onCameraChange}
            className="hidden"
          />

          {/* Gallery / Files input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf"
            onChange={onFileChange}
            className="hidden"
          />

          <div className="mt-6 space-y-3">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              disabled={uploading}
              className="w-full rounded-2xl bg-emerald-500 px-5 py-4 text-lg font-bold text-black transition hover:bg-emerald-400 disabled:opacity-50"
            >
              📷 تصوير الفاتورة
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full rounded-2xl bg-blue-500 px-5 py-4 text-lg font-bold text-white transition hover:bg-blue-400 disabled:opacity-50"
            >
              📁 رفع الفاتورة من الهاتف
            </button>
          </div>

          {uploading && (
            <div className="mt-5 rounded-2xl bg-white/10 p-4 text-center">
              جاري رفع الفاتورة... ⏳
            </div>
          )}

          {message && (
            <div className="mt-5 rounded-2xl bg-emerald-500/15 p-4 text-center text-emerald-300">
              {message}
            </div>
          )}

          {error && (
            <div className="mt-5 rounded-2xl bg-red-500/15 p-4 text-center text-red-300">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={() => navigate("/")}
            disabled={uploading}
            className="mt-5 w-full rounded-2xl border border-white/10 px-5 py-3 text-white/70 hover:bg-white/5"
          >
            رجوع
          </button>
        </div>
      </div>
    </div>
  );
}
