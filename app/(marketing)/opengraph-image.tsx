import { ImageResponse } from "next/og";

/* The share card: the brand line on paper, with the pen circle around
 * "the runner." Mirrors the hero so links look like the site. */

export const alt =
  "Coach Casey. Plans know the run. Casey knows the runner. The AI running coach for marathoners on Strava.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/* Fetch a TTF from Google Fonts at build time. Google serves truetype to
 * unknown user agents, which is what ImageResponse needs. Falls back to
 * the default font rather than failing the build. */
async function loadGoogleFont(family: string, ital: 0 | 1, weight: number) {
  const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(
    family,
  )}:ital,wght@${ital},${weight}`;
  const css = await fetch(url).then((r) => r.text());
  const match = css.match(
    /src: url\((.+?)\) format\('(?:truetype|opentype)'\)/,
  );
  if (!match) throw new Error(`no ttf url for ${family}`);
  const res = await fetch(match[1]);
  return res.arrayBuffer();
}

type ImageFonts = NonNullable<
  ConstructorParameters<typeof ImageResponse>[1]
>["fonts"];

export default async function Image() {
  let fonts: ImageFonts;
  try {
    const [regular, italic] = await Promise.all([
      loadGoogleFont("Fraunces", 0, 500),
      loadGoogleFont("Fraunces", 1, 500),
    ]);
    fonts = [
      { name: "Fraunces", data: regular, style: "normal", weight: 500 },
      { name: "Fraunces", data: italic, style: "italic", weight: 500 },
    ];
  } catch {
    fonts = undefined;
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "#f3eee3",
          color: "#211c14",
          fontFamily: fonts ? "Fraunces" : "serif",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 76,
            lineHeight: 1.08,
            letterSpacing: "-0.03em",
          }}
        >
          <div style={{ display: "flex", color: "#6d6354" }}>
            Plans know&nbsp;<span style={{ fontStyle: "italic" }}>the run.</span>
          </div>
          <div style={{ display: "flex" }}>Casey knows</div>
          <div style={{ display: "flex", position: "relative" }}>
            <span>the runner.</span>
            <svg
              width="460"
              height="140"
              viewBox="0 0 100 42"
              preserveAspectRatio="none"
              style={{ position: "absolute", left: -22, top: -22 }}
            >
              <path
                d="M77 4.5 C91 7.5 98.5 15 97 23.5 C94.5 34.5 70 41 45 39.5 C19.5 38 2 30.5 2.5 19.5 C3 8.5 25 1.5 50 2 C63 2.2 76 3.5 86 7"
                fill="none"
                stroke="#58325f"
                strokeWidth="1.1"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            fontSize: 30,
          }}
        >
          <div style={{ display: "flex" }}>
            Coach&nbsp;
            <span style={{ fontStyle: "italic", color: "#58325f" }}>Casey</span>
          </div>
          <div style={{ display: "flex", color: "#6d6354", fontSize: 24 }}>
            The AI running coach for marathoners on Strava
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
