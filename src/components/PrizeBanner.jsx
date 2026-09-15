import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { GAME_BY_KEY } from "@/lib/games";
import { Gift, Timer, BadgeCheck, XCircle, Loader2 } from "lucide-react";

function fmt(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function PrizeBanner({ state, onUpdate }) {
  const navigate = useNavigate();
  const [remaining, setRemaining] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (
      state?.prize_status !== "available" ||
      !state?.prize_expires_at
    ) {
      return;
    }

    const expires = new Date(state.prize_expires_at).getTime();

    const tick = () => {
      setRemaining(
        Math.max(0, Math.floor((expires - Date.now()) / 1000))
      );
    };

    tick();

    const timer = setInterval(tick, 1000);

    return () => clearInterval(timer);
  }, [state?.prize_status, state?.prize_expires_at]);

  if (!state || state.prize_status === "none") {
    return null;
  }

  const game = state.game_selected
    ? GAME_BY_KEY(state.game_selected)
    : null;

  const confirmUse = async () => {
    if (busy || remaining === 0) {
      return;
    }

    setBusy(true);

    try {
      const { data, error } = await supabase
        .from("customers")
        .update({
          prize_status: "used",
          prize_used_at: new Date().toISOString(),
        })
        .eq("id", state.id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      localStorage.setItem(
        "tal_state",
        JSON.stringify(data)
      );

      if (onUpdate) {
        onUpdate(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  if (state.prize_status === "available") {
    return (
      <div className="rounded-3xl border border-amber-400/30 bg-gradient-to-l from-amber-400/15 to-rose-500/15 p-6 text-center backdrop-blur">
        <Gift className="mx-auto h-10 w-10 text-amber-300" />

        <div className="mt-3 font-display text-xl font-bold">
          اكتملت الفواتير! 🎉
        </div>

        <div className="mt-2 flex items-center justify-center gap-1.5 text-sm text-amber-200">
          <Timer className="h-4 w-4" />
          صالحة لمدة ساعة — متبقي {fmt(remaining)}
        </div>

        {game ? (
          <>
            <div className="mt-3 text-sm text-white/80">
              لعبتك:{" "}
              <span className="font-bold text-amber-300">
                {game.name}
              </span>
            </div>

            <Button
              onClick={confirmUse}
              disabled={busy || remaining === 0}
              className="mt-4 h-12 w-full bg-emerald-500 text-base font-bold text-black hover:bg-emerald-400"
            >
              {busy ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                "تأكيد الاستعمال"
              )}
            </Button>
          </>
        ) : (
          <Button
            onClick={() => navigate("/select-game")}
            className="mt-4 h-12 w-full bg-gradient-to-l from-amber-400 to-rose-500 text-base font-bold text-black"
          >
            اختر لعبتك المجانية
          </Button>
        )}
      </div>
    );
  }

  if (state.prize_status === "used") {
    return (
      <div className="rounded-3xl border border-emerald-400/30 bg-emerald-400/10 p-6 text-center backdrop-blur">
        <BadgeCheck className="mx-auto h-10 w-10 text-emerald-300" />

        <div className="mt-3 font-display text-lg font-bold text-emerald-200">
          تم استخدام الجائزة
        </div>

        {game && (
          <div className="mt-1 text-sm text-white/70">
            اللعبة: {game.name}
          </div>
        )}

        {state.prize_used_at && (
          <div className="mt-1 text-xs text-white/50">
            بتاريخ{" "}
            {new Date(state.prize_used_at).toLocaleString("ar-EG")}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-white/15 bg-white/5 p-6 text-center backdrop-blur">
      <XCircle className="mx-auto h-10 w-10 text-white/50" />

      <div className="mt-3 font-display text-lg font-bold text-white/80">
        انتهت صلاحية الجائزة
      </div>

      {game && (
        <div className="mt-1 text-sm text-white/60">
          اللعبة كانت: {game.name}
        </div>
      )}
    </div>
  );
        }
