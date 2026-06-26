import { useEffect, useMemo, useRef, useState } from "react";
import "./landing.css";
import "./early-access.css";
import { isSupabaseConfigured, supabase } from "./lib/supabaseClient";
import { ContentEditProvider, EditableText, EditPanel, useContentEdit } from "./editing/ContentEditContext";
import { earlyAccessContent } from "./content/earlyAccessContent";

const HOME_HREF = `${import.meta.env.BASE_URL || "/"}`
  .replace(/\/+/g, "/")
  .replace(/\/$/, "/");
const BRAND_LOGO_SRC = `${HOME_HREF}icons/mybishbash-cover.png`;

// Campaign/audience attribution code (e.g. bishsocial). Captured from the
// signup link so we can see where interest comes from, persisted across
// landing navigation, and editable as a fallback. Stored normalized server-side.
const WAITLIST_SOURCE_STORAGE_KEY = "mybishbash.waitlist-source";
const SOURCE_QUERY_KEYS = ["ref", "source", "code", "utm_source"];

function readWaitlistSourceFromUrl() {
  if (typeof window === "undefined") return "";
  try {
    const params = new URLSearchParams(window.location.search);
    for (const key of SOURCE_QUERY_KEYS) {
      const value = params.get(key);
      if (value && value.trim()) return value.trim();
    }
  } catch {
    /* ignore malformed query strings */
  }
  return "";
}

function loadInitialWaitlistSource() {
  const fromUrl = readWaitlistSourceFromUrl();
  if (fromUrl) {
    try {
      window.localStorage.setItem(WAITLIST_SOURCE_STORAGE_KEY, fromUrl);
    } catch {
      /* storage may be unavailable */
    }
    return fromUrl;
  }
  try {
    return window.localStorage.getItem(WAITLIST_SOURCE_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

const PINNED_COUNTRIES = ["United Kingdom", "United States of America"];
const FALLBACK_COUNTRIES = [
  "Afghanistan",
  "Albania",
  "Algeria",
  "Andorra",
  "Angola",
  "Antigua and Barbuda",
  "Argentina",
  "Armenia",
  "Australia",
  "Austria",
  "Azerbaijan",
  "Bahamas",
  "Bahrain",
  "Bangladesh",
  "Barbados",
  "Belarus",
  "Belgium",
  "Belize",
  "Benin",
  "Bhutan",
  "Bolivia",
  "Bosnia and Herzegovina",
  "Botswana",
  "Brazil",
  "Brunei",
  "Bulgaria",
  "Burkina Faso",
  "Burundi",
  "Cambodia",
  "Cameroon",
  "Canada",
  "Cape Verde",
  "Central African Republic",
  "Chad",
  "Chile",
  "China",
  "Colombia",
  "Comoros",
  "Costa Rica",
  "Croatia",
  "Cuba",
  "Cyprus",
  "Czechia",
  "Denmark",
  "Djibouti",
  "Dominica",
  "Dominican Republic",
  "Ecuador",
  "Egypt",
  "El Salvador",
  "Equatorial Guinea",
  "Eritrea",
  "Estonia",
  "Eswatini",
  "Ethiopia",
  "Fiji",
  "Finland",
  "France",
  "Gabon",
  "Gambia",
  "Georgia",
  "Germany",
  "Ghana",
  "Greece",
  "Grenada",
  "Guatemala",
  "Guinea",
  "Guinea-Bissau",
  "Guyana",
  "Haiti",
  "Honduras",
  "Hungary",
  "Iceland",
  "India",
  "Indonesia",
  "Iran",
  "Iraq",
  "Ireland",
  "Israel",
  "Italy",
  "Jamaica",
  "Japan",
  "Jordan",
  "Kazakhstan",
  "Kenya",
  "Kiribati",
  "Kuwait",
  "Kyrgyzstan",
  "Laos",
  "Latvia",
  "Lebanon",
  "Lesotho",
  "Liberia",
  "Libya",
  "Liechtenstein",
  "Lithuania",
  "Luxembourg",
  "Madagascar",
  "Malawi",
  "Malaysia",
  "Maldives",
  "Mali",
  "Malta",
  "Marshall Islands",
  "Mauritania",
  "Mauritius",
  "Mexico",
  "Micronesia",
  "Moldova",
  "Monaco",
  "Mongolia",
  "Montenegro",
  "Morocco",
  "Mozambique",
  "Myanmar",
  "Namibia",
  "Nauru",
  "Nepal",
  "Netherlands",
  "New Zealand",
  "Nicaragua",
  "Niger",
  "Nigeria",
  "North Macedonia",
  "Norway",
  "Oman",
  "Pakistan",
  "Palau",
  "Panama",
  "Papua New Guinea",
  "Paraguay",
  "Peru",
  "Philippines",
  "Poland",
  "Portugal",
  "Qatar",
  "Romania",
  "Rwanda",
  "Saint Kitts and Nevis",
  "Saint Lucia",
  "Saint Vincent and the Grenadines",
  "Samoa",
  "San Marino",
  "Sao Tome and Principe",
  "Saudi Arabia",
  "Senegal",
  "Serbia",
  "Seychelles",
  "Sierra Leone",
  "Singapore",
  "Slovakia",
  "Slovenia",
  "Solomon Islands",
  "Somalia",
  "South Africa",
  "South Korea",
  "South Sudan",
  "Spain",
  "Sri Lanka",
  "Sudan",
  "Suriname",
  "Sweden",
  "Switzerland",
  "Syria",
  "Taiwan",
  "Tajikistan",
  "Tanzania",
  "Thailand",
  "Timor-Leste",
  "Togo",
  "Tonga",
  "Trinidad and Tobago",
  "Tunisia",
  "Turkey",
  "Turkmenistan",
  "Tuvalu",
  "Uganda",
  "Ukraine",
  "United Arab Emirates",
  "Uruguay",
  "Uzbekistan",
  "Vanuatu",
  "Vatican City",
  "Venezuela",
  "Vietnam",
  "Yemen",
  "Zambia",
  "Zimbabwe",
];

const PHONE_OPTIONS = [
  { value: "iPhone", label: "iPhone", icon: "apple" },
  { value: "Android", label: "Android", icon: "android" },
  { value: "Other", label: "Other", icon: "phone" },
];

const DISTRACTION_OPTIONS = ["Instagram", "TikTok", "YouTube", "Safari", "Chrome", "X", "Other"];
const AGE_OPTIONS = ["Under 18", "18-24", "25-34", "35-44", "45-54", "55+"];

function getCountryList() {
  if (typeof Intl !== "undefined" && typeof Intl.supportedValuesOf === "function") {
    try {
      const names = new Intl.DisplayNames(["en"], { type: "region" });
      const countries = Intl.supportedValuesOf("region")
        .map((code) => names.of(code))
        .filter(Boolean)
        .map((name) => (name === "United States" ? "United States of America" : name));
      return [...new Set([...countries, ...FALLBACK_COUNTRIES])]
        .filter((country) => !PINNED_COUNTRIES.includes(country))
        .sort((a, b) => a.localeCompare(b));
    } catch {
      return FALLBACK_COUNTRIES.filter((country) => !PINNED_COUNTRIES.includes(country));
    }
  }

  return FALLBACK_COUNTRIES.filter((country) => !PINNED_COUNTRIES.includes(country));
}

function BrandMark() {
  return (
    <img className="early-brand-mark" src={BRAND_LOGO_SRC} alt="" aria-hidden="true" />
  );
}

function Icon({ name }) {
  if (name === "apple") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M16.7 13.1c0-2 1.7-3 1.8-3.1-1-1.4-2.4-1.6-2.9-1.7-1.2-.1-2.4.7-3 0-.6-.6-1.6-.7-2.6-.7-1.3 0-2.6.8-3.2 2-1.4 2.4-.4 5.9 1 7.8.7 1 1.5 2 2.5 2 1 0 1.4-.6 2.6-.6s1.5.6 2.6.6 1.8-1 2.5-1.9c.8-1.1 1.1-2.2 1.1-2.3 0 0-2.4-.9-2.4-3.1Zm-1.9-6.2c.6-.8 1.1-1.8.9-2.9-.9 0-2 .6-2.7 1.3-.6.7-1.1 1.7-.9 2.8 1 .1 2-.5 2.7-1.2Z" />
      </svg>
    );
  }

  if (name === "android") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7.2 9.2h9.6v7.6c0 .8-.6 1.4-1.4 1.4h-.7v2.1c0 .5-.4.9-.9.9s-.9-.4-.9-.9v-2.1h-1.8v2.1c0 .5-.4.9-.9.9s-.9-.4-.9-.9v-2.1h-.7c-.8 0-1.4-.6-1.4-1.4V9.2Zm-2.6.2c.5 0 .9.4.9.9v5.6c0 .5-.4.9-.9.9s-.9-.4-.9-.9v-5.6c0-.5.4-.9.9-.9Zm14.8 0c.5 0 .9.4.9.9v5.6c0 .5-.4.9-.9.9s-.9-.4-.9-.9v-5.6c0-.5.4-.9.9-.9ZM8.6 4.6 7.7 3.1c-.1-.2 0-.4.2-.5.2-.1.4 0 .5.1l.9 1.6c.8-.3 1.7-.5 2.7-.5s1.9.2 2.7.5l.9-1.6c.1-.2.4-.3.5-.1.2.1.3.3.2.5l-.9 1.5c1.1.7 1.9 1.8 2.1 3.1H6.5c.2-1.3 1-2.4 2.1-3.1Zm1.1 1.8c.3 0 .6-.3.6-.6s-.3-.6-.6-.6-.6.3-.6.6.3.6.6.6Zm4.6 0c.3 0 .6-.3.6-.6s-.3-.6-.6-.6-.6.3-.6.6.3.6.6.6Z" />
      </svg>
    );
  }

  if (name === "phone") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="none" stroke="currentColor" strokeWidth="1.8" d="M8 3.8h8c.8 0 1.4.6 1.4 1.4v13.6c0 .8-.6 1.4-1.4 1.4H8c-.8 0-1.4-.6-1.4-1.4V5.2c0-.8.6-1.4 1.4-1.4Z" />
        <path d="M10.4 17.4h3.2" />
      </svg>
    );
  }

  if (name === "search") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="none" stroke="currentColor" strokeWidth="1.8" d="m20 20-4.5-4.5m2.4-5.4a7.8 7.8 0 1 1-15.6 0 7.8 7.8 0 0 1 15.6 0Z" />
      </svg>
    );
  }

  if (name === "lock") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="none" stroke="currentColor" strokeWidth="1.8" d="M7.5 10.2V8a4.5 4.5 0 0 1 9 0v2.2m-10.2 0h11.4v9H6.3v-9Z" />
      </svg>
    );
  }

  if (name === "arrow") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="none" stroke="currentColor" strokeWidth="2" d="M5 12h13m-5-5 5 5-5 5" />
      </svg>
    );
  }

  return null;
}

function BenefitIcon({ children }) {
  return <span className="early-benefit-icon">{children}</span>;
}

function CountryCombobox({ value, onChange, required = false }) {
  const allCountries = useMemo(getCountryList, []);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const filteredPinned = PINNED_COUNTRIES.filter((country) =>
    country.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const filteredCountries = allCountries.filter((country) =>
    country.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const options = [...filteredPinned, ...filteredCountries];

  useEffect(() => {
    if (!open) setQuery(value);
  }, [open, value]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  function chooseCountry(country) {
    onChange(country);
    setQuery(country);
    setOpen(false);
    inputRef.current?.focus();
  }

  function handleKeyDown(event) {
    if (!open && ["ArrowDown", "ArrowUp"].includes(event.key)) {
      setOpen(true);
      setActiveIndex(0);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, options.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && open) {
      event.preventDefault();
      if (options[activeIndex]) chooseCountry(options[activeIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
      setQuery(value);
    }
  }

  let lastHeading = "";

  return (
    <div className="country-combobox" ref={rootRef}>
      <div className={`country-field${open ? " is-open" : ""}${value ? " has-value" : ""}`}>
        <input
          ref={inputRef}
          type="text"
          value={open ? query : value}
          placeholder="Search for your country"
          required={required}
          role="combobox"
          aria-expanded={open}
          aria-controls="country-options"
          aria-autocomplete="list"
          onFocus={() => {
            setOpen(true);
            setQuery(value);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActiveIndex(0);
            if (!event.target.value) onChange("");
          }}
          onKeyDown={handleKeyDown}
        />
        <Icon name="search" />
      </div>
      {open ? (
        <div className="country-menu" id="country-options" role="listbox">
          {filteredPinned.length > 0 ? (
            <div className="country-pinned">
              {filteredPinned.map((country, index) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={country === value}
                  className={`country-option is-pinned${options[activeIndex] === country ? " is-active" : ""}`}
                  key={country}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => chooseCountry(country)}
                >
                  <span aria-hidden="true">★</span>
                  {country}
                </button>
              ))}
              {filteredCountries.length > 0 ? <span className="country-divider" /> : null}
            </div>
          ) : null}
          {filteredCountries.length > 0 ? (
            filteredCountries.map((country, index) => {
              const heading = country.charAt(0).toUpperCase();
              const showHeading = heading !== lastHeading;
              lastHeading = heading;
              const optionIndex = filteredPinned.length + index;
              return (
                <div key={country}>
                  {showHeading ? <span className="country-heading">{heading}</span> : null}
                  <button
                    type="button"
                    role="option"
                    aria-selected={country === value}
                    className={`country-option${options[activeIndex] === country ? " is-active" : ""}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(optionIndex)}
                    onClick={() => chooseCountry(country)}
                  >
                    {country}
                  </button>
                </div>
              );
            })
          ) : (
            <p className="country-empty">No countries found.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function FieldLabel({ children, required = false, htmlFor }) {
  return (
    <label className="early-field-label" htmlFor={htmlFor}>
      {children}
      {required ? <span aria-label="required"> *</span> : null}
    </label>
  );
}

export default function EarlyAccessPage() {
  return (
    <ContentEditProvider
      initialContent={earlyAccessContent}
      storageKey="mybishbash.earlyAccessContentDraft.v1"
      saveEndpoint="/__save-early-access-content"
      saveLabel="src/content/earlyAccessContent.js"
      isContentCompatible={(value) => Array.isArray(value?.hero?.titleLines) && Array.isArray(value?.benefits)}
    >
      <EarlyAccessPageContent />
    </ContentEditProvider>
  );
}

function EarlyAccessPageContent() {
  const { content, editMode } = useContentEdit();
  const stopEditNavigation = editMode ? (event) => event.preventDefault() : undefined;
  const [form, setForm] = useState({
    email: "",
    country: "",
    phone_os: "",
    main_distraction_app: "",
    main_distraction_app_other: "",
    age_range: "",
    wants_beta_testing: false,
    consent_launch_updates: false,
    source_code: "",
  });
  const [status, setStatus] = useState("idle");

  // Capture the attribution code from the link (?ref=/?source=/?code=) once on
  // mount, without clobbering anything the visitor has typed.
  useEffect(() => {
    const captured = loadInitialWaitlistSource();
    if (captured) {
      setForm((current) => (current.source_code ? current : { ...current, source_code: captured }));
    }
  }, []);
  const [error, setError] = useState("");
  const submitLockRef = useRef(false);

  const canSubmit =
    form.email.trim() &&
    form.country.trim() &&
    form.phone_os &&
    form.consent_launch_updates &&
    status !== "loading";

  function updateField(name, value) {
    setForm((current) => ({
      ...current,
      [name]: value,
      ...(name === "main_distraction_app" && value !== "Other" ? { main_distraction_app_other: "" } : {}),
    }));
    setError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSubmit || submitLockRef.current) return;

    if (!form.email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }

    if (!isSupabaseConfigured()) {
      setError("Early access signup is not available yet. Please try again shortly.");
      return;
    }

    submitLockRef.current = true;
    setStatus("loading");
    setError("");

    const mainDistractionApp =
      form.main_distraction_app === "Other"
        ? form.main_distraction_app_other.trim() || "Other"
        : form.main_distraction_app;

    const payload = {
      email: form.email.trim(),
      country: form.country.trim(),
      phone_os: form.phone_os,
      age_range: form.age_range || null,
      main_distraction_app: mainDistractionApp || null,
      wants_beta_testing: form.wants_beta_testing,
      consent_launch_updates: form.consent_launch_updates,
      source_code: form.source_code.trim() || null,
    };

    let submitResult = null;
    let submitError = null;

    try {
      const { data, error } = await supabase.rpc("join_launch_waitlist", payload);
      submitResult = data;
      submitError = error;
    } catch (error) {
      submitError = error;
    }

    if (submitResult === "already_account") {
      submitLockRef.current = false;
      setStatus("idle");
      setError("Email address already used. Please log in with this email, or use a different email for the waitlist.");
      return;
    }

    if (submitResult === "already_waitlist") {
      submitLockRef.current = false;
      setStatus("idle");
      setError("Email address already used. You are already on the waitlist.");
      return;
    }

    if (submitResult === "invalid") {
      submitLockRef.current = false;
      setStatus("idle");
      setError("Please complete the required fields and try again.");
      return;
    }

    if (submitError || submitResult !== "created") {
      submitLockRef.current = false;
      setStatus("idle");
      setError("We could not add you to the list just now. Please check your details and try again.");
      return;
    }

    setStatus("success");
  }

  return (
    <main className="early-page">
      <section className="early-shell" aria-labelledby="early-access-title">
        <header className="early-topbar">
          <a className="early-logo" href={HOME_HREF} aria-label="myBishBash home">
            <BrandMark />
            <EditableText as="span" path="brand" />
          </a>
          <a className="early-back-link" href={HOME_HREF} onClick={stopEditNavigation}>
            ← <EditableText path="back" />
          </a>
        </header>

        <div className="early-story">
          <div className="early-story-copy">
            <EditableText as="span" className="early-eyebrow" path="hero.eyebrow" />
            <h1 id="early-access-title">
              <EditableText path="hero.titleLines.0" />
              <br />
              <EditableText path="hero.titleLines.1" />
              <br />
              <EditableText as="span" path="hero.titleLines.2" />
            </h1>
            <EditableText as="p" className="early-subheading" path="hero.subheading" />

            <div className="early-benefits" aria-label="Early access benefits">
              {content.benefits.map((benefit, index) => (
                <article className="early-benefit" key={index}>
                  <BenefitIcon>
                    <BenefitSvg index={index} />
                  </BenefitIcon>
                  <div>
                    <EditableText as="h2" path={`benefits.${index}.0`} />
                    <EditableText as="p" path={`benefits.${index}.1`} />
                  </div>
                </article>
              ))}
            </div>
          </div>
          <div className="early-globe" aria-hidden="true" />
        </div>

        <aside className="early-form-panel" aria-label="Early access signup">
          {status === "success" ? (
            <div className="early-success" role="status">
              <span className="early-success-mark">✓</span>
              <EditableText as="h2" path="success.title" />
              <EditableText as="p" path="success.copy" />
              <EditableText as="small" path="success.small" />
            </div>
          ) : (
            <>
              <EditableText as="h2" path="form.title" />
              <EditableText as="p" className="early-form-intro" path="form.intro" />
              <form className="early-form" onSubmit={handleSubmit}>
                <div className="early-field">
                  <FieldLabel htmlFor="early-email" required>
                    <EditableText path="form.email" />
                  </FieldLabel>
                  <div className="early-input-wrap">
                    <input
                      id="early-email"
                      type="email"
                      value={form.email}
                      placeholder="you@example.com"
                      autoComplete="email"
                      required
                      onChange={(event) => updateField("email", event.target.value)}
                    />
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path fill="none" stroke="currentColor" strokeWidth="1.8" d="M4 6.5h16v11H4v-11Zm.6.8 7.4 5.4 7.4-5.4" />
                    </svg>
                  </div>
                </div>

                <div className="early-field is-country">
                  <FieldLabel required><EditableText path="form.country" /></FieldLabel>
                  <CountryCombobox
                    value={form.country}
                    onChange={(country) => updateField("country", country)}
                    required
                  />
                </div>

                <fieldset className="early-phone-field">
                  <legend>
                    <EditableText path="form.phone" /> <span>*</span>
                  </legend>
                  <div className="early-phone-options">
                    {PHONE_OPTIONS.map((option) => (
                      <button
                        type="button"
                        className={`early-phone-option${form.phone_os === option.value ? " is-selected" : ""}`}
                        aria-pressed={form.phone_os === option.value}
                        key={option.value}
                        onClick={() => updateField("phone_os", option.value)}
                      >
                        <Icon name={option.icon} />
                        <span>{option.label}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>

                <div className="early-field">
                  <FieldLabel htmlFor="early-distraction">
                    <EditableText path="form.distraction" /> <em>(optional)</em>
                  </FieldLabel>
                  <select
                    id="early-distraction"
                    value={form.main_distraction_app}
                    onChange={(event) => updateField("main_distraction_app", event.target.value)}
                  >
                    <option value="">Select an option</option>
                    {DISTRACTION_OPTIONS.map((option) => (
                      <option value={option} key={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  {form.main_distraction_app === "Other" ? (
                    <input
                      id="early-distraction-other"
                      type="text"
                      value={form.main_distraction_app_other}
                      placeholder="Which app or website?"
                      autoComplete="off"
                      onChange={(event) => updateField("main_distraction_app_other", event.target.value)}
                    />
                  ) : null}
                </div>

                <div className="early-field">
                  <FieldLabel htmlFor="early-age">
                    <EditableText path="form.age" /> <em>(optional)</em>
                  </FieldLabel>
                  <select
                    id="early-age"
                    value={form.age_range}
                    onChange={(event) => updateField("age_range", event.target.value)}
                  >
                    <option value="">Select your age range</option>
                    {AGE_OPTIONS.map((option) => (
                      <option value={option} key={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="early-field">
                  <FieldLabel htmlFor="early-source">
                    Referral / campaign code <em>(optional)</em>
                  </FieldLabel>
                  <input
                    id="early-source"
                    type="text"
                    autoComplete="off"
                    placeholder="e.g. bishsocial"
                    value={form.source_code}
                    onChange={(event) => updateField("source_code", event.target.value)}
                  />
                </div>

                <label className="early-checkbox-row">
                  <input
                    type="checkbox"
                    checked={form.wants_beta_testing}
                    onChange={(event) => updateField("wants_beta_testing", event.target.checked)}
                  />
                  <EditableText as="span" path="form.beta" />
                </label>

                <label className="early-checkbox-row">
                  <input
                    type="checkbox"
                    required
                    checked={form.consent_launch_updates}
                    onChange={(event) => updateField("consent_launch_updates", event.target.checked)}
                  />
                  <EditableText as="span" path="form.consent" />
                </label>

                {error ? <p className="early-error">{error}</p> : null}

                <button className="early-submit" type="submit" disabled={!canSubmit}>
                  {status === "loading" ? "Joining…" : <EditableText path="form.submit" />}
                  {status !== "loading" ? <Icon name="arrow" /> : <span className="early-spinner" aria-hidden="true" />}
                </button>

                <p className="early-privacy">
                  <Icon name="lock" />
                  We respect your privacy. No spam, ever.
                </p>
              </form>
            </>
          )}
        </aside>
      </section>
      <EditPanel />
    </main>
  );
}

function BenefitSvg({ index }) {
  const paths = [
    "M7 13.5c2.8-4.2 7.2-4.2 10 0M4.5 17c4.6-5.9 10.4-5.9 15 0M9.2 9.4a2.8 2.8 0 1 0 5.6 0 2.8 2.8 0 0 0-5.6 0Z",
    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0 0c2.2-2.4 3.4-5.4 3.4-9S14.2 5.4 12 3m0 18c-2.2-2.4-3.4-5.4-3.4-9S9.8 5.4 12 3M3.8 9h16.4M3.8 15h16.4",
    "M12 3.8 13.7 9l5.4 1.1-4.2 3.5.6 5.5-4.7-2.9-5 2.3 1.3-5.4-3.7-4.1 5.5-.5L12 3.8Z",
  ];
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="none" stroke="currentColor" strokeWidth="1.8" d={paths[index] ?? paths[0]} />
    </svg>
  );
}
