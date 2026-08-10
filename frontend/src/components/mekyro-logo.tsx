type MekyroLogoProps = {
  alt?: string;
  className?: string;
  height?: number;
  priority?: boolean;
  surface?: "dark" | "light";
  width?: number;
};

export function MekyroLogo({
  alt = "Mekyro",
  className,
  height = 40,
  surface = "dark",
  width = 160,
}: MekyroLogoProps) {
  return (
    <img
      alt={alt}
      className={className}
      height={height}
      src={surface === "light" ? "/brand/mekyro-logo-light.png" : "/brand/mekyro-logo-dark.png"}
      width={width}
    />
  );
}
