"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function scenarioEditorScrollKey(pathname: string) {
  return `scenario-editor-scroll:${pathname}`;
}

export default function RestoreScrollOnLoad() {
  const pathname = usePathname();

  useEffect(() => {
    const key = scenarioEditorScrollKey(pathname);
    const savedValue = sessionStorage.getItem(key);
    if (!savedValue) {
      return;
    }

    sessionStorage.removeItem(key);
    const scrollY = Number(savedValue);
    if (!Number.isFinite(scrollY)) {
      return;
    }

    requestAnimationFrame(() => {
      window.scrollTo({ top: scrollY, behavior: "auto" });
    });
  }, [pathname]);

  return null;
}
