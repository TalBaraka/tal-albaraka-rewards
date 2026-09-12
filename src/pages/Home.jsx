import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Image } from "@/components/ui/image";
import { Ticket, Sparkles } from "lucide-react";

const LOGO =
  "https://media.base44.com/images/public/user_6aa5b6794b20a238746064f4/67690d900_file_00000000b9e88211a5be3d9760e16833.png";

export default function Home() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const start = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("يرجى كتابة الاسم first");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const session_id = crypto.randomUUID();
      const res = await base44.functions.invoke("registerCustomer", { name: trimmed, session_id });
      const data = res?.data || res;
      if (data?.id) {
        localStorage.setItem("tal_customer_id", data.id);
        localStorage.setItem("tal_customer_name", data.name);
        localStorage.setItem("tal_count", String(data.approved_count || 0));
      }
      navigate("/upload");
    } catch (e) {
      setError("تعذر بدء الجلسة، حاول مرة أخرى");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center text-center">
      <div className="mt-6 h-28 w-28 overflow-hidden rounded-full ring-4 ring-amber-400/50 shadow-[0_0_50px_rgba(251,191,36,0.4)]">
        <Image src={LOGO} alt="تال البركة" className="h-full w-full" fittingType="fill" />
      </div>

      <h1 className="mt-7 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
        اربح لعبة مجانية
      </h1>
      <p className="mt-3 max-w-md text-balance text-white/70">
        ارفع 4 فواتير معتمدة من تال البركة واحصل على لعبة مجانية واحدة من اختيارك.
      </p>

      <div className="mt-8 w-full max-w-sm space-y-3 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
        <label htmlFor="name" className="flex items-center gap-2 text-sm font-medium text-white/80">
          <Sparkles className="h-4 w-4 text-amber-300" />
          اكتب اسمك
        </label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && start()}
          placeholder="اكتب اسمك"
          className="h-12 bg-white/10 text-center text-lg text-white placeholder:text-white/40 border-white/15"
        />
        {error && <p className="text-sm text-rose-300">{error}</p>}
        <Button
          onClick={start}
          disabled={loading}
          className="h-12 w-full bg-gradient-to-l from-amber-400 to-rose-500 text-base font-bold text-black hover:from-amber-300 hover:to-rose-400"
        >
          {loading ? "جارٍ التجهيز..." : "ابدأ الآن"}
        </Button>
      </div>

      <div className="mt-8 flex items-center gap-2 text-xs text-white/50">
        <Ticket className="h-4 w-4 text-amber-300" />
        4 فواتير معتمدة = لعبة مجانية
      </div>
    </div>
  );
}