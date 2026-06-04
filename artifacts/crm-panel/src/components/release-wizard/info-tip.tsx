import { HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLang } from "@/lib/i18n";

/**
 * Small circular help icon with a hover tooltip.
 * Relies on the global TooltipProvider mounted in App.tsx.
 */
export function InfoTip({ text }: { text: string }) {
  const { t } = useLang();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={t.releaseWizard.moreInfo}
          className="inline-flex items-center justify-center h-4 w-4 rounded-full text-muted-foreground hover:text-foreground focus-visible:text-foreground shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring align-middle"
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
