import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";
import { GAMES, GAME_BY_KEY } from "@/lib/games";
import { CheckCircle2, Loader2, PartyPopper, Home as HomeIcon } from "lucide-react";

export default function SelectGame() {
  const navigate = useNavigate();
  const [customerId, setCustomerId] = useState(null);
  const [name, setName] = useState("");
  const [count, setCount] = useState(0);
  const [selected, setSelected] = useState(null); // game key
  const [confirmed, setConfirmed] = useState(null); // game object
  const [busy, setBusy] = useState(false);

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
    if (cnt < 4) navigate("/upload");
  }, [navigate]);

  const pick = async (key) => {
    if (busy || !customerId) return;
    setSelected(key);
    setBusy(true);
    try {
      const res = await base44.functions.invoke("selectGame", {
        customer_id: customerId,
        game_key: key
      });
      const data = res?.data || res;
      if (data?.game_selected) {
        setConfirmed(GAME_BY_KEY(data.game_selected) || GAME_BY_KEY(key));
      }
    } catch (e) {
      setSelected(null);
    } finally {
      setBusy(false);
    }
  };

  const restart = () => {
    localStorage.removeItem("tal_customer_id");
    localStorage.removeItem("tal_customer_name");
    localStorage.removeItem("tal_count");
    navigate("/");
  };

  if (confirmed) {
    return (
      <div className="flex flex-col items-center text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300">
          <PartyPopper className="h-8 w-8" />
        </div>
        <h2 className="mt-5 font-display text-2xl font-bold">مبروك! 🎉</h2>
        <p className="mt-2 text-white/70">
          حصل <span className="font-bold text-amber-300">{name}</span> على لعبة مجانية
        </p>

        <div className="mt-6 w-full max-w-sm overflow-hidden rounded-3xl border border-amber-400/30 bg-white/5">
          <div className="relative h-44 w-full">
            <Image src={confirmed.image} alt={confirmed.name} className="h-full w-full" fittingType="fill" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
            <div className="absolute bottom-3 right-4 font-display text-2xl font-bold drop-shadow">{confirmed.name}</div>
          </div>
          <div className="flex items-center justify-center gap-2 p-4 text-sm text-emerald-200">
            <CheckCircle2 className="h-5 w-5" /> تم تأكيد اختيار اللعبة
          </div>
        </div>

        <button
          onClick={restart}
          className="mt-8 flex items-center gap-2 rounded-full border border-white/15 px-5 py-2.5 text-sm text-white/70 hover:bg-white/10"
        >
          <HomeIcon className="h-4 w-4" /> العودة للبداية
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="text-center">
        <h1 className="font-display text-2xl font-bold">اختر لعبتك المجانية</h1>
        <p className="mt-1 text-sm text-white/60">لقد أكملت {count} فواتير معتمدة — اختر لعبة واحدة</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {GAMES.map((g) => {
          const isSel = selected === g.key;
          return (
            <button
              key={g.key}
              onClick={() => pick(g.key)}
              disabled={busy}
              className={`group relative overflow-hidden rounded-2xl border text-right transition ${
                isSel
                  ? "border-amber-400 ring-2 ring-amber-400/50"
                  : "border-white/10 hover:border-amber-400/50"
              } ${busy && !isSel ? "opacity-50" : ""}`}
            >
              <div className="relative h-28 w-full sm:h-32">
                <Image src={g.image} alt={g.name} className="h-full w-full" fittingType="fill" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                {isSel && busy && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <Loader2 className="h-7 w-7 animate-spin text-amber-300" />
                  </div>
                )}
                {isSel && !busy && (
                  <div className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-amber-400 text-black">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                )}
                <div className="absolute bottom-2 right-3 font-display text-base font-bold drop-shadow">
                  {g.name}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}