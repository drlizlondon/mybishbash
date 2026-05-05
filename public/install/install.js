(function () {
  const defaults = {
    bishbash: {
      id: "bishbash",
      name: "BishBash",
      iconSrc: "/bishbash/icons/bishbash-cover.png",
      manifestHref: "/bishbash/manifest.webmanifest",
      realAppLabel: "",
      appUrl: "",
      manualUrl: "",
      launchPath: "/home",
    },
    safari: {
      id: "safari",
      name: "Safari",
      iconSrc: "/bishbash/icons/apple-touch-icon.png",
      manifestHref: "/bishbash/manifest.webmanifest",
      realAppLabel: "Safari",
      appUrl: "",
      manualUrl: "https://www.google.com",
      launchPath: "/intercept/safari",
      useInterruptionPack: true,
    },
    youtube: {
      id: "youtube",
      name: "YouTube",
      iconSrc: "/bishbash/icons/youtube-cover.png",
      manifestHref: "/bishbash/manifest.webmanifest",
      realAppLabel: "YouTube",
      appUrl: "youtube://",
      manualUrl: "https://www.youtube.com",
      launchPath: "/intercept/youtube",
      useInterruptionPack: true,
    },
    instagram: {
      id: "instagram",
      name: "Instagram",
      iconSrc: "/bishbash/icons/instagram-cover.jpg",
      manifestHref: "/bishbash/manifest.webmanifest",
      realAppLabel: "Instagram",
      appUrl: "instagram://app",
      manualUrl: "https://www.instagram.com",
      launchPath: "/intercept/instagram",
      useInterruptionPack: true,
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
  if (version.id === "bishbash") {
    version.iconSrc = defaults.bishbash.iconSrc;
    version.customIconSrc = "";
    version.realAppLabel = "";
    version.appUrl = "";
    version.manualUrl = "";
  }
  const iconSrc = version.customIconSrc || version.iconSrc;
  const iconType = iconSrc.includes("image/jpeg") || /\.jpe?g(?:$|\?)/i.test(iconSrc) ? "image/jpeg" : "image/png";

  document.title = `${version.name} · BishBash`;

  const appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
  if (appleTitle) appleTitle.setAttribute("content", version.name);

  const touchIcon = document.querySelector('link[rel="apple-touch-icon"]');
  if (touchIcon) touchIcon.setAttribute("href", iconSrc);

  const manifestLink = document.querySelector('link[rel="manifest"]');
  if (manifestLink) {
    const startUrl = new URL(`/bishbash${version.launchPath}`, window.location.origin).toString();
    const manifest = {
      name: version.name,
      short_name: version.name,
      id: startUrl,
      start_url: startUrl,
      scope: new URL("/bishbash/", window.location.origin).toString(),
      display: "standalone",
      background_color: "#F7F2EE",
      theme_color: "#F7F2EE",
      icons: [
        {
          src: iconSrc,
          sizes: "180x180",
          type: iconType,
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
    if (!version.realAppLabel) {
      realAppButton.hidden = true;
      return;
    }

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
      window.location.href = version.appUrl;
    });
  }
})();
