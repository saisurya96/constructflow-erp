"use client";

import { useEffect, useState } from "react";

const FMT: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };

/**
 * Render a timestamp in the *viewer's* timezone. Server components format in the
 * server's zone (UTC on Vercel) with no label, which an auditor in another zone
 * can misread. We render a clearly UTC-labelled value on the server, then swap
 * to the browser's local time after hydration. `suppressHydrationWarning` covers
 * the intended server→client text difference.
 */
export function LocalTime({ value }: { value: string | Date }) {
  const iso = typeof value === "string" ? value : value.toISOString();
  const [local, setLocal] = useState<string | null>(null);

  useEffect(() => {
    // The viewer's timezone is only knowable on the client, so we compute the
    // local-formatted string after mount (the server rendered a UTC fallback).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocal(new Intl.DateTimeFormat(undefined, FMT).format(new Date(iso)));
  }, [iso]);

  const utcFallback =
    new Intl.DateTimeFormat("en-GB", { ...FMT, timeZone: "UTC" }).format(new Date(iso)) +
    " UTC";

  return (
    <time dateTime={iso} suppressHydrationWarning>
      {local ?? utcFallback}
    </time>
  );
}
