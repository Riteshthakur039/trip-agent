import type { Metadata } from "next";
import "@copilotkit/react-ui/v2/styles.css";
import "leaflet/dist/leaflet.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Meridian — Bespoke Travel Atelier",
  description:
    "An ultra-luxury autonomous travel studio orchestrating seamless transit, curated stays, and bespoke itineraries with discretion.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
