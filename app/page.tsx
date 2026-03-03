import Image from "next/image";

import DashboardEChartsMap from "@/components/dashboard-echarts-map";

export default function Home() {
  return (
    <main className="bg-background text-foreground font-sans">
      <section className="relative flex min-h-screen flex-col items-center justify-center px-6">
        <div className="relative mb-6 h-32 w-32 sm:h-20 sm:w-60">
          <Image
            src="/logo_dark.png"
            alt="Logo do Explorador do CNO"
            fill
            priority
            className="object-contain"
          />
        </div>
        
        <h1 className="text-center text-3xl font-semibold tracking-tight sm:text-5xl">
          Explorador do CNO
        </h1>

        <p className="mt-10 text-zinc-400">
          Dados do Cadastro Nacional de Obras para Santa Catarina.
        </p>

        <a
          href="#proxima"
          className="absolute bottom-10 left-1/2 -translate-x-1/2 rounded-full p-3 text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 before:pointer-events-none before:absolute before:inset-0 before:rounded-full before:border before:border-blue-500/70 before:animate-pulse before:transition-opacity before:duration-300 hover:before:border-blue-400/80 after:pointer-events-none after:absolute after:inset-0 after:rounded-full after:ring-2 after:ring-blue-400/30 after:opacity-0 hover:after:opacity-100 hover:after:animate-ping"
          aria-label="Role para baixo"
        >
          <span className="sr-only">Role para baixo</span>
          <svg
            className="h-6 w-6"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M12 5v14m0 0l6-6m-6 6l-6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </a>
      </section>

      <section id="proxima" className="min-h-screen px-6 py-16">
        <div className="mx-auto w-full max-w-5xl">
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
        Dashboard
          </h2>

          <p className="mt-5 text-zinc-400">
        Dados atualizados semanalmente. Última atualização: 02/03/2026.
          </p>

          <DashboardEChartsMap />
        </div>

        <div className="relative mx-auto mb-6 h-32 w-32 sm:h-20 sm:w-60">
          <Image
        src="/logo_dark.png"
        alt="Logo do Explorador do CNO"
        fill
        priority
        className="object-contain"
          />
        </div>
      </section>
    </main>
  );
}
