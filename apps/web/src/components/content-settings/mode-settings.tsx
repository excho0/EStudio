"use client";

import type { ReactNode } from "react";
import type { ContentModeSection } from "@/lib/content/modes/ui-registry";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { SlidersHorizontal } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

const slideInOut = {
  initial: { opacity: 0, y: -14, height: 0 },
  animate: { opacity: 1, y: 0, height: "auto" as const },
  exit: { opacity: 0, y: -10, height: 0 },
  transition: { duration: 0.18, ease: "easeOut" as const },
};

type ModeSettingsRendererProps = {
  sections: ContentModeSection[];
  renderField: (field: ContentModeSection["fields"][number]) => ReactNode;
  shouldRenderSection?: (section: ContentModeSection) => boolean;
  shouldRenderGroup?: (group: NonNullable<ContentModeSection["groups"]>[number]) => boolean;
  shouldRenderField?: (field: ContentModeSection["fields"][number]) => boolean;
};

export const ModeSettingsRenderer = ({
  sections,
  renderField,
  shouldRenderSection,
  shouldRenderGroup,
  shouldRenderField,
}: ModeSettingsRendererProps) => (
  <>
    {sections.map((section, sectionIndex) => {
      if (shouldRenderSection && !shouldRenderSection(section)) {
        return null;
      }
      const visibleSectionFields = shouldRenderField
        ? section.fields.filter((field) => shouldRenderField(field))
        : section.fields;
      const visibleGroups = (section.groups ?? []).filter((group) => {
        if (shouldRenderGroup && !shouldRenderGroup(group)) return false;
        const visibleGroupFields = shouldRenderField
          ? group.fields.filter((field) => shouldRenderField(field))
          : group.fields;
        return visibleGroupFields.length > 0;
      });
      if (visibleSectionFields.length === 0 && visibleGroups.length === 0) {
        return null;
      }
      return (
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
            {visibleSectionFields.length > 0 && (
              <div
                className={
                  section.layout === "list"
                    ? "space-y-3"
                    : visibleGroups.length
                      ? "mb-3 grid gap-3 sm:grid-cols-2"
                      : "grid gap-3 sm:grid-cols-2"
                }
              >
                <AnimatePresence initial={false} mode="popLayout">
                  {visibleSectionFields.map((field) => (
                    <motion.div key={field.key} layout {...slideInOut}>
                      {renderField(field)}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
            {visibleGroups.length > 0 && (
              <div
                className={
                  section.layout === "list"
                    ? "space-y-3"
                    : "grid gap-3 sm:grid-cols-2"
                }
              >
                <AnimatePresence initial={false} mode="popLayout">
                  {visibleGroups.map((group) => {
                  const visibleGroupFields = shouldRenderField
                    ? group.fields.filter((field) => shouldRenderField(field))
                    : group.fields;
                  return (
                    <motion.div key={`${sectionIndex}-${group.id}`} layout {...slideInOut}>
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
                          <AnimatePresence initial={false} mode="popLayout">
                            {visibleGroupFields.map((field) => (
                              <motion.div key={field.key} layout {...slideInOut}>
                                {renderField(field)}
                              </motion.div>
                            ))}
                          </AnimatePresence>
                        </div>
                      </CollapsibleContent>
                      </Collapsible>
                    </motion.div>
                  );
                  })}
                </AnimatePresence>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      );
    })}
  </>
);
