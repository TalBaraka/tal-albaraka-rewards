import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Image } from "@/components/ui/image";
import { Ticket, Sparkles, Gift, History } from "lucide-react";

const LOGO =
  "https://media.base44.com/images/public/user_6aa5b6794b20a238746064f4/67690d900_file_00000000b9e88211a5be3d9760e16833.png";

const DEVICE_KEY = "tal_baraka_device_key";
const ACTIVE_CUSTOMER_KEY = "tal_active_customer_id";

function getDeviceKey() {
  let key = localStorage.getItem(DEVICE_KEY);

  if (!key) {
    key =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    localStorage.setItem(DEVICE_KEY, key);
  }

  return key;
}

export default function Home() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasPreviousCustomers, setHasPreviousCustomers] = useState(false);

  const checkPreviousCustomers = async () => {
    try {
      const deviceKey = getDeviceKey();

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) return;

      const { data: device } = await supabase
        .from("devices")
        .select("id")
        .eq("device_key", deviceKey)
        .maybeSingle();

      if (!device) return;

      const { count } = await supabase
        .from("device_customers")
        .select("id", { count: "exact", head: true })
        .eq("device_id", device.id);

      setHasPreviousCustomers((count || 0) > 0);
    } catch (e) {
      console.error("Previous customers error:", e);
    }
  };

  const start = async () => {
    const trimmed = name.trim();

    if (!trimmed) {
      setError("يرجى كتابة الاسم");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const deviceKey = getDeviceKey();

      let {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      if (!session?.user) {
        const { data, error: authError } =
          await supabase.auth.signInAnonymously();

        if (authError) throw authError;

        session = {
          user: data.user,
        };
      }

      const user = session.user;

      /*
       * إنشاء سجل الجهاز أو استرجاعه.
       */
      const { data: existingDevice, error: deviceFindError } =
        await supabase
          .from("devices")
          .select("id")
          .eq("device_key", deviceKey)
          .maybeSingle();

      if (deviceFindError) throw deviceFindError;

      let device = existingDevice;

      if (!device) {
        const { data: newDevice, error: deviceCreateError } =
          await supabase
            .from("devices")
            .insert({
              device_key: deviceKey,
            })
            .select("id")
            .single();

        if (deviceCreateError) throw deviceCreateError;

        device = newDevice;
      }

      /*
       * البحث عن نفس الاسم على نفس الجهاز.
       *
       * إذا كان موجودًا:
       * نرجع للعميل القديم ونكمل من نفس المكان.
       */
      const { data: existingDeviceCustomer, error: existingError } =
        await supabase
          .from("device_customers")
          .select(`
            id,
            customer_id,
            name
          `)
          .eq("device_id", device.id)
          .ilike("name", trimmed)
          .maybeSingle();

      if (existingError) throw existingError;

      let customer;

      if (existingDeviceCustomer?.customer_id) {
        /*
         * العميل موجود بالفعل على هذا الهاتف.
         */
        const { data: oldCustomer, error: oldCustomerError } =
          await supabase
            .from("customers")
            .select(`
              id,
              user_id,
              name,
              approved_count,
              prize_status,
              prize_expires_at,
              game_selected,
              prize_used_at,
              created_at,
              updated_at
            `)
            .eq("id", existingDeviceCustomer.customer_id)
            .single();

        if (oldCustomerError) throw oldCustomerError;

        customer = oldCustomer;
      } else {
        /*
         * عميل جديد على نفس الجهاز.
         */
        const { data: newCustomer, error: customerError } =
          await supabase
            .from("customers")
            .insert({
              user_id: user.id,
              name: trimmed,
              approved_count: 0,
              prize_status: "none",
            })
            .select()
            .single();

        if (customerError) throw customerError;

        customer = newCustomer;

        /*
         * ربط العميل بالجهاز.
         */
        const { error: linkError } = await supabase
          .from("device_customers")
          .insert({
            device_id: device.id,
            customer_id: customer.id,
            name: trimmed,
          });

        if (linkError) throw linkError;
      }

      /*
       * حفظ العميل النشط على الهاتف.
       */
      localStorage.setItem(
        ACTIVE_CUSTOMER_KEY,
        customer.id
      );

      localStorage.setItem(
        "tal_customer_id",
        customer.id
      );

      localStorage.setItem(
        "tal_customer_name",
        customer.name
      );

      localStorage.setItem(
        "tal_count",
        String(customer.approved_count || 0)
      );

      localStorage.setItem(
        "tal_state",
        JSON.stringify(customer)
      );

      navigate("/upload");
    } catch (e) {
      console.error("Start error:", e);

      setError(
        e?.message ||
          "تعذر بدء الجلسة، حاول مرة أخرى"
      );
    } finally {
      setLoading(false);
    }
  };

  /*
   * فحص وجود عملاء سابقين بمجرد فتح الصفحة.
   */
  useState(() => {
    checkPreviousCustomers();
  });

  return (
    <div className="flex flex-col items-center text-center">
      <div className="mt-6 h-28 w-28 overflow-hidden rounded-full ring-4 ring-amber-400/50 shadow-[0_0_50px_rgba(251,191,36,0.4)]">
        <Image
          src={LOGO}
          alt="تال البركة"
          className="h-full w-full"
          fittingType="fill"
        />
      </div>

      <h1 className="mt-7 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
        اربح لعبة مجانية
      </h1>

      <p className="mt-3 max-w-md text-balance text-white/70">
        ارفع 4 فواتير معتمدة من تال البركة واحصل على لعبة مجانية واحدة من اختيارك.
      </p>

      <div className="mt-8 w-full max-w-sm space-y-3 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
        <label
          htmlFor="name"
          className="flex items-center gap-2 text-sm font-medium text-white/80"
        >
          <Sparkles className="h-4 w-4 text-amber-300" />
          اكتب اسمك
        </label>

        <Input
          id="name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError("");
          }}
          onKeyDown={(e) => e.key === "Enter" && start()}
          placeholder="اكتب اسمك"
          className="h-12 bg-white/10 text-center text-lg text-white placeholder:text-white/40 border-white/15"
        />

        {error && (
          <p className="text-sm text-rose-300">
            {error}
          </p>
        )}

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
        4 فواتير معتمدة = فتح جميع الألعاب
      </div>

      <Link
        to="/my-rewards"
        className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-white/15 px-4 py-2 text-sm text-white/70 hover:bg-white/10"
      >
        <Gift className="h-4 w-4 text-amber-300" />
        عرض مكافآتي
      </Link>

      {hasPreviousCustomers && (
        <div className="mt-3 flex items-center gap-2 text-xs text-white/40">
          <History className="h-4 w-4" />
          بياناتك السابقة محفوظة على هذا الجهاز
        </div>
      )}
    </div>
  );
        }
