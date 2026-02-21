"use client";

import type { ReactNode } from "react";
import type { ContentModeSection } from "@/lib/content/modes/ui-registry";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { SlidersHorizontal } from "lucide-react";

type ModeSettingsRendererProps = {
  sections: ContentModeSection[];
  renderField: (field: ContentModeSection["fields"][number]) => ReactNode;
};

export const ModeSettingsRenderer = ({
  sections,
  renderField,
}: ModeSettingsRendererProps) => (
  <>
    {sections.map((section, sectionIndex) => (
      <Collapsible
        key={section.id}
        className="rounded-xl border border-slate-200 bg-white/80 p-3 shadow-sm dark:border-white/10 dark:bg-white/5"
      >
        <CollapsibleTrigger
          title={section.title}
          description={section.description}
          icon={section.icon ?? SlidersHorizontal}
        />
        <CollapsibleContent>
          {section.fields.length > 0 && (
            <div
              className={
                section.layout === "list"
                  ? "space-y-3"
                  : section.groups?.length
                    ? "mb-3 grid gap-3 sm:grid-cols-2"
                    : "grid gap-3 sm:grid-cols-2"
              }
            >
              {section.fields.map((field) => renderField(field))}
            </div>
          )}
          {section.groups && section.groups.length > 0 && (
            <div
              className={
                section.layout === "list"
                  ? "space-y-3"
                  : "grid gap-3 sm:grid-cols-2"
              }
            >
              {section.groups.map((group) => (
                <Collapsible
                  key={`${sectionIndex}-${group.id}`}
                  defaultOpen
                  className="rounded-lg border border-slate-200 bg-white/80 p-3 shadow-sm dark:border-white/10 dark:bg-white/5"
                >
                  <CollapsibleTrigger
                    title={group.title}
                    description={group.description}
                    icon={group.icon ?? SlidersHorizontal}
                    className="px-2 py-2 text-xs font-semibold text-slate-700 dark:text-zinc-200"
                  />
                  <CollapsibleContent className="p-2">
                    <div
                      className={
                        group.layout === "list"
                          ? "space-y-3"
                          : "grid gap-3 sm:grid-cols-2"
                      }
                    >
                      {group.fields.map((field) => renderField(field))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    ))}
  </>
);
