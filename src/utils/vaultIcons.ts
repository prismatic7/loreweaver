import {
  FileText,
  Swords,
  Shield,
  Scroll,
  Book,
  BookOpen,
  Map,
  MapPin,
  Skull,
  Crown,
  Gem,
  Flame,
  Sparkles,
  Compass,
  Castle,
  Users,
  User,
  Key,
  Dice6,
  Feather,
  Heart,
  Eye,
  Ghost,
  Hourglass,
  Flag,
  Package,
  AudioLines,
  Image as ImageIcon,
  type LucideIcon,
} from "lucide-react";

export const VAULT_ICONS: Record<string, LucideIcon> = {
  FileText,
  Swords,
  Shield,
  Scroll,
  Book,
  BookOpen,
  Map,
  MapPin,
  Skull,
  Crown,
  Gem,
  Flame,
  Sparkles,
  Compass,
  Castle,
  Users,
  User,
  Key,
  Dice6,
  Feather,
  Heart,
  Eye,
  Ghost,
  Hourglass,
  Flag,
  Package,
};

export interface NoteIconProps {
  type?: string;
  iconName?: string;
  path?: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Returns the appropriate Lucide icon component for a note based on
 * explicit frontmatter icon, note type, or file extension.
 */
export function getNoteIconComponent({
  type,
  iconName,
  path = "",
}: {
  type?: string;
  iconName?: string;
  path?: string;
}): LucideIcon {
  if (iconName && VAULT_ICONS[iconName]) {
    return VAULT_ICONS[iconName];
  }

  const isCanvas =
    type === "Canvas" ||
    path.endsWith(".canvas.md") ||
    path.endsWith(".canvas");

  if (isCanvas) return Map;
  if (type === "Character" || type === "NPC") return User;
  if (type === "Location" || type === "City") return MapPin;
  if (type === "Item" || type === "Artifact") return Swords;
  if (type === "AUDIO") return AudioLines;
  if (type === "IMAGE") return ImageIcon;
  if (type === "Rule" || type === "Rulebook") return BookOpen;
  if (type === "Quest") return Flag;
  if (type === "Faction") return Shield;

  return FileText;
}
