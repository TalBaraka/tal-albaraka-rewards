import React from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

const GAMES = [
  { key: "memory", name: "لعبة الذاكرة" },
  { key: "quiz", name: "مسابقة الأسئلة" },
  { key: "puzzle", name: "لعبة الألغاز" },
  { key: "racing", name: "سباق السيارات" },
  { key: "math", name: "التحدي الحسابي" },
  { key: "words", name: "لعبة الكلمات" },
];

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

      const { data: customer, error: customerError } =
        await supabase
          .from("customers")
          .select(
            "id, name, approved_count, prize_status, prize_expires_at, game_selected"
          )
          .eq("id", customerId)
          .single();

      if (customerError) {
        throw customerError;
      }

      if (!customer) {
        throw new Error("لم يتم العثور على بيانات العميل.");
      }

      if (Number(customer.approved_count) < 4) {
        throw new Error(
          "لا يمكن اختيار اللعبة قبل اعتماد 4 فواتير."
        );
      }

      if (customer.prize_status !== "available") {
        throw new Error(
          "المكافأة غير متاحة حاليًا."
        );
      }

      if (
        customer.prize_expires_at &&
        new Date(customer.prize_expires_at) <= new Date()
      ) {
        throw new Error(
          "انتهت مدة صلاحية المكافأة."
        );
      }

      const { error: updateError } =
        await supabase
          .from("customers")
          .update({
            game_selected: gameKey,
          })
          .eq("id", customer.id);

      if (updateError) {
        throw updateError;
      }

      const newState = {
        ...customer,
        game_selected: gameKey,
      };

      localStorage.setItem(
        "tal_state",
        JSON.stringify(newState)
      );

      navigate("/prize");
    } catch (e) {
      console.error(e);
      setError(
        e?.message ||
          "تعذر اختيار اللعبة"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-background p-4"
    >
      <div className="mx-auto max-w-2xl py-8">

        <h1 className="mb-6 text-center text-3xl font-bold">
          اختر لعبتك
        </h1>

        <p className="mb-6 text-center text-muted-foreground">
          مبروك! أكملت 4 فواتير معتمدة. اختر لعبتك المجانية.
        </p>

        {error && (
          <div className="mb-5 rounded-lg bg-red-50 p-4 text-center text-red-700">
            {error}
          </div>
        )}

        <div className="grid gap-4">
          {GAMES.map((game) => (
            <button
              key={game.key}
              onClick={() =>
                selectGame(game.key)
              }
              disabled={loading}
              className="w-full rounded-xl border bg-card p-5 text-lg font-semibold shadow-sm transition hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
            >
              {game.name}
            </button>
          ))}
        </div>

      </div>
    </div>
  );
      }
