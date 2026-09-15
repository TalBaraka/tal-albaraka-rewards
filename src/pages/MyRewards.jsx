import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Image } from "@/components/ui/image";
import { GAMES } from "@/lib/games";
import { Lock, CheckCircle2, UploadCloud, Gift } from "lucide-react";

const TARGET = 4;

export default function MyRewards() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [count, setCount] = useState(0);
  const [prize, setPrize] = useState(null);

  useEffect(() => {
    const id =
      localStorage.getItem("tal_active_customer_id") ||
      localStorage.getItem("tal_customer_id");

    if (!id) {
      navigate("/");
      return;
    }

    setName(localStorage.getItem("tal_customer_name") || "");

    setCount(
      Number(localStorage.getItem("tal_count") || 0)
    );

    try {
      const state = JSON.parse(
        localStorage.getItem("tal_state") || "null"
      );

      if (state) {
        setPrize(state);

        setName(state.name || localStorage.getItem("tal_customer_name") || "");

        setCount(
          Number(
            state.approved_count ??
            localStorage.getItem("tal_count") ??
            0
          )
        );
      }
    } catch (_) {
      // ignore
    }
  }, [navigate]);

  const complete = count >= TARGET;
  const remaining = Math.max(0, TARGET - count);

  // اللعبة التي اختارها العميل
  const selectedGame = prize?.game_selected
    ? GAMES.find(
        (game) => game.key === prize.game_selected
      )
    : null;

  return (
    <div className="space-y-6">

      {/* حالة الفواتير */}
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-center backdrop-blur">

        <div className="text-sm text-white/60">
          مرحباً {name || "عميلنا"}
        </div>

        <div className="mt-4 font-display text-6xl font-extrabold text-amber-300">
          {count}
        </div>

        <div className="mt-1 text-sm text-white/70">
          فواتير معتمدة من {TARGET}
        </div>

        <div className="mt-5 flex gap-2">
          {Array.from({ length: TARGET }).map((_, i) => (
            <div
              key={i}
              className={`h-2.5 flex-1 rounded-full transition-all duration-500 ${
                i < count
                  ? "bg-gradient-to-l from-amber-400 to-rose-500"
                  : "bg-white/10"
              }`}
            />
          ))}
        </div>

        <p className="mt-4 text-sm text-white/70">
          {complete
            ? "تم فتح جميع الألعاب 🎉"
            : `تحتاج ${
                remaining === 1
                  ? "فاتورة واحدة"
                  : `${remaining} فواتير`
              } إضافية لفتح جميع الألعاب`}
        </p>
      </div>

      {/* ========================= */}
      {/* الجائزة التي اختارها العميل */}
      {/* ========================= */}

      {selectedGame && (
        <div className="overflow-hidden rounded-3xl border border-amber-400/30 bg-white shadow-2xl">

          {/* صورة اللعبة */}
          <div className="relative aspect-[4/3] overflow-hidden bg-slate-800">

            <Image
              src={selectedGame.image}
              alt={selectedGame.name}
              className="h-full w-full"
              fittingType="fill"
            />

            <div className="absolute right-3 top-3 rounded-full bg-green-500 px-4 py-2 text-sm font-bold text-white shadow-lg">
              ✓ جائزتك المختارة
            </div>
          </div>

          {/* معلومات الجائزة */}
          <div className="p-6 text-center text-slate-900">

            <div className="text-sm text-slate-500">
              اللعبة التي اخترتها
            </div>

            <div className="mt-2 text-2xl font-black">
              {selectedGame.name}
            </div>

            {prize?.prize_status === "used" && (
              <div className="mt-4 rounded-2xl bg-green-50 p-4 text-green-700">

                <div className="flex items-center justify-center gap-2 text-lg font-bold">
                  <CheckCircle2 className="h-6 w-6" />
                  تم تأكيد استلام الجائزة
                </div>

                {prize.prize_used_at && (
                  <div className="mt-2 text-xs text-green-600">
                    وقت التأكيد:{" "}
                    {new Date(
                      prize.prize_used_at
                    ).toLocaleString("ar-SA")}
                  </div>
                )}

              </div>
            )}

            <Button
              onClick={() => navigate("/prize")}
              className="mt-5 h-12 w-full bg-gradient-to-l from-amber-400 to-rose-500 text-base font-bold text-black hover:from-amber-300 hover:to-rose-400"
            >
              🎁 عرض جائزتي
            </Button>

          </div>
        </div>
      )}

      {/* الألعاب */}
      <div>

        <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold">
          <Gift className="h-5 w-5 text-amber-300" />

          {complete
            ? "الألعاب المفتوحة"
            : "الألعاب المتاحة"}
        </h2>

        <div className="grid grid-cols-2 gap-3">

          {GAMES.map((game) => {

            const isSelected =
              selectedGame?.key === game.key;

            return (
              <div
                key={game.key}
                className={`relative overflow-hidden rounded-2xl border ${
                  isSelected
                    ? "border-amber-400"
                    : "border-white/10"
                }`}
              >

                <div className="relative h-28 w-full sm:h-32">

                  <Image
                    src={game.image}
                    alt={game.name}
                    className={`h-full w-full ${
                      complete
                        ? ""
                        : "opacity-50 grayscale"
                    }`}
                    fittingType="fill"
                  />

                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                  {!complete && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white/80">
                        <Lock className="h-5 w-5" />
                      </div>
                    </div>
                  )}

                  {complete && (
                    <div className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-amber-400 text-black">
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                  )}

                  {isSelected && (
                    <div className="absolute right-2 top-2 rounded-full bg-green-500 px-2 py-1 text-xs font-bold text-white">
                      ✓ اختيارك
                    </div>
                  )}

                  <div className="absolute bottom-2 right-3 font-display text-base font-bold text-white drop-shadow">
                    {game.name}
                  </div>

                </div>
              </div>
            );
          })}

        </div>
      </div>

      {/* زر رفع فاتورة */}
      {!complete && (
        <Button
          onClick={() => navigate("/upload")}
          className="h-12 w-full bg-gradient-to-l from-amber-400 to-rose-500 text-base font-bold text-black hover:from-amber-300 hover:to-rose-400"
        >
          ارفع فاتورة
          <UploadCloud className="mr-2 h-5 w-5" />
        </Button>
      )}

    </div>
  );
}
