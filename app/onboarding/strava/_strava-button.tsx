"use client";

import { useFormStatus } from "react-dom";

/**
 * Official "Connect with Strava" button. Asset taken from Strava's brand
 * guidelines bundle (1.1-Connect-with-Strava-Buttons.zip), self-hosted at
 * /public/strava/. The SVG is 237 × 48, 6px corner radius, Strava
 * orange #FC5200. Don't recolour, don't add shadows, don't crop.
 */
export function StravaButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label="Connect with Strava"
      className="group relative inline-block transition-opacity hover:opacity-90 disabled:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FC5200] rounded-[6px]"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/strava/btn_strava_connect_with_orange.svg"
        alt=""
        width={237}
        height={48}
        className="block h-12 w-auto select-none"
        draggable={false}
      />
      {pending && (
        <span
          aria-hidden
          className="absolute inset-0 flex items-center justify-center rounded-[6px] bg-[#FC5200]/85"
        >
          <Spinner className="h-5 w-5 text-white" />
        </span>
      )}
    </button>
  );
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={`${className ?? ""} animate-spin`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-30"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"
      />
    </svg>
  );
}
