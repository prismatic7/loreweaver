import React from "react";
import { Folder, FolderOpen, Package } from "lucide-react";
import { getNoteIconComponent, NoteIconProps } from "../utils/vaultIcons";

export const NoteIcon: React.FC<NoteIconProps> = ({
  type,
  iconName,
  path,
  size = 14,
  className,
  style,
}) => {
  const IconComponent = getNoteIconComponent({ type, iconName, path });
  return (
    <IconComponent
      size={size}
      className={className}
      style={{ flexShrink: 0, ...style }}
    />
  );
};

export const FolderIcon: React.FC<{
  folderName: string;
  isExpanded?: boolean;
  size?: number;
  style?: React.CSSProperties;
}> = ({ folderName, isExpanded, size = 14, style }) => {
  if (folderName === "Root") {
    return <Package size={size} style={{ flexShrink: 0, ...style }} />;
  }
  return isExpanded ? (
    <FolderOpen size={size} style={{ flexShrink: 0, ...style }} />
  ) : (
    <Folder size={size} style={{ flexShrink: 0, ...style }} />
  );
};
