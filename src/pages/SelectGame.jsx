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

export default function SelectGame() {
  const navigate = useNavigate();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  async function selectGame(gameKey) {
    setLoading(true);
    setError("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        throw new Error("لم يتم العثور على جلسة المستخدم");
      }

      const { data: customer, error: customerError } = await supabase
        .from("customers")
        .select("id, prize_status")
        .eq("user_id", session.user.id)
        .single();

      if (customerError) throw customerError;

      const { error: updateError } = await supabase
        .from("customers")
        .update({
          game_selected: gameKey,
        })
        .eq("id", customer.id);

      if (updateError) throw updateError;

      navigate("/prize");
    } catch (e) {
      console.error(e);
      setError(e?.message || "تعذر اختيار اللعبة");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div dir="rtl">
      <h1>اختر لعبتك</h1>

      {error && <p>{error}</p>}

      {GAMES.map((game) => (
        <button
          key={game.key}
          onClick={() => selectGame(game.key)}
          disabled={loading}
        >
          {game.name}
        </button>
      ))}
    </div>
  );
    }
