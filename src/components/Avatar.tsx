import Image from "next/image";

function initials(displayName: string | null): string {
  const parts = (displayName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({
  avatarUrl,
  displayName,
  size = 32,
  className = "",
}: {
  avatarUrl: string | null;
  displayName: string | null;
  size?: number;
  className?: string;
}) {
  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt={displayName ?? "Avatar"}
        width={size}
        height={size}
        className={`shrink-0 rounded-full object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-brand-gold/30 font-medium text-brand-green-dark ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials(displayName)}
    </span>
  );
}
