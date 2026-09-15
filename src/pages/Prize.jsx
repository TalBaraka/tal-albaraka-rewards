import React from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { GAME_BY_KEY } from "../lib/games";

const ACTIVE_CUSTOMER_KEY = "tal_active_customer_id";

function formatTime(ms) {
  if (ms <= 0) return "00:00:00";

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    String(seconds).padStart(2, "0"),
  ].join(":");
}

export default function Prize() {
  const navigate = useNavigate();

  const [customer, setCustomer] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [confirming, setConfirming] = React.useState(false);
  const [error, setError] = React.useState("");
  const [now, setNow] = React.useState(Date.now());

  React.useEffect(() => {
    loadCustomer();
  }, []);

  React.useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  async function loadCustomer() {
    try {
      const customerId =
        localStorage.getItem(ACTIVE_CUSTOMER_KEY) ||
        localStorage.getItem("tal_customer_id");

      if (!customerId) {
        throw new Error("لم يتم العثور على العميل الحالي.");
      }

      const { data, error: customerError } = await supabase
        .from("customers")
        .select(
          "id, name, approved_count, prize_status, prize_expires_at, game_selected, prize_used_at"
        )
        .eq("id", customerId)
        .single();

      if (customerError) throw customerError;
      if (!data) throw new Error("لم يتم العثور على بيانات العميل.");

      if (Number(data.approved_count) < 4) {
        throw new Error("لم تكتمل 4 فواتير معتمدة بعد.");
      }

      if (!data.game_selected) {
        throw new Error("لم يتم اختيار جائزة.");
      }

      if (!GAME_BY_KEY(data.game_selected)) {
        throw new Error("الجائزة المختارة غير موجودة.");
      }

      setCustomer(data);
      localStorage.setItem("tal_state", JSON.stringify(data));
    } catch (e) {
      console.error(e);
      setError(e?.message || "تعذر تحميل الجائزة");
    } finally {
      setLoading(false);
    }
  }

  async function confirmPrize() {
    if (!customer || confirming) return;

    setConfirming(true);
    setError("");

    try {
      if (customer.prize_status !== "available") return;

      const usedAt = new Date();
      const expiresAt = new Date(
        usedAt.getTime() + 60 * 60 * 1000
      );

      const { data, error: updateError } = await supabase
        .from("customers")
        .update({
          prize_status: "used",
          prize_expires_at: expiresAt.toISOString(),
          prize_used_at: usedAt.toISOString(),
        })
        .eq("id", customer.id)
        .select(
          "id, name, approved_count, prize_status, prize_expires_at, game_selected, prize_used_at"
        )
        .single();

      if (updateError) throw updateError;

      setCustomer(data);
      localStorage.setItem("tal_state", JSON.stringify(data));
      setNow(Date.now());
    } catch (e) {
      console.error(e);
      setError(e?.message || "تعذر تأكيد استلام الجائزة");
    } finally {
      setConfirming(false);
    }
  }

  if (loading) {
    return (
      <div
        dir="rtl"
        className="flex min-h-[70vh] items-center justify-center"
      >
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-slate-700 border-t-amber-400" />
          <p className="text-slate-300">جاري تحميل جائزتك...</p>
        </div>
      </div>
    );
  }

  if (error && !customer) {
    return (
      <div dir="rtl" className="px-4 py-10">
        <div className="mx-auto max-w-lg rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center">
          <div className="mb-3 text-4xl">⚠️</div>
          <p className="text-red-200">{error}</p>
          <button
            onClick={() => navigate("/select-game")}
            className="mt-6 rounded-xl bg-amber-500 px-6 py-3 font-bold text-slate-950"
          >
            العودة للجوائز
          </button>
        </div>
      </div>
    );
  }

  const game = customer ? GAME_BY_KEY(customer.game_selected) : null;

  const expiresAt = customer?.prize_expires_at
    ? new Date(customer.prize_expires_at).getTime()
    : null;

  const remaining = expiresAt ? expiresAt - now : null;

  const confirmed =
    customer?.prize_status === "used" && expiresAt !== null;

  const expired = confirmed && remaining <= 0;

  return (
    <div dir="rtl" className="px-4 py-6">
      <div className="mx-auto max-w-xl">

        <div className="mb-6 text-center">
          <div className="text-5xl">🎉</div>

          <h1 className="mt-3 text-3xl font-black text-white">
            مبروك يا {customer?.name || "عميلنا العزيز"}!
          </h1>

          <p className="mt-2 text-slate-300">
            دي جائزتك المجانية من تال البركة
          </p>
        </div>

        {game && (
          <div className="overflow-hidden rounded-3xl border border-amber-400/30 bg-slate-900 shadow-2xl">

            <div className="aspect-[4/3] overflow-hidden">
              <img
                src={game.image}
                alt={game.name}
                className="h-full w-full object-cover"
              />
            </div>

            <div className="p-6 text-center">

              <div className="text-3xl font-black text-white">
                {game.name}
              </div>

              {!confirmed && (
                <>
                  <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4">
                    <div className="text-lg font-bold text-amber-300">
                      🎁 جائزتك جاهزة!
                    </div>

                    <p className="mt-2 text-sm text-slate-300">
                      اضغط على الزر لتأكيد استلام الجائزة.
                      <br />
                      يبدأ وقت الساعة فقط بعد التأكيد.
                    </p>
                  </div>

                  <button
                    onClick={confirmPrize}
                    disabled={confirming}
                    className="mt-6 w-full rounded-2xl bg-gradient-to-r from-amber-400 to-yellow-500 px-6 py-4 text-xl font-black text-slate-950 shadow-lg transition hover:scale-[1.02] disabled:opacity-50"
                  >
                    {confirming
                      ? "جاري التأكيد..."
                      : "✅ تأكيد استلام الجائزة"}
                  </button>
                </>
              )}

              {confirmed && !expired && (
                <>
                  <div className="mt-5 rounded-2xl border border-green-400/30 bg-green-400/10 p-5">
                    <div className="text-xl font-bold text-green-300">
                      ✅ تم تأكيد استلام الجائزة
                    </div>

                    <p className="mt-2 text-slate-300">
                      الوقت المتبقي لاستلام الجائزة:
                    </p>

                    <div className="mt-4 text-5xl font-black tracking-wider text-amber-300">
                      {formatTime(remaining)}
                    </div>
                  </div>
                </>
              )}

              {expired && (
                <div className="mt-5 rounded-2xl border border-red-400/30 bg-red-400/10 p-5">
                  <div className="text-2xl font-black text-red-300">
                    ⏰ انتهت مدة الجائزة
                  </div>

                  <p className="mt-2 text-slate-300">
                    انتهت الساعة المخصصة لاستلام الجائزة.
                  </p>
                </div>
              )}

              {error && (
                <div className="mt-4 rounded-xl bg-red-500/10 p-3 text-red-200">
                  {error}
                </div>
              )}

            </div>
          </div>
        )}

      </div>
    </div>
  );
}
