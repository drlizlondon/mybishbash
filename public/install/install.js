(function () {
  const defaults = {
    safari: {
      id: "safari",
      name: "Safari",
      iconSrc: "/bishbash/icons/apple-touch-icon.png",
      manifestHref: "/bishbash/safari/manifest.webmanifest",
      realAppLabel: "Safari",
      appUrl: "",
      fallbackUrl: "https://www.google.com",
    },
    youtube: {
      id: "youtube",
      name: "YouTube",
      iconSrc: "/bishbash/icons/youtube-cover.png",
      manifestHref: "/bishbash/youtube/manifest.webmanifest",
      realAppLabel: "YouTube",
      appUrl: "youtube://",
      fallbackUrl: "https://www.youtube.com",
    },
    instagram: {
      id: "instagram",
      name: "Instagram",
      iconSrc: "/bishbash/icons/instagram-cover.jpg",
      manifestHref: "/bishbash/instagram/manifest.webmanifest",
      realAppLabel: "Instagram",
      appUrl: "instagram://app",
      fallbackUrl: "https://www.instagram.com",
    },
  };

  const pathParts = window.location.pathname.split("/").filter(Boolean);
  const versionId = pathParts[pathParts.length - 1] || pathParts[pathParts.length - 2] || "safari";
  const baseVersion = defaults[versionId] || defaults.safari;

  let stored = {};
  try {
    stored = JSON.parse(window.localStorage.getItem("bishbash.home-screen-versions.v1") || "{}");
  } catch {
    stored = {};
  }

  const version = { ...baseVersion, ...(stored[versionId] || {}) };
  const iconSrc = version.customIconSrc || version.iconSrc;

  document.title = `${version.name} · BishBash`;

  const appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
  if (appleTitle) appleTitle.setAttribute("content", version.name);

  const touchIcon = document.querySelector('link[rel="apple-touch-icon"]');
  if (touchIcon) touchIcon.setAttribute("href", iconSrc);

  const manifestLink = document.querySelector('link[rel="manifest"]');
  if (manifestLink) {
    const manifest = {
      name: version.name,
      short_name: version.name,
      id: `https://drlizlondon.github.io/bishbash/${versionId}/`,
      start_url: `https://drlizlondon.github.io/bishbash/?disguise=${versionId}`,
      scope: "https://drlizlondon.github.io/bishbash/",
      display: "standalone",
      background_color: "#F7F2EE",
      theme_color: "#F7F2EE",
      icons: [
        {
          src: iconSrc,
          sizes: "180x180",
          type: "image/png",
        },
      ],
    };

    const manifestBlob = new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" });
    manifestLink.setAttribute("href", URL.createObjectURL(manifestBlob));
  }

  const iconImage = document.querySelector("[data-install-icon]");
  if (iconImage) {
    iconImage.src = iconSrc;
    iconImage.alt = `${version.name} icon`;
  }

  const versionName = document.querySelector("[data-version-name]");
  if (versionName) versionName.textContent = version.name;

  const realAppButton = document.querySelector("[data-real-app-button]");
  if (realAppButton) {
    realAppButton.querySelector("span").textContent = version.realAppLabel;
    realAppButton.setAttribute("aria-label", `Open ${version.realAppLabel}`);
    realAppButton.addEventListener("click", () => {
      if (version.id === "safari") {
        const isStandalone =
          window.matchMedia?.("(display-mode: standalone)").matches ||
          window.navigator.standalone === true;
        const target = isStandalone ? "x-safari-https://www.google.com" : "https://www.google.com";
        if (isStandalone) {
          window.location.href = target;
          return;
        }
        window.open(target, "_blank", "noopener,noreferrer");
        return;
      }

      let didHide = false;
      const handleVisibility = () => {
        if (document.visibilityState === "hidden") didHide = true;
      };

      document.addEventListener("visibilitychange", handleVisibility, true);
      window.location.href = version.appUrl;

      window.setTimeout(() => {
        document.removeEventListener("visibilitychange", handleVisibility, true);
        if (!didHide && document.visibilityState === "visible") {
          window.location.href = version.fallbackUrl;
        }
      }, 1000);
    });
  }
})();
