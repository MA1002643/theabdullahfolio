import { Inter } from "next/font/google";
import "./globals.css";
import clsx from "clsx";
import FireFliesBackground from "@/components/FireFliesBackground";
import { Toaster } from "sonner";
import LoaderWrapper from "@/components/loaderWrapper";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata = {
  title: "Muhammad Abdullah",
  description: "Muhammad Abdullah's Personal Portfolio",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" type="image/png" href="/background/logo.png" />
      </head>
      <body className={clsx(inter.variable, "bg-background text-foreground")}>
        <LoaderWrapper>
          {children}
        </LoaderWrapper>
        <FireFliesBackground />
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
