import * as TagsInputPrimitive from "@diceui/tags-input";
import { X } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/shared/utils";

function TagsInput({
  className,
  ...props
}: React.ComponentProps<typeof TagsInputPrimitive.Root>) {
  return (
    <TagsInputPrimitive.Root
      data-slot="tags-input"
      className={cn("flex w-95 flex-col gap-2", className)}
      {...props}
    />
  );
}

function TagsInputLabel({
  className,
  ...props
}: React.ComponentProps<typeof TagsInputPrimitive.Label>) {
  return (
    <TagsInputPrimitive.Label
      data-slot="tags-input-label"
      className={cn(
        "font-medium text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
        className,
      )}
      {...props}
    />
  );
}

function TagsInputList({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      tabIndex={-1}
      data-slot="tags-input-list"
      className={cn(
        "border-input file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 flex min-h-9 w-full min-w-0 flex-wrap items-center gap-1.5 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px] focus-within:shadow-xs",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}

function TagsInputInput({
  className,
  ...props
}: React.ComponentProps<typeof TagsInputPrimitive.Input>) {
  return (
    <TagsInputPrimitive.Input
      data-slot="tags-input-input"
      className={cn(
        "placeholder:text-muted-foreground flex  min-w-32 flex-1 bg-transparent text-base outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

function TagsInputItem({
  className,
  ...props
}: React.ComponentProps<typeof TagsInputPrimitive.Item>) {
  return (
    <TagsInputPrimitive.Item
      data-slot="tags-input-item"
      className={cn(
        "inline-flex max-w-[calc(100%-8px)] items-center gap-1.5 rounded border bg-transparent px-2.5 py-1 text-sm focus:outline-hidden data-disabled:cursor-not-allowed data-editable:select-none data-editing:bg-transparent data-disabled:opacity-50 data-editing:ring-1 data-editing:ring-ring [&:not([data-editing])]:pr-1.5 [&[data-highlighted]:not([data-editing])]:bg-accent [&[data-highlighted]:not([data-editing])]:text-accent-foreground",
        className,
      )}
      {...props}
    />
  );
}

function TagsInputItemText({
  className,
  ...props
}: React.ComponentProps<typeof TagsInputPrimitive.ItemText>) {
  return (
    <TagsInputPrimitive.ItemText
      data-slot="tags-input-item-text"
      className={cn("min-w-0 max-w-48 truncate", className)}
      {...props}
    />
  );
}

function TagsInputItemDelete({
  className,
  children,
  ...props
}: React.ComponentProps<typeof TagsInputPrimitive.ItemDelete>) {
  return (
    <TagsInputPrimitive.ItemDelete
      data-slot="tags-input-item-delete"
      className={cn(
        "size-4 shrink-0 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100",
        className,
      )}
      {...props}
    >
      {children ?? <X className="size-3.5" />}
    </TagsInputPrimitive.ItemDelete>
  );
}

function TagsInputClear({
  ...props
}: React.ComponentProps<typeof TagsInputPrimitive.Clear>) {
  return <TagsInputPrimitive.Clear data-slot="tags-input-clear" {...props} />;
}

export {
  TagsInput,
  TagsInputClear,
  TagsInputInput,
  TagsInputItem,
  TagsInputItemDelete,
  TagsInputItemText,
  TagsInputLabel,
  TagsInputList,
};
