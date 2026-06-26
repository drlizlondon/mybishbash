import { motion } from "framer-motion";

const ease = [0.16, 1, 0.3, 1];
const BASE = import.meta.env.BASE_URL;

const fadeUp = {
  hidden: { opacity: 0, y: 40, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 1.0, ease } }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.15 } }
};

// Real app screenshots captured by scripts/capture-landing-screenshots.mjs.
const FEATURES = [
  {
    src: `${BASE}screenshots/hero-home.png`,
    label: "Nudge",
    title: "Personal nudges",
    desc: "Surface the things you genuinely mean to do — face routine, vitamins, a moment of gratitude — answerable in a tap.",
    alt: "myBishBash showing a personal nudge card: Have you done your face routine today?",
  },
  {
    src: `${BASE}screenshots/feature-pause.png`,
    label: "Pause",
    title: "Pause before you scroll",
    desc: "Open Instagram and myBishBash steps in first — a checkpoint before the apps that pull you in.",
    alt: "myBishBash intercepting before Instagram opens, with a continue-to-Instagram button",
  },
  {
    src: `${BASE}screenshots/feature-commit.png`,
    label: "Commit",
    title: "Make a commitment",
    desc: "Set one intention for the day and follow through — “I will go for a 20 minute walk after lunch.”",
    alt: "myBishBash commitment card: I will go for a 20 minute walk after lunch",
  },
];

export default function AnimatedFeatureSection() {
  return (
    <section id="features" className="py-32 px-6 bg-[#FAF8F5] text-[#050505]">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={staggerContainer}
          className="text-center mb-16"
        >
          <motion.h3 variants={fadeUp} className="text-4xl md:text-5xl font-serif italic text-[#FF5A36] mb-5">
            See it in action
          </motion.h3>
          <motion.p variants={fadeUp} className="text-lg text-zinc-600 font-light leading-relaxed max-w-2xl mx-auto">
            We don't lock your phone away. We replace mindless loops with mindful decisions — three simple mechanics, woven into the apps you already open.
          </motion.p>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={staggerContainer}
          className="grid gap-12 md:grid-cols-3"
        >
          {FEATURES.map((feature) => (
            <motion.div key={feature.label} variants={fadeUp} className="flex flex-col items-center text-center">
              <div className="relative mb-7 w-full max-w-[244px]">
                <div className="rounded-[2rem] border-[5px] border-zinc-900 overflow-hidden shadow-[0_24px_60px_rgba(0,0,0,0.16)] bg-zinc-900">
                  <img
                    src={feature.src}
                    alt={feature.alt}
                    width="430"
                    height="932"
                    loading="lazy"
                    className="block w-full h-auto"
                  />
                </div>
                <div className="absolute -inset-3 bg-gradient-to-br from-[#FF5A36]/10 to-[#FF5A36]/5 -z-10 blur-2xl rounded-[3rem]" />
              </div>
              <span className="text-xs font-bold uppercase tracking-widest text-[#FF5A36] mb-2">{feature.label}</span>
              <h4 className="text-2xl font-medium tracking-tight mb-3">{feature.title}</h4>
              <p className="text-zinc-500 font-light leading-relaxed max-w-xs">{feature.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
