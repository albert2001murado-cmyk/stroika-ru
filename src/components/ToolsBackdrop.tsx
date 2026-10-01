import { Hammer, PaintRoller, Ruler, Wrench } from "lucide-react";

/** Decorative only: never covers controls or captures pointer events. */
export default function ToolsBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-4 w-28 overflow-hidden text-white/[0.12] sm:right-8 sm:w-72">
      <Hammer className="stroika-tool-drift absolute right-1 top-4 h-14 w-14 sm:right-4 sm:h-20 sm:w-20" strokeWidth={1.25} />
      <Wrench className="stroika-tool-drift absolute bottom-3 right-12 h-12 w-12 sm:right-28 sm:h-16 sm:w-16" strokeWidth={1.25} style={{ animationDelay: "-3s" }} />
      <PaintRoller className="stroika-tool-drift absolute left-1 top-6 hidden h-14 w-14 sm:block" strokeWidth={1.25} style={{ animationDelay: "-6s" }} />
      <Ruler className="stroika-tool-drift absolute bottom-4 right-0 hidden h-12 w-12 sm:block" strokeWidth={1.25} style={{ animationDelay: "-8s" }} />
      <style>{`
        @keyframes stroika-tool-drift {
          0%, 100% { transform: translateY(0) rotate(-4deg); }
          50% { transform: translateY(-6px) rotate(3deg); }
        }
        .stroika-tool-drift { animation: stroika-tool-drift 10s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .stroika-tool-drift { animation: none; }
        }
      `}</style>
    </div>
  );
}
