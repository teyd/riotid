"use client";
import { HoverIcon } from "@/components/kit/icon-image";
import { useIcon } from "@/components/browser/icon-tile";
import { MIXED, mixedColor, usePrefs } from "@/components/browser/prefs";
import type { IconMeta } from "@/lib/icons";

/** The hover motion written out, beside a small live icon that plays it while the row is hovered. */
export function MotionDemo({ meta, text }: { meta: IconMeta; text: string }) {
  const [prefs] = usePrefs();
  const icon = useIcon(meta);
  const color = prefs.color === MIXED ? mixedColor(meta.name) : prefs.color;
  return (
    <div data-kubai-trigger className="flex items-start gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-control bg-surface">
        {icon ? <HoverIcon icon={icon} size={28} color={color} variant={prefs.variant} /> : null}
      </span>
      <span className="pt-2">{text}</span>
    </div>
  );
}
