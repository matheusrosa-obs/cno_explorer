import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000",
  ),
  title: {
    default: "Explorador do CNO",
    template: "%s | Explorador do CNO",
  },
  description: "Dados do Cadastro Nacional de Obras para Santa Catarina.",
  openGraph: {
    type: "website",
    title: "Explorador do CNO",
    description: "Dados do Cadastro Nacional de Obras para Santa Catarina.",
    url: "/",
    images: [
      {
        url: "/logo_dark.png",
        alt: "Logo do Explorador do CNO",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Explorador do CNO",
    description: "Dados do Cadastro Nacional de Obras para Santa Catarina.",
    images: ["/logo_dark.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
