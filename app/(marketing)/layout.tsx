import type { Viewport } from "next";
import { Fraunces, Edu_NSW_ACT_Foundation } from "next/font/google";
import "./marketing.css";

/* Display face: Fraunces variable, with the SOFT and WONK axes exposed so
 * italics can lean into their hand-cut character. Body serif and mono come
 * from the root layout (Newsreader, Plex Mono). */
const fraunces = Fraunces({
  variable: "--rd-font-display",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["SOFT", "WONK", "opsz"],
  display: "swap",
});

/* The coach's pen. Edu NSW ACT Foundation is the handwriting style taught
 * in NSW schools, which is exactly the right joke for a coach in Sydney. */
const hand = Edu_NSW_ACT_Foundation({
  variable: "--rd-font-hand",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

/* The marketing site is print: light only, paper-toned chrome. */
export const viewport: Viewport = {
  themeColor: "#f3eee3",
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`rd ${fraunces.variable} ${hand.variable}`}>
      {children}
    </div>
  );
}
