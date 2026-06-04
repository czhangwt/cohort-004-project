import { useState } from "react";
import { Form } from "react-router";
import { Star } from "lucide-react";
import { cn } from "~/lib/utils";

// ─── Star Rating Display ───
// Shows average star rating with count.
// Renders filled/half/empty stars plus "X.X (N reviews)" text.

export function StarRatingDisplay({
  average,
  count,
  className,
  showCount = true,
}: {
  average: number | null;
  count: number;
  className?: string;
  showCount?: boolean;
}) {
  if (count === 0 || average === null) {
    return (
      <span className={cn("text-xs text-muted-foreground", className)}>
        No ratings yet
      </span>
    );
  }

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <div className="flex items-center" aria-label={`${average} out of 5 stars`}>
        {[1, 2, 3, 4, 5].map((star) => {
          const fill = Math.min(1, Math.max(0, average - (star - 1)));
          return (
            <span key={star} className="relative inline-block size-3.5">
              {/* Empty star background */}
              <Star
                className="absolute inset-0 size-3.5 text-muted-foreground/30"
                fill="currentColor"
              />
              {/* Filled star overlay clipped to proportion */}
              {fill > 0 && (
                <span
                  className="absolute inset-0 overflow-hidden"
                  style={{ width: `${fill * 100}%` }}
                >
                  <Star
                    className="size-3.5 text-amber-400"
                    fill="currentColor"
                  />
                </span>
              )}
            </span>
          );
        })}
      </div>
      <span className="text-xs font-medium">{average}</span>
      {showCount && (
        <span className="text-xs text-muted-foreground">
          ({count})
        </span>
      )}
    </div>
  );
}

// ─── Star Rating Input ───
// Five clickable stars for submitting a rating.
// Renders a <Form> that POSTs to the current route with the selected rating.

export function StarRatingInput({
  currentRating,
  disabled = false,
}: {
  currentRating: number | null;
  disabled?: boolean;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(currentRating);
  const displayValue = hovered ?? selected ?? 0;

  return (
    <Form method="post" className="flex items-center gap-3">
      <input type="hidden" name="intent" value="rate" />
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="submit"
            name="rating"
            value={star}
            disabled={disabled}
            className={cn(
              "rounded p-0.5 transition-colors",
              disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:scale-110"
            )}
            onMouseEnter={() => !disabled && setHovered(star)}
            onMouseLeave={() => !disabled && setHovered(null)}
            onClick={() => setSelected(star)}
            aria-label={`${star} star${star !== 1 ? "s" : ""}`}
          >
            <Star
              className={cn(
                "size-5 transition-colors",
                star <= displayValue
                  ? "fill-amber-400 text-amber-400"
                  : "text-muted-foreground/40"
              )}
            />
          </button>
        ))}
      </div>
      {selected ? (
        <span className="text-sm text-muted-foreground">
          You rated {selected} star{selected !== 1 ? "s" : ""}
        </span>
      ) : (
        <span className="text-sm text-muted-foreground">Rate this course</span>
      )}
    </Form>
  );
}
