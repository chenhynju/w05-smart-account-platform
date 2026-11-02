import type { Metadata } from "next";
import "./style.css";
export const metadata: Metadata = {
  title: "W05 · Smart Account Platform",
  description:
    "Programmable accounts, scoped permissions, and transparent sponsorship.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
