import React from "react";

type IconProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
  background?: string;
  opacity?: number;
  rotation?: number;
  shadow?: number;
  flipHorizontal?: boolean;
  flipVertical?: boolean;
  padding?: number;
};

const AmdIcon = ({
  size,
  color = "#000000",
  strokeWidth = 2,
  background = "transparent",
  opacity = 1,
  rotation = 0,
  shadow = 0,
  flipHorizontal = false,
  flipVertical = false,
  padding = 0,
}: IconProps) => {
  const transforms = [];
  if (rotation !== 0) transforms.push(`rotate(${rotation}deg)`);
  if (flipHorizontal) transforms.push("scaleX(-1)");
  if (flipVertical) transforms.push("scaleY(-1)");

  const viewBoxSize = 24 + padding * 2;
  const viewBoxOffset = -padding;
  const viewBox = `${viewBoxOffset} ${viewBoxOffset} ${viewBoxSize} ${viewBoxSize}`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={viewBox}
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        opacity,
        transform: transforms.join(" ") || undefined,
        filter:
          shadow > 0
            ? `drop-shadow(0 ${shadow}px ${shadow * 2}px rgba(0,0,0,0.3))`
            : undefined,
        backgroundColor: background !== "transparent" ? background : undefined,
      }}
    >
      <path fill="currentColor" d="M6.697 14.068H5.588l-.34-.818H3.4l-.31.818H2l1.667-4.133H4.86zM4.28 10.922l-.606 1.606h1.273zm6.447-.987h.897v4.133h-1.03v-2.582l-1.115 1.297H9.32l-1.115-1.297v2.582h-1.03V9.935h.897l1.327 1.533zm3.508 0c1.51 0 2.285.939 2.285 2.072c0 1.188-.751 2.061-2.4 2.061h-1.71V9.935zm-.794 3.376h.673c1.036 0 1.346-.704 1.346-1.31c0-.709-.382-1.309-1.358-1.309h-.66zm5.13-2.396l-1.3-1.3H22v4.73l-1.3-1.299v-2.131zm-.002.26l-1.338 1.338v1.872h1.872l1.338-1.337h-1.872z"/>
    </svg>
  );
};

export default AmdIcon;
