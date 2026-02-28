import type { ReactNode } from "react";

import { InteractiveBackground } from "@/components/InteractiveBackground";

import "./globals.css";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="theme-liquid">
        <div className="app-root">
          <InteractiveBackground />
          <div className="app-content">{children}</div>
        </div>
      </body>
    </html>
  );
}
