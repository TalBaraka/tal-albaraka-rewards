import React from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Gift,
  CheckCircle2,
  Clock,
  XCircle,
} from "lucide-react";

const ACTIVE_CUSTOMER_KEY =
  "tal_active_customer_id";

const GAMES = {
  memory: "لعبة الذاكرة",
  quiz: "مسابقة الأسئلة",
  puzzle: "لعبة الألغاز",
  racing: "سباق السيارات",
  math: "التحدي الحسابي",
  words: "لعبة الكلمات",
};

export default function PrizeBanner() {
  const navigate = useNavigate();

  const [customer, setCustomer] =
    React.useState(null);
  const [loading, setLoading] =
    React.useState(true);
  const [confirming, setConfirming] =
    React.useState(false);
  const [error, setError] =
    React.useState("");
  const [remaining, setRemaining] =
    React.useState("");

  async function loadCustomer() {
    try {
      const customerId =
        localStorage.getItem(
          ACTIVE_CUSTOMER_KEY
        ) ||
        localStorage.getItem(
          "tal_customer_id"
        );

      if (!customerId) {
        throw new Error(
          "لم يتم العثور على بيانات العميل."
        );
      }

      const { data, error } =
        await supabase
          .from("customers")
          .select(
            "id, name, approved_count, prize_status, prize_expires_at, game_selected, prize_used_at"
          )
          .eq("id", customerId)
          .single();

      if (error) {
        throw error;
      }

      setCustomer(data);
    } catch (e) {
      console.error(e);
      setError(
        e?.message ||
          "تعذر تحميل بيانات المكافأة."
      );
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    loadCustomer();
  }, []);

  React.useEffect(() => {
    if (
      !customer?.prize_expires_at ||
      customer.prize_status !== "available"
    ) {
      setRemaining("");
      return;
    }

    function updateTimer() {
      const end = new Date(
        customer.prize_expires_at
      ).getTime();

      const diff =
        end - Date.now();

      if (diff <= 0) {
        setRemaining("انتهت الصلاحية");
        return;
      }

      const hours = Math.floor(
        diff / 3600000
      );

      const minutes = Math.floor(
        (diff % 3600000) / 60000
      );

      const seconds = Math.floor(
        (diff % 60000) / 1000
      );

      setRemaining(
        `${String(hours).padStart(2, "0")}:${String(
          minutes
        ).padStart(2, "0")}:${String(
          seconds
        ).padStart(2, "0")}`
      );
    }

    updateTimer();

    const timer = setInterval(
      updateTimer,
      1000
    );

    return () =>
      clearInterval(timer);
  }, [
    customer?.prize_expires_at,
    customer?.prize_status,
  ]);

  async function confirmGift() {
    if (!customer) return;

    setConfirming(true);
    setError("");

    try {
      if (
        customer.prize_status !==
        "available"
      ) {
        throw new Error(
          "المكافأة غير متاحة حاليًا."
        );
      }

      if (
        customer.prize_expires_at &&
        new Date(
          customer.prize_expires_at
        ) <= new Date()
      ) {
        throw new Error(
          "انتهت مدة صلاحية المكافأة."
        );
      }

      if (!customer.game_selected) {
        throw new Error(
          "يرجى اختيار اللعبة أولًا."
        );
      }

      const { data, error } =
        await supabase
          .from("customers")
          .update({
            prize_status: "used",
            prize_used_at:
              new Date().toISOString(),
          })
          .eq("id", customer.id)
          .select(
            "id, name, approved_count, prize_status, prize_expires_at, game_selected, prize_used_at"
          )
          .single();

      if (error) {
        throw error;
      }

      setCustomer(data);

      localStorage.setItem(
        "tal_state",
        JSON.stringify(data)
      );

      localStorage.setItem(
        "tal_count",
        String(data.approved_count)
      );
    } catch (e) {
      console.error(e);

      setError(
        e?.message ||
          "تعذر تأكيد استلام الهدية."
      );
    } finally {
      setConfirming(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 text-center">
        جاري تحميل المكافأة...
      </div>
    );
  }

  if (error && !customer) {
    return (
      <div
        dir="rtl"
        className="p-6 text-center text-red-600"
      >
        {error}
      </div>
    );
  }

  if (!customer) {
    return null;
  }

  const gameName =
    GAMES[customer.game_selected] ||
    customer.game_selected;

  const expired =
    customer.prize_expires_at &&
    new Date(
      customer.prize_expires_at
    ) <= new Date();

  const available =
    customer.prize_status ===
      "available" &&
    !expired;

  const used =
    customer.prize_status === "used";

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-background p-4"
    >
      <div className="mx-auto max-w-2xl py-8">

        <Card>
          <CardContent className="space-y-6 p-6">

            <div className="text-center">
              <Gift className="mx-auto mb-3 h-14 w-14" />

              <h1 className="text-3xl font-bold">
                {used
                  ? "تم استلام هديتك 🎁"
                  : "مبروك! لديك هدية 🎁"}
              </h1>

              <p className="mt-2 text-muted-foreground">
                العميل:{" "}
                <strong>
                  {customer.name}
                </strong>
              </p>
            </div>

            <div className="rounded-xl border p-5 text-center">

              <div className="text-sm text-muted-foreground">
                اللعبة
              </div>

              <div className="mt-2 text-2xl font-bold">
                {gameName || "لم يتم اختيار اللعبة"}
              </div>

            </div>

            {available && (
              <>
                <div className="rounded-xl bg-muted p-5 text-center">

                  <Clock className="mx-auto mb-2 h-7 w-7" />

                  <div className="text-sm">
                    الوقت المتبقي لاستعمال الهدية
                  </div>

                  <div className="mt-2 text-3xl font-bold">
                    {remaining}
                  </div>

                </div>

                <div className="rounded-xl bg-green-50 p-4 text-center text-green-700">
                  عند استلام اللعبة فعليًا اضغط على زر
                  <strong className="mx-1">
                    تأكيد استلام الهدية
                  </strong>
                </div>

                {error && (
                  <div className="rounded-lg bg-red-50 p-4 text-center text-red-700">
                    {error}
                  </div>
                )}

                <Button
                  className="w-full"
                  size="lg"
                  onClick={confirmGift}
                  disabled={confirming}
                >
                  {confirming
                    ? "جاري التأكيد..."
                    : "تأكيد استلام الهدية"}
                </Button>
              </>
            )}

            {used && (
              <div className="rounded-xl bg-green-50 p-5 text-center text-green-700">

                <CheckCircle2 className="mx-auto mb-3 h-10 w-10" />

                <div className="text-xl font-bold">
                  تم تأكيد استلام الهدية
                </div>

                <div className="mt-2 text-sm">
                  الهدية مسجلة في ملف العميل
                  ويمكن الاحتفاظ بها في السجل.
                </div>

                {customer.prize_used_at && (
                  <div className="mt-2 text-xs">
                    وقت التأكيد:{" "}
                    {new Date(
                      customer.prize_used_at
                    ).toLocaleString("ar-SA")}
                  </div>
                )}

              </div>
            )}

            {!used &&
              (expired ||
                customer.prize_status ===
                  "expired") && (
                <div className="rounded-xl bg-red-50 p-5 text-center text-red-700">

                  <XCircle className="mx-auto mb-3 h-10 w-10" />

                  <div className="text-xl font-bold">
                    انتهت صلاحية الهدية
                  </div>

                  <div className="mt-2 text-sm">
                    انتهت مدة الساعة المحددة لاستعمال المكافأة.
                  </div>

                </div>
              )}

            <Button
              variant="outline"
              className="w-full"
              onClick={() =>
                navigate("/my-rewards")
              }
            >
              عرض ملف مكافآتي
            </Button>

          </CardContent>
        </Card>

      </div>
    </div>
  );
                  }
