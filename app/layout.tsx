import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Prompt Eval",
  description:
    "Define a task, run prompts of varying specificity, and see how the changes affect the output.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      {/* Browser extensions (password managers, Grammarly, etc.) often inject
          attributes into the body and form fields before React hydrates, which
          shows up as a hydration mismatch. This silences that benign noise. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
