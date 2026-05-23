import { motion } from "framer-motion";

const ease = [0.16, 1, 0.3, 1];

const fadeUp = {
  hidden: { opacity: 0, y: 40, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 1.2, ease } }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.15 } }
};

export default function AnimatedFeatureSection() {
  return (
    <section className="py-32 px-6 bg-[#FAF8F5] text-[#050505]">
      <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-20 items-center">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={staggerContainer}
        >
          <motion.h3 variants={fadeUp} className="text-4xl md:text-5xl font-serif italic text-[#FF5A36] mb-6">
            Tiny choices.<br/>Real change.
          </motion.h3>
          <motion.p variants={fadeUp} className="text-lg text-zinc-600 font-light leading-relaxed mb-8">
            We don't believe in locking your phone away. We believe in replacing mindless loops with mindful decisions. Surface personal reminders, track your shifts in behaviour, and reclaim your time.
          </motion.p>
          <motion.div variants={fadeUp}>
            <ul className="space-y-6">
              <FeatureItem title="Remember what matters" desc="Surface personal reminders when they count." />
              <FeatureItem title="Pause intentionally" desc="Create checkpoints before distractions take over." />
              <FeatureItem title="Redirect your focus" desc="Choose where your time and energy go next." />
            </ul>
          </motion.div>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={fadeUp}
          className="relative"
        >
          <div className="bg-white rounded-[2rem] p-8 shadow-[0_20px_60px_rgba(0,0,0,0.05)] border border-zinc-100">
            <div className="flex justify-between items-start mb-12">
              <span className="text-xs font-bold uppercase tracking-widest text-[#FF5A36]">Personal Nudge</span>
              <HeartIcon className="w-5 h-5 text-[#FF5A36]" />
            </div>
            <h4 className="text-3xl font-medium tracking-tight mb-4">Have you read a book today?</h4>
            <p className="text-zinc-500 italic font-serif">a gentle nudge from your future self</p>
            <div className="mt-12 flex gap-3">
              <div className="h-12 flex-1 rounded-xl bg-zinc-50 border border-zinc-100 flex items-center justify-center text-sm font-medium text-zinc-400">Not yet</div>
              <div className="h-12 flex-1 rounded-xl bg-zinc-950 text-white flex items-center justify-center text-sm font-medium shadow-lg">Done</div>
            </div>
          </div>
          {/* Decorative background blur card */}
          <div className="absolute -inset-4 bg-gradient-to-br from-[#FF5A36]/10 to-[#FF5A36]/5 -z-10 blur-2xl rounded-[3rem]" />
        </motion.div>
      </div>
    </section>
  );
}

function FeatureItem({ title, desc }) {
  return (
    <div>
      <h4 className="text-lg font-medium text-zinc-900">{title}</h4>
      <p className="text-zinc-500 font-light">{desc}</p>
    </div>
  );
}

function HeartIcon(props) {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" {...props}>
      <path d="M16 27s-9-6-12-11c-3-5 0-11 6-11 3 0 5 1 6 4 1-3 3-4 6-4 6 0 9 6 6 11-3 5-12 11-12 11z" />
    </svg>
  );
}