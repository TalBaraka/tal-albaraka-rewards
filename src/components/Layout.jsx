import { Outlet } from "react-router-dom";
import { Image } from "@/components/ui/image";

const LOGO =
  "https://media.base44.com/images/public/user_6aa5b6794b20a238746064f4/67690d900_file_00000000b9e88211a5be3d9760e16833.png";

export default function Layout() {
  return (
    <div dir="rtl" lang="ar" className="min-h-screen bg-[#0b0b0f] text-white font-body">
      <div className="pointer-events-none fixed inset-0 opacity-60" aria-hidden="true">
        <div className="absolute -top-40 right-1/4 h-96 w-96 rounded-full bg-amber-500/20 blur-[120px]" />
        <div className="absolute top-1/3 -left-20 h-80 w-80 rounded-full bg-rose-600/20 blur-[120px]" />
        <div className="absolute bottom-0 right-1/3 h-72 w-72 rounded-full bg-cyan-500/10 blur-[120px]" />
      </div>

      <header className="relative z-10 flex items-center justify-center py-6">
        <div className="flex items-center gap-3">
          <div className="h-14 w-14 overflow-hidden rounded-full ring-2 ring-amber-400/60 shadow-[0_0_30px_rgba(251,191,36,0.35)]">
            <Image src={LOGO} alt="تال البركة" className="h-full w-full" fittingType="fill" />
          </div>
          <div className="leading-tight">
            <div className="font-display text-xl font-bold tracking-tight">تال البركة</div>
            <div className="text-xs text-amber-300/80">Tal Al Baraka</div>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-2xl px-5 pb-16">
        <Outlet />
      </main>
    </div>
  );
}