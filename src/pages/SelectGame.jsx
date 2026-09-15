import React from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { GAMES } from "../lib/games";

const ACTIVE_CUSTOMER_KEY = "tal_active_customer_id";

export default function SelectGame() {
  const navigate = useNavigate();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  async function selectGame(gameKey) {
    setLoading(true);
    setError("");

    try {
      const customerId =
        localStorage.getItem(ACTIVE_CUSTOMER_KEY) ||
        localStorage.getItem("tal_customer_id");

      if (!customerId) {
        throw new Error(
          "لم يتم العثور على العميل الحالي. ارجع للصفحة الرئيسية."
        );
      }

      const { data: customer, error: customerError } = await supabase
        .from("customers")
        .select(
          "id, name, approved_count, prize_status, prize_expires_at, game_selected"
        )
        .eq("id", customerId)
        .single();

      if (customerError) throw customerError;
      if (!customer) throw new Error("لم يتم العثور على بيانات العميل.");

      if (Number(customer.approved_count) < 4) {
        throw new Error("لا يمكن اختيار الجائزة قبل اعتماد 4 فواتير.");
      }

      if (customer.prize_status !== "available") {
        throw new Error("المكافأة غير متاحة حاليًا.");
      }

      const { error: updateError } = await supabase
        .from("customers")
        .update({
          game_selected: gameKey,
          prize_expires_at: null,
        })
        .eq("id", customer.id);

      if (updateError) throw updateError;

      const newState = {
        ...customer,
        game_selected: gameKey,
        prize_expires_at: null,
      };

      localStorage.setItem("tal_state", JSON.stringify(newState));

      navigate("/prize");
    } catch (e) {
      console.error(e);
      setError(e?.message || "تعذر اختيار الجائزة");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div dir="rtl" className="min-h-full px-4 py-6">
      <div className="mx-auto max-w-5xl">

        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-2 font-bold text-amber-300">
            🎉 مبروك! أكملت 4 فواتير معتمدة
          </div>

          <h1 className="text-3xl font-black text-white md:text-4xl">
            اختر جائزتك المجانية
          </h1>

          <p className="mt-2 text-slate-300">
            اختر واحدة من الجوائز الستة، وبعدها أكد استلامها لبدء مدة الساعة.
          </p>
        </div>

        {error && (
          <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center text-red-200">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {GAMES.map((game) => (
            <button
              key={game.key}
              onClick={() => selectGame(game.key)}
              disabled={loading}
              className="group overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/80 text-right shadow-lg transition hover:-translate-y-1 hover:border-amber-400/60 disabled:opacity-50"
            >
              <div className="aspect-[4/3] overflow-hidden bg-slate-800">
                <img
                  src={game.image}
                  alt={game.name}
                  className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                />
              </div>

              <div className="p-4">
                <div className="text-xl font-extrabold text-white">
                  {game.name}
                </div>

                <div className="mt-1 text-sm text-amber-300">
                  اضغط لاختيار الجائزة
                </div>
              </div>
            </button>
          ))}
        </div>

      </div>
    </div>
  );
              }
