"use client"

import React from "react"
import { parseColor } from "react-aria-components"

import { Button } from "@/components/ui/button"
import {
  ColorArea,
  ColorPicker,
  ColorSlider,
  ColorSwatch,
  ColorSwatchPicker,
  ColorSwatchPickerItem,
  ColorThumb,
  SliderTrack,
} from "@/components/ui/color"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"

type HexPickerProps = {
  color?: string
  label?: string
  showLabel?: boolean
  disabled?: boolean
  onChange?: (value: string) => void
}

export function HexPicker({
  color: colorValue = "#f00",
  label = "Hex Color",
  showLabel = true,
  disabled = false,
  onChange,
}: HexPickerProps) {
  const [color, setColor] = React.useState(parseColor(colorValue))
  const [inputValue, setInputValue] = React.useState(colorValue.toUpperCase())

  React.useEffect(() => {
    setColor(parseColor(colorValue))
    setInputValue(colorValue.toUpperCase())
  }, [colorValue])

  const handleColorChange = React.useCallback(
    (nextColor: typeof color) => {
      setColor(nextColor)
      const next = (() => {
        try {
          return nextColor.toString("hex")
        } catch {
          return colorValue
        }
      })()
      const upper = next.toUpperCase()
      setInputValue(upper)
      onChange?.(upper)
    },
    [colorValue, onChange]
  )

  if (disabled) {
    return (
      <Button
        variant="ghost"
        className="flex h-fit items-center gap-2 p-1"
        disabled
      >
        <ColorSwatch color={color} className="size-8 rounded-md border-2 opacity-45" />
        {showLabel ? label : null}
      </Button>
    )
  }

  return (
    <ColorPicker value={color} onChange={handleColorChange}>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" className="flex h-fit items-center gap-2 p-1">
            <ColorSwatch className="size-8 rounded-md border-2" />
            {showLabel ? label : null}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="center"
          sideOffset={8}
          className="w-[260px] max-w-[calc(100vw-32px)] p-0"
        >
          <div>
            <ColorArea
              colorSpace="hsb"
              xChannel="saturation"
              yChannel="brightness"
              className="h-[164px] w-full rounded-b-none border-b-0"
            >
              <ColorThumb className="z-50" />
            </ColorArea>
            <ColorSlider colorSpace="hsb" channel="hue">
              <SliderTrack className="w-full rounded-t-none border-t-0">
                <ColorThumb className="top-1/2" />
              </SliderTrack>
            </ColorSlider>
          </div>
          <div className="grid gap-3 p-3">
            <div className="grid gap-2 text-sm">
              <Label>Hex</Label>
              <Input
                value={inputValue}
                onChange={(event) => {
                  const next = event.target.value.toUpperCase()
                setInputValue(next)
                const normalized = next.startsWith("#") ? next : `#${next}`
                if (/^#[0-9A-F]{6}$/.test(normalized)) {
                  try {
                    handleColorChange(parseColor(normalized))
                  } catch {
                    // ignore invalid input
                  }
                }
                }}
                spellCheck={false}
              />
            </div>
            <ColorSwatchPicker className="w-full">
              <ColorSwatchPickerItem color="#F00">
                <ColorSwatch />
              </ColorSwatchPickerItem>
              <ColorSwatchPickerItem color="#f90">
                <ColorSwatch />
              </ColorSwatchPickerItem>
              <ColorSwatchPickerItem color="#0F0">
                <ColorSwatch />
              </ColorSwatchPickerItem>
              <ColorSwatchPickerItem color="#08f">
                <ColorSwatch />
              </ColorSwatchPickerItem>
              <ColorSwatchPickerItem color="#00f">
                <ColorSwatch />
              </ColorSwatchPickerItem>
            </ColorSwatchPicker>
          </div>
        </PopoverContent>
      </Popover>
    </ColorPicker>
  )
}
HexPicker.displayName = "HexPicker"
