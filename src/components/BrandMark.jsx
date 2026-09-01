export function BrandMark({ className = "", alt = "" }) {
  const basePath = import.meta.env.BASE_URL || "/";
  const src = `${basePath.replace(/\/?$/, "/")}icons/mybishbash-logo-mark.png`;
  return (
    <img
      className={`brand-logo-mark ${className}`.trim()}
      src={src}
      alt={alt}
    />
  );
}
