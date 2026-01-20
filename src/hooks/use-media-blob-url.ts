/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useRef, useState } from "react";

export const useMediaBlobUrl = (url?: string | null) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const currentUrl = useRef<string | null>(null);

  useEffect(() => {
    if (!url) {
      if (currentUrl.current) {
        URL.revokeObjectURL(currentUrl.current);
        currentUrl.current = null;
      }
      return;
    }

    let active = true;
    setLoading(true);

    fetch(url)
      .then((response) => response.blob())
      .then((blob) => {
        if (!active) return;
        if (currentUrl.current) {
          URL.revokeObjectURL(currentUrl.current);
        }
        const nextUrl = URL.createObjectURL(blob);
        currentUrl.current = nextUrl;
        setBlobUrl(nextUrl);
      })
      .catch(() => {
        if (active) {
          setBlobUrl(null);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [url]);

  useEffect(
    () => () => {
      if (currentUrl.current) {
        URL.revokeObjectURL(currentUrl.current);
        currentUrl.current = null;
      }
    },
    []
  );

  return { blobUrl, loading };
};
