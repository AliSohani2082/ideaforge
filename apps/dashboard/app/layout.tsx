import type { ReactNode } from "react";

import { APP_NAME } from "../lib/constants";

export const metadata = {
  title: APP_NAME,
  description: "Evidence-based idea evaluation - dashboard (placeholder)",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
